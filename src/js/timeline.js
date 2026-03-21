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
    updatePlayhead();
  }

  /** Render a single track */
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
      el.textContent = clip.name;

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
      clip.startTime = Math.max(0, originalStart + dt);
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
    return { clips, zoom, clipIdCounter };
  }

  /** Load project data */
  function deserialize(data) {
    clips = data.clips || [];
    zoom = data.zoom || 1;
    clipIdCounter = data.clipIdCounter || 0;
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
    addClip,
    removeClip,
    splitClip,
    splitAtPlayhead,
    duplicateClip,
    selectClip,
    updateClipProperty,
    zoomIn,
    zoomOut,
    renderAllTracks,
    setPlayheadPosition,
    getTotalDuration,
    getClips,
    getSelectedClip,
    getClipsAtTime,
    getVideoClips,
    clearAll,
    trimClip,
    removeAudio,
    undo,
    redo,
    serialize,
    deserialize,
    getPPS,
    getTrackEndTime,
    initTimelineClick,
  };
})();
