/**
 * Timeline Module - Track and clip management
 */

const Timeline = (() => {
  let clips = [];
  let selectedClipId = null;
  let clipIdCounter = 0;
  let zoom = 1; // pixels per second
  const BASE_PPS = 50; // base pixels per second
  let playheadPosition = 0; // in seconds
  let undoStack = [];
  let redoStack = [];
  let onChangeCallbacks = [];
  let markers = []; // { id, time, label, color }
  let markerIdCounter = 0;
  let snapEnabled = true; // snapping on by default
  const SNAP_THRESHOLD = 10; // pixels
  const waveformCache = new Map(); // clipId -> Float32Array of waveform peaks

  // ==========================================
  // KEYFRAME SYSTEM
  // ==========================================
  // Keyframes stored on each clip: clip.keyframes = { property: [{ time, value }] }
  // Supported properties: opacity, volume, x, y, scale, rotation

  function addKeyframe(clipId, property, time, value) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    if (!clip.keyframes) clip.keyframes = {};
    if (!clip.keyframes[property]) clip.keyframes[property] = [];
    // Remove existing keyframe at same time
    clip.keyframes[property] = clip.keyframes[property].filter(k => Math.abs(k.time - time) > 0.05);
    clip.keyframes[property].push({ time, value });
    clip.keyframes[property].sort((a, b) => a.time - b.time);
    renderAllTracks();
    Accessibility.announce(`Keyframe added: ${property} = ${value} at ${Accessibility.formatTime(time)}`);
  }

  function removeKeyframe(clipId, property, time) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip || !clip.keyframes || !clip.keyframes[property]) return;
    saveState();
    clip.keyframes[property] = clip.keyframes[property].filter(k => Math.abs(k.time - time) > 0.05);
    if (clip.keyframes[property].length === 0) delete clip.keyframes[property];
    renderAllTracks();
    Accessibility.announce(`Keyframe removed: ${property} at ${Accessibility.formatTime(time)}`);
  }

  function getKeyframeValue(clip, property, time) {
    if (!clip.keyframes || !clip.keyframes[property] || clip.keyframes[property].length === 0) return null;
    const kfs = clip.keyframes[property];
    const relTime = time - clip.startTime;
    if (relTime <= kfs[0].time) return kfs[0].value;
    if (relTime >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
    // Linear interpolation between keyframes
    for (let i = 0; i < kfs.length - 1; i++) {
      if (relTime >= kfs[i].time && relTime <= kfs[i + 1].time) {
        const t = (relTime - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
        return kfs[i].value + t * (kfs[i + 1].value - kfs[i].value);
      }
    }
    return kfs[kfs.length - 1].value;
  }

  function getKeyframes(clipId, property) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip || !clip.keyframes) return [];
    if (property) return clip.keyframes[property] || [];
    return clip.keyframes;
  }

  // ==========================================
  // SPEED RAMPING
  // ==========================================
  // clip.speedRamp = [{ time, speed }] - variable speed over time
  function setSpeedRamp(clipId, rampPoints) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.speedRamp = rampPoints.sort((a, b) => a.time - b.time);
    renderAllTracks();
    Accessibility.announce(`Speed ramp set with ${rampPoints.length} points on "${clip.name}"`);
  }

  function getSpeedAtTime(clip, time) {
    if (!clip.speedRamp || clip.speedRamp.length === 0) return clip.speed || 1;
    const relTime = time - clip.startTime;
    const ramp = clip.speedRamp;
    if (relTime <= ramp[0].time) return ramp[0].speed;
    if (relTime >= ramp[ramp.length - 1].time) return ramp[ramp.length - 1].speed;
    for (let i = 0; i < ramp.length - 1; i++) {
      if (relTime >= ramp[i].time && relTime <= ramp[i + 1].time) {
        const t = (relTime - ramp[i].time) / (ramp[i + 1].time - ramp[i].time);
        return ramp[i].speed + t * (ramp[i + 1].speed - ramp[i].speed);
      }
    }
    return ramp[ramp.length - 1].speed;
  }

  // ==========================================
  // MARKERS / BOOKMARKS
  // ==========================================
  function addMarker(time, label, color) {
    const id = `marker-${++markerIdCounter}`;
    markers.push({ id, time, label: label || `Marker ${markerIdCounter}`, color: color || '#ffcc00' });
    renderAllTracks();
    Accessibility.announce(`Marker added at ${Accessibility.formatTime(time)}: ${label || 'Marker'}`);
    return id;
  }

  function removeMarker(markerId) {
    markers = markers.filter(m => m.id !== markerId);
    renderAllTracks();
    Accessibility.announce('Marker removed');
  }

  function getMarkers() { return [...markers]; }

  function getNextMarker(fromTime) {
    const future = markers.filter(m => m.time > fromTime + 0.1).sort((a, b) => a.time - b.time);
    return future.length > 0 ? future[0] : null;
  }

  function getPrevMarker(fromTime) {
    const past = markers.filter(m => m.time < fromTime - 0.1).sort((a, b) => b.time - a.time);
    return past.length > 0 ? past[0] : null;
  }

  // ==========================================
  // FREEZE FRAME
  // ==========================================
  function freezeFrame(clipId, time, duration) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    const relTime = time - clip.startTime;
    if (relTime < 0 || relTime > clip.duration) return;
    // Split at freeze point, insert a still frame clip
    const freezeDuration = duration || 3;
    const freezeClip = {
      id: generateId(),
      name: clip.name + ' (freeze)',
      type: clip.type,
      filePath: clip.filePath,
      startTime: time,
      duration: freezeDuration,
      trimStart: (clip.trimStart || 0) + relTime,
      trimEnd: 0,
      volume: 0, // silent freeze
      speed: 0, // paused
      filters: { ...clip.filters },
      text: '', fontSize: 48, textColor: '#ffffff', textPosition: 'center',
      transition: null, layer: clip.layer, detached: clip.detached,
      fadeIn: 0, fadeOut: 0, isFreezeFrame: true,
    };
    // Push everything after the freeze point forward
    clips.forEach(c => {
      if (c.id !== clip.id && c.startTime >= time && c.type === clip.type) {
        c.startTime += freezeDuration;
      }
    });
    // Split current clip
    const secondHalf = {
      ...clip,
      id: generateId(),
      name: clip.name + ' (after freeze)',
      startTime: time + freezeDuration,
      duration: clip.duration - relTime,
      trimStart: (clip.trimStart || 0) + relTime,
    };
    clip.duration = relTime;
    clips.push(freezeClip);
    clips.push(secondHalf);
    renderAllTracks();
    Accessibility.announce(`Freeze frame inserted at ${Accessibility.formatTime(time)} for ${freezeDuration} seconds`);
  }

  // ==========================================
  // KEN BURNS EFFECT (for image clips)
  // ==========================================
  // clip.kenBurns = { startX, startY, startScale, endX, endY, endScale }
  function setKenBurns(clipId, startX, startY, startScale, endX, endY, endScale) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.kenBurns = { startX, startY, startScale, endX, endY, endScale };
    renderAllTracks();
    Accessibility.announce(`Ken Burns effect applied to "${clip.name}": zoom from ${startScale}x to ${endScale}x`);
  }

  function clearKenBurns(clipId) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.kenBurns = null;
    renderAllTracks();
    Accessibility.announce('Ken Burns effect removed');
  }

  // ==========================================
  // CHROMA KEY (Green Screen)
  // ==========================================
  // clip.chromaKey = { color: '#00ff00', tolerance: 40, softness: 10 }
  function setChromaKey(clipId, color, tolerance, softness) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.chromaKey = { color: color || '#00ff00', tolerance: tolerance || 40, softness: softness || 10 };
    renderAllTracks();
    Accessibility.announce(`Chroma key applied to "${clip.name}" — removing ${color || 'green'} background`);
  }

  function clearChromaKey(clipId) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.chromaKey = null;
    renderAllTracks();
    Accessibility.announce('Chroma key removed');
  }

  // ==========================================
  // PICTURE-IN-PICTURE PRESETS
  // ==========================================
  const PIP_PRESETS = {
    'top-left': { x: 5, y: 5, scale: 0.25 },
    'top-right': { x: 70, y: 5, scale: 0.25 },
    'bottom-left': { x: 5, y: 70, scale: 0.25 },
    'bottom-right': { x: 70, y: 70, scale: 0.25 },
    'center-small': { x: 35, y: 35, scale: 0.3 },
    'side-by-side-left': { x: 0, y: 0, scale: 0.5 },
    'side-by-side-right': { x: 50, y: 0, scale: 0.5 },
    'top-third': { x: 0, y: 0, scale: 0.33 },
    'bottom-third': { x: 0, y: 67, scale: 0.33 },
  };

  function setPipPreset(clipId, presetName) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    const preset = PIP_PRESETS[presetName];
    if (!preset) return;
    saveState();
    clip.pip = { ...preset, preset: presetName };
    clip.detached = true;
    clip.layer = Math.max(1, clip.layer);
    renderAllTracks();
    Accessibility.announce(`Picture-in-picture "${presetName}" applied to "${clip.name}"`);
  }

  function getPipPresets() { return Object.keys(PIP_PRESETS); }

  // ==========================================
  // SNAPPING
  // ==========================================
  function toggleSnap(enabled) {
    snapEnabled = enabled !== undefined ? enabled : !snapEnabled;
    Accessibility.announce(`Snapping ${snapEnabled ? 'enabled' : 'disabled'}`);
  }

  function getSnapPoints() {
    const points = [0, playheadPosition];
    clips.forEach(c => {
      points.push(c.startTime);
      points.push(c.startTime + c.duration);
    });
    markers.forEach(m => points.push(m.time));
    return [...new Set(points)].sort((a, b) => a - b);
  }

  function snapTime(time) {
    if (!snapEnabled) return time;
    const pps = getPPS();
    const snapDist = SNAP_THRESHOLD / pps;
    const points = getSnapPoints();
    for (const p of points) {
      if (Math.abs(time - p) < snapDist) return p;
    }
    return time;
  }

  // ==========================================
  // TITLE TEMPLATES
  // ==========================================
  const TITLE_TEMPLATES = [
    { name: 'Simple Title', text: 'Your Title Here', fontSize: 64, textColor: '#ffffff', textPosition: 'center', duration: 5, style: 'simple' },
    { name: 'Lower Third', text: 'Name or Description', fontSize: 32, textColor: '#ffffff', textPosition: 'bottom', duration: 4, style: 'lower-third' },
    { name: 'Opening Credits', text: 'A Film By\nYour Name', fontSize: 48, textColor: '#ffffff', textPosition: 'center', duration: 6, style: 'credits' },
    { name: 'End Credits', text: 'Directed By\nYour Name\n\nProduced By\nYour Name', fontSize: 36, textColor: '#ffffff', textPosition: 'center', duration: 10, style: 'end-credits' },
    { name: 'Chapter Title', text: 'Chapter 1\nThe Beginning', fontSize: 56, textColor: '#ffffff', textPosition: 'center', duration: 4, style: 'chapter' },
    { name: 'Subtitle Card', text: 'Location — Date', fontSize: 28, textColor: '#cccccc', textPosition: 'bottom', duration: 3, style: 'subtitle-card' },
    { name: 'Bold Intro', text: 'BOLD STATEMENT', fontSize: 80, textColor: '#ff4444', textPosition: 'center', duration: 3, style: 'bold' },
    { name: 'Minimalist', text: 'clean.', fontSize: 36, textColor: '#888888', textPosition: 'center', duration: 4, style: 'minimalist' },
    { name: 'News Banner', text: 'BREAKING: Your headline here', fontSize: 28, textColor: '#ffffff', textPosition: 'bottom', duration: 5, style: 'news' },
    { name: 'Quote', text: '"Your inspirational quote here"\n— Author', fontSize: 40, textColor: '#e0e0e0', textPosition: 'center', duration: 6, style: 'quote' },
    { name: 'Countdown', text: '3...2...1...GO!', fontSize: 72, textColor: '#ffcc00', textPosition: 'center', duration: 4, style: 'countdown' },
    { name: 'Social Handle', text: '@yourhandle', fontSize: 44, textColor: '#1da1f2', textPosition: 'bottom', duration: 4, style: 'social' },
  ];

  function getTitleTemplates() { return TITLE_TEMPLATES; }

  function addTitleFromTemplate(templateIndex, startTime, customText) {
    const template = TITLE_TEMPLATES[templateIndex];
    if (!template) return;
    const id = addClip({
      name: 'Title: ' + template.name,
      type: 'text',
      text: customText || template.text,
      fontSize: template.fontSize,
      textColor: template.textColor,
      textPosition: template.textPosition,
      duration: template.duration,
      startTime: startTime ?? playheadPosition,
      titleStyle: template.style,
    });
    return id;
  }

  // ==========================================
  // AUTO-DUCK helpers
  // ==========================================
  function getAudioClipsAtTime(time) {
    return clips.filter(c => c.type === 'audio' && time >= c.startTime && time < c.startTime + c.duration);
  }

  function getVideoClipsWithAudioAtTime(time) {
    return clips.filter(c => c.type === 'video' && c.volume > 0 && time >= c.startTime && time < c.startTime + c.duration);
  }

  /** Generate unique clip ID */
  function generateId() {
    return `clip-${++clipIdCounter}`;
  }

  /** Save state for undo */
  function saveState() {
    undoStack.push(JSON.parse(JSON.stringify(clips)));
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
  }

  /** Undo last action */
  function undo() {
    if (undoStack.length === 0) {
      Accessibility.announce('Nothing to undo');
      return;
    }
    redoStack.push(JSON.parse(JSON.stringify(clips)));
    clips = undoStack.pop();
    renderAllTracks();
    Accessibility.announce('Undone');
    Accessibility.setStatus('Undo performed');
  }

  /** Redo last undone action */
  function redo() {
    if (redoStack.length === 0) {
      Accessibility.announce('Nothing to redo');
      return;
    }
    undoStack.push(JSON.parse(JSON.stringify(clips)));
    clips = redoStack.pop();
    renderAllTracks();
    Accessibility.announce('Redone');
    Accessibility.setStatus('Redo performed');
  }

  /** Add a clip to a track */
  function addClip(clipData) {
    saveState();
    const id = generateId();
    const clip = {
      id,
      name: clipData.name || 'Untitled',
      type: clipData.type || 'video', // 'video', 'audio', 'text'
      filePath: clipData.filePath || '',
      startTime: clipData.startTime ?? getTrackEndTime(clipData.type || 'video'),
      duration: clipData.duration || 5,
      trimStart: clipData.trimStart || 0,
      trimEnd: clipData.trimEnd || 0,
      volume: clipData.volume ?? 100,
      speed: clipData.speed || 1,
      filters: clipData.filters || {},
      text: clipData.text || '',
      fontSize: clipData.fontSize || 48,
      textColor: clipData.textColor || '#ffffff',
      textPosition: clipData.textPosition || 'center',
      transition: clipData.transition || null,
      layer: clipData.layer ?? 0, // 0 = main, 1+ = overlay layers
      detached: clipData.detached || false, // detached clips float independently
      fadeIn: clipData.fadeIn || 0,
      fadeOut: clipData.fadeOut || 0,
      keyframes: clipData.keyframes || null,
      speedRamp: clipData.speedRamp || null,
      chromaKey: clipData.chromaKey || null,
      kenBurns: clipData.kenBurns || null,
      pip: clipData.pip || null,
      isFreezeFrame: clipData.isFreezeFrame || false,
      titleStyle: clipData.titleStyle || null,
    };
    clips.push(clip);
    renderAllTracks();
    Accessibility.announce(`Added ${clip.type} clip: ${clip.name}, duration ${Accessibility.formatTime(clip.duration)}`);
    Accessibility.setStatus(`Clip added: ${clip.name}`);
    return id;
  }

  /** Get end time of last clip on a track */
  function getTrackEndTime(type) {
    const trackClips = clips.filter(c => c.type === type);
    if (trackClips.length === 0) return 0;
    return Math.max(...trackClips.map(c => c.startTime + c.duration));
  }

  /** Remove a clip */
  function removeClip(clipId) {
    saveState();
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    const name = clip.name;
    clips = clips.filter(c => c.id !== clipId);
    if (selectedClipId === clipId) selectedClipId = null;
    renderAllTracks();
    hideClipProperties();
    Accessibility.announce(`Deleted clip: ${name}`);
    Accessibility.setStatus(`Clip deleted: ${name}`);
  }

  /** Split clip at a given time */
  function splitClip(clipId, splitTime) {
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;

    const relativeTime = splitTime - clip.startTime;
    if (relativeTime <= 0.1 || relativeTime >= clip.duration - 0.1) {
      Accessibility.announce('Cannot split at this position');
      return;
    }

    saveState();

    const secondHalf = {
      ...clip,
      name: clip.name + ' (2)',
      startTime: splitTime,
      duration: clip.duration - relativeTime,
      trimStart: clip.trimStart + relativeTime,
    };

    clip.duration = relativeTime;
    clip.name = clip.name.replace(/ \(1\)$/, '') + ' (1)';

    clips.push({ ...secondHalf, id: generateId() });
    renderAllTracks();
    Accessibility.announce(`Split clip at ${Accessibility.formatTime(splitTime)}`);
    Accessibility.setStatus('Clip split');
  }

  /** Split at playhead for selected clip */
  function splitAtPlayhead() {
    if (!selectedClipId) {
      // Find clip under playhead
      const clipUnderPlayhead = clips.find(c =>
        c.startTime <= playheadPosition && c.startTime + c.duration > playheadPosition
      );
      if (clipUnderPlayhead) {
        splitClip(clipUnderPlayhead.id, playheadPosition);
      } else {
        Accessibility.announce('No clip at playhead position');
      }
      return;
    }
    splitClip(selectedClipId, playheadPosition);
  }

  /** Duplicate selected clip */
  function duplicateClip(clipId) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) {
      Accessibility.announce('No clip selected to duplicate');
      return;
    }
    saveState();
    const newClip = {
      ...clip,
      id: generateId(),
      name: clip.name + ' (copy)',
      startTime: clip.startTime + clip.duration,
    };
    clips.push(newClip);
    renderAllTracks();
    Accessibility.announce(`Duplicated clip: ${clip.name}`);
  }

  /** Select a clip */
  function selectClip(clipId) {
    selectedClipId = clipId;
    // Update UI
    document.querySelectorAll('.clip').forEach(el => {
      el.setAttribute('aria-selected', el.dataset.clipId === clipId ? 'true' : 'false');
    });
    const clip = clips.find(c => c.id === clipId);
    if (clip) {
      showClipProperties(clip);
      // Show edit toolbar when clip is selected
      const editToolbar = document.getElementById('video-toolbar-edit');
      if (editToolbar) editToolbar.classList.remove('hidden');
      const editLabel = document.getElementById('edit-tools-label');
      if (editLabel) editLabel.textContent = `Editing: ${clip.name}`;
      Accessibility.announce(`Selected: ${clip.name}, ${clip.type} clip, starts at ${Accessibility.formatTime(clip.startTime)}, duration ${Accessibility.formatTime(clip.duration)}`);
    }
  }

  /** Show clip properties panel */
  function showClipProperties(clip) {
    const panel = document.getElementById('clip-properties');
    if (panel) panel.classList.remove('hidden');
    const nameInput = document.getElementById('clip-name-input');
    const startInput = document.getElementById('clip-start-input');
    const durationInput = document.getElementById('clip-duration-input');
    const volumeSlider = document.getElementById('clip-volume-slider');
    const volumeDisplay = document.getElementById('clip-volume-display');
    const speedSelect = document.getElementById('clip-speed-select');
    if (nameInput) nameInput.value = clip.name;
    if (startInput) startInput.value = clip.startTime.toFixed(1);
    if (durationInput) durationInput.value = clip.duration.toFixed(1);
    if (volumeSlider) volumeSlider.value = clip.volume;
    if (volumeDisplay) volumeDisplay.textContent = clip.volume + '%';
    if (speedSelect) speedSelect.value = clip.speed;
  }

  /** Hide clip properties panel */
  function hideClipProperties() {
    const panel = document.getElementById('clip-properties');
    if (panel) panel.classList.add('hidden');
    const editToolbar = document.getElementById('video-toolbar-edit');
    if (editToolbar) editToolbar.classList.add('hidden');
  }

  /** Update clip property */
  function updateClipProperty(clipId, prop, value) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip[prop] = value;
    renderAllTracks();
    Accessibility.announceStatus(`${prop} updated to ${value}`);
  }

  /** Get pixels per second based on zoom */
  function getPPS() {
    return BASE_PPS * zoom;
  }

  /** Zoom in */
  function zoomIn() {
    zoom = Math.min(zoom * 1.25, 5);
    renderAllTracks();
    document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
    Accessibility.announceStatus(`Zoom: ${Math.round(zoom * 100)}%`);
  }

  /** Zoom out */
  function zoomOut() {
    zoom = Math.max(zoom / 1.25, 0.2);
    renderAllTracks();
    document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
    Accessibility.announceStatus(`Zoom: ${Math.round(zoom * 100)}%`);
  }

  /** Render all tracks */
  function renderAllTracks() {
    renderTrack('video', document.getElementById('video-track-clips'));
    renderTrack('audio', document.getElementById('audio-track-clips'));
    renderTrack('text', document.getElementById('text-track-clips'));
    renderRuler();
    renderMarkers();
    updatePlayhead();
    // Notify listeners
    onChangeCallbacks.forEach(cb => { try { cb(); } catch(e) {} });
  }

  function renderMarkers() {
    // Remove old markers
    document.querySelectorAll('.timeline-marker').forEach(el => el.remove());
    const container = document.getElementById('timeline-container');
    if (!container) return;
    const pps = getPPS();
    markers.forEach(m => {
      const el = document.createElement('div');
      el.className = 'timeline-marker';
      el.style.left = (80 + m.time * pps) + 'px';
      el.style.borderColor = m.color;
      el.setAttribute('aria-label', `Marker: ${m.label} at ${Accessibility.formatTimeDisplay(m.time)}`);
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'img');
      el.title = m.label;
      const flag = document.createElement('span');
      flag.className = 'marker-flag';
      flag.style.background = m.color;
      flag.textContent = m.label.substring(0, 8);
      el.appendChild(flag);
      container.appendChild(el);
    });
  }

  /** Register a callback for when clips change */
  function onChange(callback) {
    onChangeCallbacks.push(callback);
  }

  /** Render a single track */
  // ==========================================
  // AUDIO WAVEFORM VISUALIZATION
  // ==========================================

  /** Generate waveform data from an audio/video source */
  async function generateWaveform(clip) {
    if (waveformCache.has(clip.id)) return waveformCache.get(clip.id);
    if (!clip.filePath) return null;

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const response = await fetch(clip.filePath);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      const channelData = audioBuffer.getChannelData(0);
      const numBars = 200; // number of waveform bars
      const samplesPerBar = Math.floor(channelData.length / numBars);
      const peaks = new Float32Array(numBars);

      for (let i = 0; i < numBars; i++) {
        let max = 0;
        const start = i * samplesPerBar;
        for (let j = start; j < start + samplesPerBar && j < channelData.length; j++) {
          const abs = Math.abs(channelData[j]);
          if (abs > max) max = abs;
        }
        peaks[i] = max;
      }

      waveformCache.set(clip.id, peaks);
      audioCtx.close();
      return peaks;
    } catch {
      return null;
    }
  }

  /** Draw waveform on a canvas element */
  function drawWaveform(canvas, peaks, color) {
    if (!peaks || !canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const barWidth = w / peaks.length;
    ctx.fillStyle = color || 'rgba(76, 175, 80, 0.6)';

    for (let i = 0; i < peaks.length; i++) {
      const barHeight = peaks[i] * h * 0.9;
      const x = i * barWidth;
      const y = (h - barHeight) / 2;
      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barHeight);
    }
  }

  /** Render waveform canvas inside a clip element */
  function renderWaveformForClip(el, clip) {
    if (clip.type !== 'audio' && clip.type !== 'video') return;
    if (!clip.filePath) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'clip-waveform';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.max(100, parseInt(el.style.width) || 200);
    canvas.height = 40;
    el.appendChild(canvas);

    // Generate async and draw when ready
    generateWaveform(clip).then(peaks => {
      if (peaks) {
        const color = clip.type === 'audio' ? 'rgba(76, 175, 80, 0.6)' : 'rgba(33, 150, 243, 0.4)';
        drawWaveform(canvas, peaks, color);
      }
    });
  }

  function renderTrack(type, container) {
    container.innerHTML = '';
    const trackClips = clips.filter(c => c.type === type);
    const pps = getPPS();

    // Set track width based on content
    const maxEnd = trackClips.length > 0
      ? Math.max(...trackClips.map(c => c.startTime + c.duration))
      : 60;
    container.style.width = Math.max((maxEnd + 10) * pps, container.parentElement.clientWidth) + 'px';

    trackClips.forEach(clip => {
      const el = document.createElement('div');
      el.className = `clip ${type}-clip`;
      el.dataset.clipId = clip.id;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', clip.id === selectedClipId ? 'true' : 'false');
      el.setAttribute('aria-label', `${clip.name}, ${type} clip, starts at ${Accessibility.formatTimeDisplay(clip.startTime)}, duration ${Accessibility.formatTimeDisplay(clip.duration)}`);
      el.setAttribute('tabindex', '0');
      el.style.left = (clip.startTime * pps) + 'px';
      el.style.width = (clip.duration * pps) + 'px';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'clip-name';
      nameSpan.textContent = clip.name;
      el.appendChild(nameSpan);

      // Transition indicator
      if (clip.transition) {
        const trEl = document.createElement('div');
        trEl.className = 'clip-transition-indicator';
        trEl.setAttribute('aria-label', `${clip.transition.type} transition, ${clip.transition.duration} seconds`);
        trEl.style.width = (clip.transition.duration * pps) + 'px';
        trEl.textContent = clip.transition.type.charAt(0).toUpperCase();
        el.appendChild(trEl);
      }

      // Chroma key indicator
      if (clip.chromaKey) {
        const ckEl = document.createElement('div');
        ckEl.className = 'clip-chroma-indicator';
        ckEl.setAttribute('aria-label', 'Chroma key active');
        ckEl.style.borderColor = clip.chromaKey.color;
        el.appendChild(ckEl);
      }

      // Ken Burns indicator
      if (clip.kenBurns) {
        const kbEl = document.createElement('div');
        kbEl.className = 'clip-kenburns-indicator';
        kbEl.setAttribute('aria-label', 'Ken Burns effect active');
        kbEl.textContent = 'KB';
        el.appendChild(kbEl);
      }

      // Keyframe dots
      if (clip.keyframes) {
        const kfContainer = document.createElement('div');
        kfContainer.className = 'clip-keyframe-dots';
        Object.values(clip.keyframes).flat().forEach(kf => {
          const dot = document.createElement('span');
          dot.className = 'keyframe-dot';
          dot.style.left = (kf.time * pps) + 'px';
          dot.setAttribute('aria-hidden', 'true');
          kfContainer.appendChild(dot);
        });
        el.appendChild(kfContainer);
      }

      // Speed ramp indicator
      if (clip.speedRamp && clip.speedRamp.length > 0) {
        const srEl = document.createElement('div');
        srEl.className = 'clip-speedramp-indicator';
        srEl.setAttribute('aria-label', 'Variable speed');
        srEl.textContent = 'SR';
        el.appendChild(srEl);
      }

      // PIP indicator
      if (clip.pip) {
        const pipEl = document.createElement('div');
        pipEl.className = 'clip-pip-indicator';
        pipEl.setAttribute('aria-label', `Picture-in-picture: ${clip.pip.preset}`);
        pipEl.textContent = 'PIP';
        el.appendChild(pipEl);
      }

      // Freeze frame indicator
      if (clip.isFreezeFrame) {
        el.classList.add('freeze-frame-clip');
      }

      // Audio waveform visualization
      if (clip.type === 'audio' || clip.type === 'video') {
        renderWaveformForClip(el, clip);
      }

      // Drag handles for trimming
      const leftHandle = document.createElement('div');
      leftHandle.className = 'clip-handle clip-handle-left';
      leftHandle.setAttribute('aria-label', 'Trim start');
      el.appendChild(leftHandle);

      const rightHandle = document.createElement('div');
      rightHandle.className = 'clip-handle clip-handle-right';
      rightHandle.setAttribute('aria-label', 'Trim end');
      el.appendChild(rightHandle);

      // Click to select
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('clip-handle')) return;
        selectClip(clip.id);
      });

      // Keyboard support
      el.addEventListener('keydown', (e) => {
        switch (e.key) {
          case 'Enter':
          case ' ':
            e.preventDefault();
            selectClip(clip.id);
            break;
          case 'Delete':
          case 'Backspace':
            e.preventDefault();
            removeClip(clip.id);
            break;
        }
      });

      // Drag to move clip
      setupClipDrag(el, clip);
      setupHandleDrag(leftHandle, clip, 'left');
      setupHandleDrag(rightHandle, clip, 'right');

      container.appendChild(el);
    });
  }

  /** Setup clip dragging */
  function setupClipDrag(element, clip) {
    let isDragging = false;
    let startX, originalStart;

    element.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('clip-handle')) return;
      isDragging = true;
      startX = e.clientX;
      originalStart = clip.startTime;
      saveState();
      document.body.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dt = dx / getPPS();
      clip.startTime = snapTime(Math.max(0, originalStart + dt));
      element.style.left = (clip.startTime * getPPS()) + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      renderAllTracks();
      Accessibility.announceStatus(`Clip moved to ${Accessibility.formatTime(clip.startTime)}`);
    });
  }

  /** Setup handle dragging for trimming */
  function setupHandleDrag(handle, clip, side) {
    let isDragging = false;
    let startX, originalDuration, originalStart;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      originalDuration = clip.duration;
      originalStart = clip.startTime;
      saveState();
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dt = dx / getPPS();
      if (side === 'right') {
        clip.duration = Math.max(0.5, originalDuration + dt);
      } else {
        const newStart = Math.max(0, originalStart + dt);
        const startDiff = newStart - originalStart;
        clip.startTime = newStart;
        clip.duration = Math.max(0.5, originalDuration - startDiff);
        clip.trimStart = (clip.trimStart || 0) + startDiff;
      }
      renderAllTracks();
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      renderAllTracks();
    });
  }

  /** Render time ruler */
  function renderRuler() {
    const canvas = document.getElementById('ruler-canvas');
    if (!canvas) return;
    const container = document.getElementById('timeline-container');
    const pps = getPPS();
    const totalTime = getTotalDuration() + 10;
    const width = Math.max(totalTime * pps, container.clientWidth);

    canvas.width = width;
    canvas.height = 24;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, 24);
    ctx.fillStyle = '#7878a0';
    ctx.font = '10px Consolas, monospace';

    // Determine step based on zoom
    let step = 1;
    if (pps < 20) step = 10;
    else if (pps < 40) step = 5;
    else if (pps < 80) step = 2;

    for (let t = 0; t <= totalTime; t += step) {
      const x = t * pps;
      ctx.fillStyle = '#7878a0';
      ctx.fillRect(x, 16, 1, 8);
      ctx.fillText(Accessibility.formatTimeDisplay(t), x + 3, 12);
    }

    // Sub-ticks
    const subStep = step / 4;
    ctx.fillStyle = '#4a4a6a';
    for (let t = 0; t <= totalTime; t += subStep) {
      if (t % step === 0) continue;
      const x = t * pps;
      ctx.fillRect(x, 20, 1, 4);
    }
  }

  /** Update playhead position */
  function updatePlayhead() {
    const playhead = document.getElementById('playhead');
    if (!playhead) return;
    const pps = getPPS();
    playhead.style.left = (80 + playheadPosition * pps) + 'px';
  }

  /** Set playhead position */
  function setPlayheadPosition(time) {
    playheadPosition = Math.max(0, time);
    updatePlayhead();
  }

  /** Get total timeline duration */
  function getTotalDuration() {
    if (clips.length === 0) return 0;
    return Math.max(...clips.map(c => c.startTime + c.duration));
  }

  /** Get all clips */
  function getClips() {
    return clips;
  }

  /** Get selected clip */
  function getSelectedClip() {
    return clips.find(c => c.id === selectedClipId);
  }

  /** Get clips at a specific time */
  function getClipsAtTime(time) {
    return clips.filter(c => time >= c.startTime && time < c.startTime + c.duration);
  }

  /** Get video clips sorted by start time */
  function getVideoClips() {
    return clips.filter(c => c.type === 'video').sort((a, b) => a.startTime - b.startTime);
  }

  /** Clear all clips */
  function clearAll() {
    saveState();
    clips = [];
    selectedClipId = null;
    renderAllTracks();
    hideClipProperties();
    Accessibility.announce('Timeline cleared');
  }

  /** Available transition types — built-in library */
  const TRANSITION_TYPES = [
    'fade', 'fade-white', 'dissolve', 'cross-dissolve',
    'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down',
    'slide-left', 'slide-right', 'slide-up', 'slide-down',
    'zoom', 'zoom-out', 'spin',
    'blur', 'flash',
    'iris-open', 'iris-close',
    'curtain-left', 'curtain-right',
  ];

  /** Transition descriptions for UI */
  const TRANSITION_DESCRIPTIONS = {
    'fade': 'Fade in from black',
    'fade-white': 'Fade in from white',
    'dissolve': 'Cross-dissolve between clips',
    'cross-dissolve': 'Smooth blend between clips',
    'wipe-left': 'Wipes in from the right side',
    'wipe-right': 'Wipes in from the left side',
    'wipe-up': 'Wipes in from the bottom',
    'wipe-down': 'Wipes in from the top',
    'slide-left': 'Pushes previous clip left',
    'slide-right': 'Pushes previous clip right',
    'slide-up': 'Pushes previous clip up',
    'slide-down': 'Pushes previous clip down',
    'zoom': 'Zooms in from center',
    'zoom-out': 'Zooms out to reveal',
    'spin': 'Spinning rotation reveal',
    'blur': 'Blurs in from out of focus',
    'flash': 'White flash between clips',
    'iris-open': 'Circular iris opens from center',
    'iris-close': 'Circular iris closes to center',
    'curtain-left': 'Stage curtain opening left',
    'curtain-right': 'Stage curtain opening right',
  };

  /** Set a transition on a clip (applied as intro to this clip / outro from previous) */
  function setTransition(clipId, type, duration = 1) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    if (!type || type === 'none') {
      clip.transition = null;
    } else {
      clip.transition = { type, duration: Math.min(duration, clip.duration / 2) };
    }
    renderAllTracks();
    Accessibility.announce(type && type !== 'none'
      ? `Added ${type} transition (${duration}s) to "${clip.name}"`
      : `Removed transition from "${clip.name}"`);
  }

  /** Get transition types */
  function getTransitionTypes() {
    return TRANSITION_TYPES;
  }

  /** Detach a clip — it floats independently */
  function detachClip(clipId) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.detached = true;
    renderAllTracks();
    Accessibility.announce(`Detached "${clip.name}" — it now floats independently`);
  }

  /** Attach a detached clip back to the main timeline */
  function attachClip(clipId) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.detached = false;
    renderAllTracks();
    Accessibility.announce(`Attached "${clip.name}" back to the timeline`);
  }

  /** Set clip layer (0 = main, 1+ = overlay) */
  function setClipLayer(clipId, layer) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.layer = Math.max(0, parseInt(layer) || 0);
    renderAllTracks();
    Accessibility.announce(`"${clip.name}" moved to layer ${clip.layer}`);
  }

  /** Set fade in/out durations */
  function setFade(clipId, fadeIn, fadeOut) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    // Support both number and {video, audio} object formats
    if (fadeIn !== undefined) {
      if (typeof fadeIn === 'object' && fadeIn !== null) {
        clip.fadeIn = {
          video: Math.max(0, parseFloat(fadeIn.video) || 0),
          audio: Math.max(0, parseFloat(fadeIn.audio) || 0),
        };
      } else {
        const val = Math.max(0, parseFloat(fadeIn) || 0);
        clip.fadeIn = { video: val, audio: val };
      }
    }
    if (fadeOut !== undefined) {
      if (typeof fadeOut === 'object' && fadeOut !== null) {
        clip.fadeOut = {
          video: Math.max(0, parseFloat(fadeOut.video) || 0),
          audio: Math.max(0, parseFloat(fadeOut.audio) || 0),
        };
      } else {
        const val = Math.max(0, parseFloat(fadeOut) || 0);
        clip.fadeOut = { video: val, audio: val };
      }
    }
    renderAllTracks();
    const parts = [];
    const fi = clip.fadeIn;
    const fo = clip.fadeOut;
    if (fi && (fi.video > 0 || fi.audio > 0)) {
      if (fi.video === fi.audio) parts.push(`fade in ${fi.video}s`);
      else parts.push(`fade in: video ${fi.video}s, audio ${fi.audio}s`);
    }
    if (fo && (fo.video > 0 || fo.audio > 0)) {
      if (fo.video === fo.audio) parts.push(`fade out ${fo.video}s`);
      else parts.push(`fade out: video ${fo.video}s, audio ${fo.audio}s`);
    }
    Accessibility.announce(parts.length > 0 ? `"${clip.name}": ${parts.join(', ')}` : `Fades removed from "${clip.name}"`);
  }

  /** Get detached clips */
  function getDetachedClips() {
    return clips.filter(c => c.detached).sort((a, b) => a.startTime - b.startTime);
  }

  /** Trim clip - remove time from start or end */
  function trimClip(clipId, trimStart, trimEnd) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    if (trimStart !== undefined && trimStart > 0) {
      clip.startTime += trimStart;
      clip.duration -= trimStart;
      clip.trimStart = (clip.trimStart || 0) + trimStart;
    }
    if (trimEnd !== undefined && trimEnd > 0) {
      clip.duration -= trimEnd;
      clip.trimEnd = (clip.trimEnd || 0) + trimEnd;
    }
    clip.duration = Math.max(0.5, clip.duration);
    renderAllTracks();
    Accessibility.announce(`Clip trimmed. New duration: ${Accessibility.formatTime(clip.duration)}`);
  }

  /** Remove audio from a video clip */
  function removeAudio(clipId) {
    const clip = clips.find(c => c.id === (clipId || selectedClipId));
    if (!clip) return;
    saveState();
    clip.volume = 0;
    renderAllTracks();
    Accessibility.announce('Audio removed from clip');
  }

  /** Serialize project data */
  function serialize() {
    return { clips, zoom, clipIdCounter, markers, markerIdCounter };
  }

  /** Load project data */
  function deserialize(data) {
    clips = data.clips || [];
    zoom = data.zoom || 1;
    clipIdCounter = data.clipIdCounter || 0;
    markers = data.markers || [];
    markerIdCounter = data.markerIdCounter || 0;
    selectedClipId = null;
    renderAllTracks();
    Accessibility.announce(`Project loaded with ${clips.length} clips`);
  }

  /** Setup click on timeline to set playhead */
  function initTimelineClick() {
    const container = document.getElementById('timeline-container');
    container.addEventListener('click', (e) => {
      if (e.target.closest('.clip')) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + container.scrollLeft - 80;
      const time = Math.max(0, x / getPPS());
      setPlayheadPosition(time);
      Accessibility.announceStatus(`Playhead at ${Accessibility.formatTime(time)}`);
    });
  }

  return {
    addClip, removeClip, splitClip, splitAtPlayhead, duplicateClip,
    selectClip, updateClipProperty, zoomIn, zoomOut, renderAllTracks,
    setPlayheadPosition, getTotalDuration, getClips, getSelectedClip,
    getClipsAtTime, getVideoClips, clearAll, trimClip, removeAudio,
    undo, redo, serialize, deserialize, getPPS, getTrackEndTime,
    onChange, initTimelineClick,
    // Transitions
    setTransition, getTransitionTypes,
    getTransitionDescription: (type) => TRANSITION_DESCRIPTIONS[type] || type,
    // Detach/Layers
    detachClip, attachClip, setClipLayer, setFade, getDetachedClips,
    // Keyframes
    addKeyframe, removeKeyframe, getKeyframeValue, getKeyframes,
    // Speed Ramping
    setSpeedRamp, getSpeedAtTime,
    // Markers
    addMarker, removeMarker, getMarkers, getNextMarker, getPrevMarker,
    // Freeze Frame
    freezeFrame,
    // Ken Burns
    setKenBurns, clearKenBurns,
    // Chroma Key
    setChromaKey, clearChromaKey,
    // PIP
    setPipPreset, getPipPresets,
    // Snapping
    toggleSnap, snapTime,
    // Title Templates
    getTitleTemplates, addTitleFromTemplate,
    // Audio helpers
    getAudioClipsAtTime, getVideoClipsWithAudioAtTime,
  };
})();
