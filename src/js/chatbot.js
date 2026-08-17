/**
 * Chatbot Module - Global assistant with dialog responses
 * Understands natural language, no API keys needed
 */

const Chatbot = (() => {
  const chatInput = document.getElementById('chat-input');
  const responseInline = document.getElementById('chat-response-inline');
  const responseBody = document.getElementById('chat-response-body');

  // ==========================================
  // MEMORY SYSTEM — persists across sessions via localStorage
  // ==========================================
  const MEMORY_KEY = 'as-assistant-memory';
  const HISTORY_KEY = 'as-assistant-history';
  const MAX_HISTORY = 500; // Very large history

  function loadMemory() {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY)) || {}; } catch { return {}; }
  }
  function saveMemory(mem) {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)); } catch {}
  }
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
  }
  function saveHistory(hist) {
    try {
      if (hist.length > MAX_HISTORY) hist = hist.slice(-MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    } catch {}
  }

  /** Remember a fact the user told us */
  function remember(key, value) {
    const mem = loadMemory();
    mem[key] = { value, time: Date.now() };
    saveMemory(mem);
  }

  /** Recall a specific memory or all memories */
  function recall(key) {
    const mem = loadMemory();
    if (key) return mem[key]?.value || null;
    return mem;
  }

  /** Forget a memory */
  function forget(key) {
    const mem = loadMemory();
    delete mem[key];
    saveMemory(mem);
  }

  /** Track a user command for history/context */
  function trackCommand(input, response) {
    const hist = loadHistory();
    hist.push({ input, response: (response || '').substring(0, 200), time: Date.now() });
    saveHistory(hist);
  }

  /** Get recent context for Gemini prompt enrichment */
  function getContextSummary() {
    const mem = loadMemory();
    const hist = loadHistory();
    let context = '';

    // User's remembered facts — include ALL of them
    const memEntries = Object.entries(mem);
    if (memEntries.length > 0) {
      context += 'User memories: ' + memEntries.map(([k, v]) => v.value).join('; ') + '. ';
    }

    // Recent history — last 15 for rich context
    const recent = hist.slice(-15);
    if (recent.length > 0) {
      context += 'Recent commands: ' + recent.map(h => h.input).join(' | ') + '. ';
    }

    // Session summary
    const sessionStart = hist.length > 0 ? hist[0].time : null;
    if (sessionStart) {
      const totalCommands = hist.length;
      context += `Total commands this session: ${totalCommands}. `;
    }

    return context;
  }

  /** Show response inline below the chat bar */
  function showResponse(text) {
    if (!responseInline || !responseBody) return;
    responseBody.innerHTML = text;
    responseInline.classList.remove('hidden');
    // Announce for screen readers
    Accessibility.announceStatus(responseBody.textContent.substring(0, 200));
  }

  /** Check if text contains any of the keywords (supports multi-word phrases and single words) */
  function has(text, ...words) {
    return words.some(w => text.includes(w));
  }

  /** Fuzzy check — does the text ROUGHLY mean this? Checks word stems and common variations */
  function means(text, ...concepts) {
    const t = ' ' + text + ' ';
    return concepts.some(c => {
      // Each concept can be a pipe-separated list of alternatives
      return c.split('|').some(alt => t.includes(alt.trim()));
    });
  }

  /** Extract a number from text */
  function extractNumber(text) {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
  }

  /** Extract all numbers from text */
  function extractNumbers(text) {
    const matches = text.match(/\d+(?:\.\d+)?/g);
    return matches ? matches.map(Number) : [];
  }

  /** Get selected clip or null */
  function requireClip() {
    return Timeline.getSelectedClip();
  }

  /** Format time nicely */
  function fmtTime(seconds) {
    return Accessibility.formatTimeDisplay(seconds);
  }

  /** Gather full context about the current app state */
  function gatherContext() {
    const ctx = {};

    // Active section
    const activeSection = document.querySelector('.app-section[style*="flex"], .app-section.active');
    if (activeSection) {
      ctx.activeSection = activeSection.id.replace('section-', '');
    }

    // Timeline state
    const clips = Timeline.getClips();
    ctx.clipCount = clips.length;
    ctx.videoClips = clips.filter(c => c.type === 'video').length;
    ctx.audioClips = clips.filter(c => c.type === 'audio').length;
    ctx.textClips = clips.filter(c => c.type === 'text').length;
    ctx.totalDuration = Timeline.getTotalDuration();
    ctx.selectedClip = Timeline.getSelectedClip();

    // Playhead
    try {
      ctx.playheadTime = Player.getCurrentTime();
      ctx.videoDuration = Player.getDuration();
    } catch { ctx.playheadTime = 0; ctx.videoDuration = 0; }

    // Photo editor
    ctx.hasPhoto = PhotoEditor.hasImage;
    ctx.photoPath = PhotoEditor.currentPath;
    ctx.photoStats = PhotoEditor.getImageStats ? PhotoEditor.getImageStats() : null;

    // Clips with transitions
    ctx.clipsWithTransitions = clips.filter(c => c.transition).length;

    // Clips with filters
    ctx.clipsWithFilters = clips.filter(c => c.filters && c.filters.preset).length;

    // New feature stats
    ctx.clipsWithChromaKey = clips.filter(c => c.chromaKey).length;
    ctx.clipsWithKeyframes = clips.filter(c => c.keyframes).length;
    ctx.clipsWithSpeedRamp = clips.filter(c => c.speedRamp).length;
    ctx.clipsWithKenBurns = clips.filter(c => c.kenBurns).length;
    ctx.clipsWithPip = clips.filter(c => c.pip).length;
    ctx.markerCount = Timeline.getMarkers ? Timeline.getMarkers().length : 0;

    return ctx;
  }

  /** Build a smart status line from context */
  function buildContextResponse(ctx) {
    let parts = [];

    if (ctx.activeSection === 'video-editor') {
      if (ctx.clipCount === 0) {
        parts.push('No clips yet — import some media to get started.');
      } else {
        parts.push(`<strong>${ctx.clipCount} clip${ctx.clipCount > 1 ? 's' : ''}</strong> on the timeline (${ctx.videoClips} video, ${ctx.audioClips} audio, ${ctx.textClips} text).`);
        parts.push(`Total duration: <strong>${fmtTime(ctx.totalDuration)}</strong>.`);
        if (ctx.selectedClip) {
          const c = ctx.selectedClip;
          parts.push(`Selected: "<strong>${c.name}</strong>" (${fmtTime(c.startTime)} to ${fmtTime(c.startTime + c.duration)}).`);
          if (c.transition) parts.push(`Transition: ${c.transition.type} (${c.transition.duration}s).`);
        }
        parts.push(`Playhead at <strong>${fmtTime(ctx.playheadTime)}</strong>.`);
      }
    } else if (ctx.activeSection === 'photo-editor') {
      if (ctx.hasPhoto) {
        const stats = ctx.photoStats;
        parts.push(`Image loaded: <strong>${ctx.photoPath ? ctx.photoPath.split(/[\\/]/).pop() : 'Unknown'}</strong>.`);
        if (stats) {
          parts.push(`Dimensions: ${stats.width}×${stats.height}.`);
          if (stats.rotation) parts.push(`Rotated ${stats.rotation}°.`);
          const adj = Object.entries(stats.adjustments).filter(([k, v]) => v !== 0);
          if (adj.length > 0) parts.push(`Active adjustments: ${adj.map(([k, v]) => `${k}: ${v}`).join(', ')}.`);
          if (stats.undoDepth > 0) parts.push(`${stats.undoDepth} undo step${stats.undoDepth > 1 ? 's' : ''} available.`);
        }
        parts.push('You can ask me to describe it, remove/blur background, enhance it, or remove objects.');
      } else {
        parts.push('No image loaded. Open an image to start editing.');
      }
    }

    return parts.join(' ');
  }

  /** Process a user command */
  async function processCommand(input) {
    const text = input.trim().toLowerCase();
    if (!text) return;

    // Route through Gemini if available — it has full project access
    if (Gemini.isAvailable()) {
      showResponse('<em>Thinking...</em>');
      try {
        // Enrich Gemini prompt with context
        const ctx = gatherContext();
        const memCtx = getContextSummary();
        let contextPrefix = '';
        if (memCtx) contextPrefix += memCtx + ' ';
        if (ctx.clipCount > 0) contextPrefix += `Current project: ${ctx.clipCount} clips, duration ${fmtTime(ctx.totalDuration)}. `;
        if (ctx.selectedClip) contextPrefix += `Selected clip: "${ctx.selectedClip.name}". `;
        if (ctx.hasPhoto) contextPrefix += `Photo editor has an image loaded. `;

        const enrichedInput = contextPrefix ? `[Context: ${contextPrefix}] ${input}` : input;
        const rawResponse = await Gemini.send(enrichedInput);
        const { html } = await Gemini.processResponse(rawResponse);
        showResponse(html || 'Done.');
        return;
      } catch (err) {
        console.error('Gemini error:', err);
        if (err.message && err.message.includes('API key')) {
          showResponse(`<strong>Gemini Error:</strong> ${err.message}`);
          return;
        }
        // Fall through to keyword matching
      }
    } else {
      // First-time nudge: tell user about Gemini if they haven't dismissed it
      const dismissed = localStorage.getItem('as-gemini-nudge-dismissed');
      if (!dismissed) {
        localStorage.setItem('as-gemini-nudge-dismissed', '1');
        showResponse(`<strong>Tip:</strong> For the best experience, connect a free Gemini API key in <strong>Settings</strong>. The assistant will understand anything you say naturally and can make real edits to your project.<br><br>Without it, only basic keyword commands work. Get a free key from Google AI Studio — it takes 30 seconds.<br><br><em>Processing your command with basic matching...</em>`);
        // Small delay so user sees the tip, then process
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    let response = '';

    // ==========================================
    // DESCRIBE IMAGE
    // ==========================================
    if (
      (has(text, 'describe', 'what is in', 'what\'s in', 'analyze', 'analyse', 'what does the', 'tell me about the', 'what do you see', 'look at') && has(text, 'image', 'photo', 'picture', 'pic')) ||
      (has(text, 'describe') && (has(text, 'image', 'photo', 'picture', 'pic', 'this', 'it'))) ||
      text === 'describe' || text === 'describe image' || text === 'describe the image' || text === 'describe photo' ||
      text === 'what do you see' || text === 'what is this' || text === 'analyze image' || text === 'analyse image'
    ) {
      if (!PhotoEditor.hasImage) {
        response = 'No image is loaded in the Photo Editor. Open an image first, then ask me to describe it.';
      } else {
        response = describeImage();
      }
    }

    // ==========================================
    // TRIM
    // ==========================================
    else if (has(text, 'trim', 'cut the beginning', 'cut the start', 'cut the end', 'remove the first', 'remove the beginning', 'remove the last') && !has(text, 'split', 'background', 'bg', 'image', 'photo', 'filter')) {
      const seconds = extractNumber(text);
      let clip = requireClip();
      if (!clip) {
        const clips = Timeline.getClips();
        if (clips.length > 0) {
          clip = clips[0];
          Timeline.selectClip(clip.id);
        }
      }
      if (!clip) {
        response = 'No clips on the timeline. Import some media first.';
      } else if (!seconds) {
        response = 'How many seconds? For example:<ul><li>"trim the first 5 seconds"</li><li>"trim the last 3 seconds"</li><li>"chop 10 seconds off the start"</li></ul>';
      } else if (has(text, 'last', 'end', 'ending', 'back', 'tail', 'off the end')) {
        Timeline.trimClip(clip.id, undefined, seconds);
        response = `Trimmed <strong>${seconds} seconds</strong> from the end of "${clip.name}".`;
      } else {
        Timeline.trimClip(clip.id, seconds, undefined);
        response = `Trimmed <strong>${seconds} seconds</strong> from the beginning of "${clip.name}".`;
      }
    }

    // ==========================================
    // SPLIT
    // ==========================================
    else if (has(text, 'split', 'cut here', 'cut at', 'divide', 'break apart', 'chop at', 'slice')) {
      const seconds = extractNumber(text);
      if (has(text, 'here', 'playhead', 'current', 'now') || !seconds) {
        Timeline.splitAtPlayhead();
        const clips = Timeline.getClips();
        response = `Split clip at the current playhead position. You now have <strong>${clips.length} clips</strong>.`;
      } else {
        let clip = Timeline.getSelectedClip();
        if (!clip) {
          const clipsAtTime = Timeline.getClipsAtTime(seconds);
          clip = clipsAtTime.length > 0 ? clipsAtTime[0] : null;
        }
        if (!clip) {
          // Auto-select first clip if nothing else works
          const allClips = Timeline.getClips();
          clip = allClips.length > 0 ? allClips[0] : null;
        }
        if (clip) {
          Timeline.splitClip(clip.id, seconds);
          const clips = Timeline.getClips();
          response = `Split "${clip.name}" at <strong>${seconds} seconds</strong>. You now have <strong>${clips.length} clips</strong>.`;
        } else {
          response = `No clips on the timeline. Import some media first.`;
        }
      }
    }

    // ==========================================
    // DELETE
    // ==========================================
    else if (has(text, 'delete clip', 'delete this', 'delete it', 'delete the clip', 'remove clip', 'remove it', 'remove this', 'remove the clip', 'get rid of', 'trash', 'erase clip', 'erase this', 'erase it') && !has(text, 'background', 'bg', 'image', 'photo', 'filter', 'audio')) {
      let clip = requireClip();
      if (!clip) {
        // Auto-select first clip
        const clips = Timeline.getClips();
        if (clips.length > 0) {
          clip = clips[0];
          Timeline.selectClip(clip.id);
        }
      }
      if (clip) {
        const name = clip.name;
        Timeline.removeClip(clip.id);
        response = `Deleted "<strong>${name}</strong>" from the timeline.`;
      } else {
        response = 'No clips on the timeline to delete.';
      }
    }

    // ==========================================
    // DUPLICATE / COPY
    // ==========================================
    else if (has(text, 'duplicate', 'copy clip', 'copy this', 'copy it', 'make a copy', 'clone', 'dupe')) {
      let clip = requireClip();
      if (!clip) {
        const clips = Timeline.getClips();
        if (clips.length > 0) { clip = clips[0]; Timeline.selectClip(clip.id); }
      }
      if (clip) {
        Timeline.duplicateClip(clip.id);
        response = `Duplicated "<strong>${clip.name}</strong>".`;
      } else {
        response = 'No clips on the timeline to duplicate.';
      }
    }

    // ==========================================
    // REMOVE AUDIO from clip
    // ==========================================
    else if (has(text, 'remove audio', 'mute clip', 'strip audio', 'remove sound from', 'silence this clip', 'no audio on')) {
      const clip = requireClip();
      if (clip) {
        Timeline.removeAudio(clip.id);
        response = `Removed audio from "<strong>${clip.name}</strong>".`;
      } else {
        response = 'No clip selected. Select a clip first.';
      }
    }

    // ==========================================
    // VOLUME
    // ==========================================
    else if (has(text, 'volume', 'louder', 'quieter', 'turn up', 'turn down', 'turn it up', 'turn it down', 'make it quiet', 'make it loud')) {
      let clip = requireClip();
      if (!clip) {
        const clips = Timeline.getClips();
        if (clips.length > 0) { clip = clips[0]; Timeline.selectClip(clip.id); }
      }
      if (!clip) {
        response = 'No clips on the timeline.';
      } else {
        const num = extractNumber(text);
        if (num !== null) {
          Timeline.updateClipProperty(clip.id, 'volume', num);
          response = `Volume set to <strong>${num}%</strong> for "${clip.name}".`;
        } else if (has(text, 'louder', 'up', 'increase', 'raise', 'boost', 'loud')) {
          const newVol = Math.min(200, (clip.volume || 100) + 25);
          Timeline.updateClipProperty(clip.id, 'volume', newVol);
          response = `Volume increased to <strong>${newVol}%</strong> for "${clip.name}".`;
        } else if (has(text, 'quieter', 'down', 'decrease', 'lower', 'reduce', 'softer', 'quiet')) {
          const newVol = Math.max(0, (clip.volume || 100) - 25);
          Timeline.updateClipProperty(clip.id, 'volume', newVol);
          response = `Volume decreased to <strong>${newVol}%</strong> for "${clip.name}".`;
        } else {
          response = 'Try:<ul><li>"set volume to 50"</li><li>"make it louder"</li><li>"turn it down"</li></ul>';
        }
      }
    }

    // ==========================================
    // SPEED
    // ==========================================
    else if (has(text, 'speed', 'faster', 'slower', 'slow down', 'speed up', 'slow mo', 'fast forward', 'double speed', 'half speed')) {
      let clip = requireClip();
      if (!clip) {
        const clips = Timeline.getClips();
        if (clips.length > 0) { clip = clips[0]; Timeline.selectClip(clip.id); }
      }
      if (!clip) {
        response = 'No clips on the timeline.';
      } else {
        const num = extractNumber(text);
        if (num !== null) {
          Timeline.updateClipProperty(clip.id, 'speed', num);
          response = `Speed set to <strong>${num}x</strong> for "${clip.name}".`;
        } else if (has(text, 'faster', 'speed up', 'fast forward', 'double')) {
          const newSpeed = Math.min(4, (clip.speed || 1) * 2);
          Timeline.updateClipProperty(clip.id, 'speed', newSpeed);
          response = `Speed increased to <strong>${newSpeed}x</strong>.`;
        } else if (has(text, 'slower', 'slow down', 'slow mo', 'half')) {
          const newSpeed = Math.max(0.25, (clip.speed || 1) / 2);
          Timeline.updateClipProperty(clip.id, 'speed', newSpeed);
          response = `Speed decreased to <strong>${newSpeed}x</strong>.`;
        } else {
          response = 'Try:<ul><li>"set speed to 2x"</li><li>"make it faster"</li><li>"slow it down"</li></ul>';
        }
      }
    }

    // ==========================================
    // BRIGHTNESS
    // ==========================================
    else if (has(text, 'brightness', 'bright', 'darken', 'darker', 'lighten', 'lighter')) {
      const num = extractNumber(text);
      if (num !== null) {
        Effects.setFilter('brightness', num);
        response = `Brightness set to <strong>${num}%</strong>.`;
      } else if (has(text, 'darken', 'darker', 'dim')) {
        Effects.setFilter('brightness', 70);
        response = 'Darkened the video (brightness 70%).';
      } else if (has(text, 'lighten', 'lighter', 'brighter', 'brighten')) {
        Effects.setFilter('brightness', 130);
        response = 'Brightened the video (brightness 130%).';
      } else {
        response = 'Try: "set brightness to 120", "make it brighter", or "darken it".';
      }
    }

    // ==========================================
    // CONTRAST
    // ==========================================
    else if (has(text, 'contrast') && !has(text, 'high contrast')) {
      const num = extractNumber(text);
      if (num !== null) {
        Effects.setFilter('contrast', num);
        response = `Contrast set to <strong>${num}%</strong>.`;
      } else if (has(text, 'more', 'increase', 'higher', 'boost')) {
        Effects.setFilter('contrast', 140);
        response = 'Increased contrast to 140%.';
      } else if (has(text, 'less', 'decrease', 'lower', 'reduce')) {
        Effects.setFilter('contrast', 70);
        response = 'Decreased contrast to 70%.';
      } else {
        response = 'Try: "set contrast to 140", "increase contrast", or "lower contrast".';
      }
    }

    // ==========================================
    // SATURATION
    // ==========================================
    else if (has(text, 'saturation', 'saturate', 'desaturate', 'colorful', 'vivid colors')) {
      const num = extractNumber(text);
      if (num !== null) {
        Effects.setFilter('saturation', num);
        response = `Saturation set to <strong>${num}%</strong>.`;
      } else if (has(text, 'desaturate', 'less color')) {
        Effects.setFilter('saturation', 50);
        response = 'Desaturated to 50%.';
      } else if (has(text, 'more', 'colorful', 'vivid', 'boost')) {
        Effects.setFilter('saturation', 150);
        response = 'Boosted color saturation to 150%.';
      }
    }

    // ==========================================
    // BLUR
    // ==========================================
    else if (has(text, 'blur') && !has(text, 'background', 'bg')) {
      const num = extractNumber(text);
      if (num !== null) {
        Effects.setFilter('blur', num);
        response = `Blur set to <strong>${num}px</strong>.`;
      } else if (has(text, 'remove', 'clear', 'off', 'none', 'no blur', 'unblur')) {
        Effects.setFilter('blur', 0);
        response = 'Blur removed.';
      } else {
        Effects.setFilter('blur', 3);
        response = 'Added blur (3px). Say "set blur to 5" for more, or "remove blur" to clear.';
      }
    }

    // ==========================================
    // FILTER PRESETS
    // ==========================================
    else if (has(text, 'vintage', 'retro', 'old film', 'old school', '70s', '80s')) {
      Effects.applyPreset('vintage');
      response = 'Applied <strong>vintage</strong> filter — warm faded look like old film.';
    }
    else if (has(text, 'cinematic', 'movie', 'film look', 'hollywood')) {
      Effects.applyPreset('cinematic');
      response = 'Applied <strong>cinematic</strong> filter — high contrast, slightly desaturated.';
    }
    else if (has(text, 'noir', 'black and white', 'black & white', 'b&w', 'b w', 'grayscale', 'greyscale', 'monochrome')) {
      Effects.applyPreset('noir');
      response = 'Applied <strong>black and white</strong> filter.';
    }
    else if (has(text, 'warm', 'sunny', 'golden', 'sunset') && !has(text, 'background')) {
      Effects.applyPreset('warm');
      response = 'Applied <strong>warm tone</strong> filter — golden, sunny warmth.';
    }
    else if (has(text, 'cool', 'cold', 'winter', 'moonlit', 'blue tone', 'icy') && !has(text, 'background')) {
      Effects.applyPreset('cool');
      response = 'Applied <strong>cool tone</strong> filter — blue-shifted, calm.';
    }
    else if (has(text, 'dramatic', 'intense', 'punchy', 'bold') && !has(text, 'speed')) {
      Effects.applyPreset('dramatic');
      response = 'Applied <strong>dramatic</strong> filter — high contrast, vivid.';
    }
    else if (has(text, 'faded', 'washed', 'bleached', 'pastel')) {
      Effects.applyPreset('faded');
      response = 'Applied <strong>faded film</strong> filter — soft washed-out look.';
    }
    else if (has(text, 'vivid', 'vibrant', 'pop', 'saturated', 'colorful') && !has(text, 'saturation')) {
      Effects.applyPreset('vivid');
      response = 'Applied <strong>vivid</strong> filter — boosted saturation and contrast.';
    }
    else if (has(text, 'apply') && has(text, 'filter', 'preset', 'effect')) {
      const presetNames = Effects.getPresetNames();
      const matched = presetNames.find(p => text.includes(p));
      if (matched) {
        Effects.applyPreset(matched);
        response = `Applied <strong>${matched}</strong> filter.`;
      } else {
        response = `Available filters: <strong>${presetNames.join(', ')}</strong>. Try "apply vintage filter" or "make it cinematic".`;
      }
    }
    else if (has(text, 'remove filter', 'clear filter', 'no filter', 'reset filter', 'original look', 'remove all filter', 'remove effect', 'clear all filter')) {
      Effects.applyPreset('none');
      response = 'All filters removed. Back to original look.';
    }

    // ==========================================
    // TRANSITIONS
    // ==========================================
    else if (has(text, 'rename clip', 'name clip', 'rename this', 'call this clip', 'call it')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else {
        // Extract name after keywords
        let newName = text.replace(/rename\s*(this\s*)?(clip)?|name\s*(this\s*)?(clip)?|call\s*(this\s*)?(clip)?|call\s*it/gi, '').trim();
        if (newName.startsWith('"') && newName.endsWith('"')) newName = newName.slice(1, -1);
        if (newName.startsWith("'") && newName.endsWith("'")) newName = newName.slice(1, -1);
        if (newName) {
          Timeline.updateClipProperty(clip.id, 'name', newName);
          response = `Renamed clip to "<strong>${newName}</strong>".`;
        } else {
          response = 'Please provide a name, e.g. "rename clip Intro Scene".';
        }
      }
    }

    // ==========================================
    // FADE IN/OUT (clip audio/video fades)
    // ==========================================
    else if (has(text, 'fade in', 'fade out', 'add fade', 'set fade', 'clear fade', 'remove fade')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'clear fade', 'remove fade', 'no fade')) {
        Timeline.setFade(clip.id, 0, 0);
        response = `Removed all fades from "<strong>${clip.name}</strong>".`;
      } else {
        const dur = extractNumber(text) || 1;
        const isVideo = has(text, 'video');
        const isAudio = has(text, 'audio');
        const isBoth = (!isVideo && !isAudio) || has(text, 'both');
        const isIn = has(text, 'fade in', 'fade-in');
        const isOut = has(text, 'fade out', 'fade-out');
        const applyBoth = !isIn && !isOut;

        const currentIn = clip.fadeIn || { video: 0, audio: 0 };
        const currentOut = clip.fadeOut || { video: 0, audio: 0 };
        const fadeIn = { video: typeof currentIn === 'number' ? currentIn : (currentIn.video || 0), audio: typeof currentIn === 'number' ? currentIn : (currentIn.audio || 0) };
        const fadeOut = { video: typeof currentOut === 'number' ? currentOut : (currentOut.video || 0), audio: typeof currentOut === 'number' ? currentOut : (currentOut.audio || 0) };

        if (isIn || applyBoth) {
          if (isBoth || isVideo) fadeIn.video = dur;
          if (isBoth || isAudio) fadeIn.audio = dur;
        }
        if (isOut || applyBoth) {
          if (isBoth || isVideo) fadeOut.video = dur;
          if (isBoth || isAudio) fadeOut.audio = dur;
        }
        Timeline.setFade(clip.id, fadeIn, fadeOut);
        const parts = [];
        if (isIn || applyBoth) parts.push(`fade in ${dur}s`);
        if (isOut || applyBoth) parts.push(`fade out ${dur}s`);
        const target = isBoth ? '' : isVideo ? ' (video only)' : ' (audio only)';
        response = `Applied ${parts.join(' and ')}${target} to "<strong>${clip.name}</strong>".`;
      }
    }

    // ==========================================
    // DETACH / ATTACH / LAYER
    // ==========================================
    else if (has(text, 'detach', 'attach', 'reattach', 'layer')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'reattach', 'attach back', 'attach clip')) {
        Timeline.attachClip(clip.id);
        response = `Reattached "<strong>${clip.name}</strong>" to the main timeline.`;
      } else if (has(text, 'detach')) {
        Timeline.detachClip(clip.id);
        response = `Detached "<strong>${clip.name}</strong>" from the main timeline. It can now be placed on any layer.`;
      } else if (has(text, 'layer')) {
        const layerNum = extractNumber(text);
        if (layerNum !== null && layerNum >= 0) {
          Timeline.setClipLayer(clip.id, layerNum);
          response = `Set "<strong>${clip.name}</strong>" to layer ${layerNum}.`;
        } else {
          response = `Current layer: ${clip.layer || 0}. Say "set layer 2" to change it.`;
        }
      }
    }

    // ==========================================
    // TRANSITIONS
    // ==========================================
    else if (has(text, 'transition', 'dissolve', 'wipe', 'slide in', 'slide out', 'cross fade', 'crossfade')) {
      let clip = requireClip();
      if (!clip) {
        const clips = Timeline.getClips();
        if (clips.length > 0) { clip = clips[clips.length - 1]; Timeline.selectClip(clip.id); }
      }
      if (!clip) {
        response = 'No clips on the timeline. Add some clips first.';
      } else if (has(text, 'remove transition', 'no transition', 'clear transition', 'delete transition', 'remove the transition')) {
        Timeline.setTransition(clip.id, 'none');
        response = `Removed transition from "<strong>${clip.name}</strong>".`;
      } else {
        const dur = extractNumber(text) || 1;
        let type = 'fade';
        if (has(text, 'dissolve', 'cross fade', 'crossfade')) type = 'dissolve';
        else if (has(text, 'wipe left', 'wipe from right')) type = 'wipe-left';
        else if (has(text, 'wipe right', 'wipe from left')) type = 'wipe-right';
        else if (has(text, 'slide left', 'push left')) type = 'slide-left';
        else if (has(text, 'slide right', 'push right', 'slide in')) type = 'slide-right';
        else if (has(text, 'zoom')) type = 'zoom';
        Timeline.setTransition(clip.id, type, dur);
        response = `Added <strong>${type}</strong> transition (${dur}s) to "<strong>${clip.name}</strong>".<br>Available types: fade, dissolve, wipe-left, wipe-right, slide-left, slide-right, zoom.`;
      }
    }

    // ==========================================
    // PHOTO: Remove background
    // ==========================================
    else if (has(text, 'remove background', 'remove bg', 'remove the background', 'delete background', 'cut out', 'cutout')) {
      if (!PhotoEditor.hasImage) {
        response = 'No image loaded. Go to the Photo Editor and open an image first.';
      } else {
        const tol = extractNumber(text) || 50;
        const fillMode = has(text, 'mirror', 'fill', 'content aware', 'content-aware', 'inpaint') ? 'mirror' : 'transparent';
        response = await PhotoEditor.removeBackground(tol, fillMode);
      }
    }

    // ==========================================
    // PHOTO: Blur background
    // ==========================================
    else if (has(text, 'blur background', 'blur bg', 'blur the background', 'bokeh', 'depth of field', 'portrait mode')) {
      if (!PhotoEditor.hasImage) {
        response = 'No image loaded. Go to the Photo Editor and open an image first.';
      } else {
        const tol = extractNumber(text) || 50;
        response = await PhotoEditor.blurBackground(tol, 10);
      }
    }

    // ==========================================
    // PHOTO: Remove region/object
    // ==========================================
    else if (has(text, 'remove the', 'remove a ', 'erase the', 'erase a ', 'delete the', 'delete a ', 'get rid of the', 'get rid of a') && !has(text, 'clip', 'filter', 'timeline', 'audio')) {
      if (!PhotoEditor.hasImage) {
        response = 'No image loaded. Go to the Photo Editor and open an image first.';
      } else {
        const desc = text
          .replace(/^.*(remove|erase|delete|get rid of)\s+(the|a)\s*/i, '')
          .replace(/from\s+(the\s+)?(image|photo|picture)/i, '')
          .trim();
        if (!desc) {
          response = 'Describe what to remove and where. Examples:<ul><li>"remove the person in the middle"</li><li>"remove the thing on the left"</li><li>"remove the object in the top right"</li></ul>';
        } else {
          response = await PhotoEditor.removeRegion(desc);
        }
      }
    }

    // ==========================================
    // ADD TEXT
    // ==========================================
    else if (has(text, 'add text', 'put text', 'text overlay', 'write text', 'show text', 'display text', 'add title', 'add caption', 'add subtitle')) {
      let textContent = text.replace(/^.*?(?:add|put|write|show|display)\s+(?:text|title|caption|subtitle)\s*/i, '').trim();
      if (!textContent) textContent = 'Text';
      const playheadTime = Player.getCurrentTime();
      const trackEnd = Timeline.getTrackEndTime('text');
      const placeAt = (playheadTime > 0) ? playheadTime : trackEnd;
      Timeline.addClip({
        name: 'Text: ' + textContent.substring(0, 20),
        type: 'text',
        text: textContent,
        duration: 5,
        startTime: placeAt,
      });
      response = `Added text "<strong>${textContent}</strong>" at ${fmtTime(placeAt)} for 5 seconds.`;
    }

    // ==========================================
    // LIST / SHOW CLIPS
    // ==========================================
    else if (has(text, 'what clips', 'list clip', 'show clip', 'my clips', 'list everything', 'what do i have', 'show me what', 'what\'s on', 'how many clip', 'show my')) {
      const clips = Timeline.getClips();
      if (clips.length === 0) {
        response = 'No clips on the timeline yet. Import some media to get started.';
      } else {
        let list = `You have <strong>${clips.length} clip${clips.length > 1 ? 's' : ''}</strong> on the timeline:<ul>`;
        clips.forEach((c, i) => {
          const endTime = c.startTime + c.duration;
          list += `<li><strong>Clip ${i + 1}:</strong> ${c.name} (${c.type}) — ${fmtTime(c.startTime)} to ${fmtTime(endTime)}</li>`;
        });
        list += '</ul>';
        response = list;
      }
    }

    // ==========================================
    // PLAY / PAUSE / STOP
    // ==========================================
    else if ((text === 'play' || has(text, 'start playing', 'resume', 'play the video', 'play video', 'play it')) && !has(text, 'playhead', 'clip', 'display')) {
      Player.play();
      response = 'Playing.';
    }
    else if (has(text, 'pause', 'stop playing')) {
      Player.pause();
      response = 'Paused.';
    }
    else if (text === 'stop' || has(text, 'stop playback', 'stop the video', 'go to start', 'go to beginning')) {
      Player.stop();
      response = 'Stopped. Playhead returned to the beginning.';
    }

    // ==========================================
    // SEEK / JUMP
    // ==========================================
    else if (has(text, 'go to', 'jump to', 'seek to', 'skip to') && extractNumber(text) !== null) {
      const seconds = extractNumber(text);
      Player.seekTo(seconds);
      response = `Jumped to <strong>${fmtTime(seconds)}</strong>.`;
    }

    // ==========================================
    // WHERE AM I
    // ==========================================
    else if (has(text, 'where am i', 'current position', 'what time', 'playhead position', 'where is the playhead')) {
      const current = Player.getCurrentTime();
      const duration = Player.getDuration();
      const clipsHere = Timeline.getClipsAtTime(current);
      let info = `Playhead is at <strong>${fmtTime(current)}</strong> of ${fmtTime(duration)}.`;
      if (clipsHere.length > 0) {
        info += ' Clips at this position: ' + clipsHere.map(c => `<strong>${c.name}</strong>`).join(', ') + '.';
      }
      response = info;
    }

    // ==========================================
    // MUTE / UNMUTE
    // ==========================================
    else if (has(text, 'mute', 'unmute', 'toggle mute', 'toggle sound')) {
      Player.toggleMute();
      response = 'Toggled mute.';
    }

    // ==========================================
    // CLEAR / RESET TIMELINE
    // ==========================================
    else if (has(text, 'clear timeline', 'clear the timeline', 'remove all', 'remove everything', 'start over', 'new project', 'fresh start', 'reset timeline', 'delete all', 'delete everything')) {
      Timeline.clearAll();
      response = 'Timeline cleared. All clips removed.';
    }

    // ==========================================
    // UNDO / REDO
    // ==========================================
    else if (has(text, 'undo')) {
      Timeline.undo();
      response = 'Undone.';
    }
    else if (has(text, 'redo')) {
      Timeline.redo();
      response = 'Redone.';
    }

    // ==========================================
    // ZOOM
    // ==========================================
    else if (has(text, 'zoom in')) {
      Timeline.zoomIn();
      response = 'Zoomed in on the timeline.';
    }
    else if (has(text, 'zoom out')) {
      Timeline.zoomOut();
      response = 'Zoomed out on the timeline.';
    }

    // ==========================================
    // EXPORT
    // ==========================================
    else if (has(text, 'export')) {
      const formats = ['mp4', 'webm', 'avi', 'mov', 'mkv'];
      const matchedFormat = formats.find(f => text.includes(f));
      const dialog = document.getElementById('export-dialog');
      if (matchedFormat) {
        const formatSelect = document.getElementById('export-format');
        if (formatSelect) formatSelect.value = matchedFormat;
        response = `Opening export dialog with <strong>${matchedFormat.toUpperCase()}</strong> selected.`;
      } else {
        response = 'Opening the export dialog.';
      }
      if (dialog) Accessibility.showModal(dialog);
      return; // Don't show chat response dialog since export dialog is opening
    }

    // ==========================================
    // IMPORT
    // ==========================================
    else if (has(text, 'import media', 'import video', 'add media', 'add video', 'open video', 'load video')) {
      if (window.api) window.api.importMedia();
      response = 'Opening the import media dialog.';
    }
    else if (has(text, 'import audio', 'import music', 'add audio', 'add music', 'add sound', 'load audio', 'load music')) {
      if (window.api) window.api.importAudio();
      response = 'Opening the import audio dialog.';
    }

    // ==========================================
    // PHOTO PRESETS
    // ==========================================
    else if (has(text, 'auto enhance', 'enhance photo', 'enhance the photo', 'make the photo better', 'improve photo', 'auto improve')) {
      if (PhotoEditor.hasImage) {
        const result = AIAssistant.autoEnhancePhoto();
        response = result;
      } else {
        response = 'No image loaded. Open an image in the Photo Editor first.';
      }
    }

    // ==========================================
    // STATUS / CONTEXT AWARENESS
    // ==========================================
    else if (has(text, 'status', 'what\'s going on', 'what is going on', 'project status', 'summary', 'overview', 'what\'s happening', 'tell me about my project', 'project info', 'project summary')) {
      const ctx = gatherContext();
      response = buildContextResponse(ctx);
      if (!response) response = 'Ready. Switch to a section and start working!';
    }
    else if (has(text, 'what section', 'which section', 'where am i in the app', 'current section', 'which page', 'what page')) {
      const ctx = gatherContext();
      const sectionNames = {
        'video-editor': 'Video Editor',
        'photo-editor': 'Photo Editor',
        'file-converter': 'File Converter',
        'user-guide': 'User Guide',
        'settings': 'Settings',
      };
      response = `You're in the <strong>${sectionNames[ctx.activeSection] || 'Unknown'}</strong> section. ` + buildContextResponse(ctx);
    }
    else if (has(text, 'suggest', 'what should i do', 'what can i do', 'tips', 'what next', 'next step', 'any suggestions')) {
      const ctx = gatherContext();
      const suggestions = [];
      if (ctx.activeSection === 'video-editor') {
        if (ctx.clipCount === 0) {
          suggestions.push('Import some media to get started — say "import media" or use Ctrl+I.');
        } else {
          if (ctx.clipsWithTransitions === 0) suggestions.push('Add transitions between clips for a smoother flow — say "add fade transition".');
          if (ctx.clipsWithFilters === 0) suggestions.push('Try a filter like "make it cinematic" or "apply vintage filter".');
          if (ctx.audioClips === 0) suggestions.push('Add some background music — say "import audio".');
          if (ctx.textClips === 0) suggestions.push('Add a title — say "add text My Video Title".');
          if (ctx.clipCount > 1 && !ctx.selectedClip) suggestions.push('Select a clip to edit its properties or add effects.');
          suggestions.push('When done, say "export" to render your video.');
        }
      } else if (ctx.activeSection === 'photo-editor') {
        if (!ctx.hasPhoto) {
          suggestions.push('Open an image to start editing.');
        } else {
          suggestions.push('Try "describe the image" to learn about it.');
          suggestions.push('"Remove background" or "blur background" for portrait effects.');
          suggestions.push('"Auto enhance" for automatic color correction.');
        }
      }
      response = suggestions.length > 0
        ? '<strong>Suggestions:</strong><ul>' + suggestions.map(s => `<li>${s}</li>`).join('') + '</ul>'
        : 'Looking good! Keep working on your project.';
    }

    // ==========================================
    // MEMORY COMMANDS
    // ==========================================
    else if (has(text, 'remember that', 'remember my', 'remember this', 'save that', 'note that', 'keep in mind')) {
      const fact = text
        .replace(/^.*(remember|save|note|keep in mind)\s+(that|my|this)?\s*/i, '')
        .trim();
      if (!fact) {
        response = 'What should I remember? For example: "remember that my project is called My Video"';
      } else {
        const key = fact.substring(0, 30).replace(/\s+/g, '-').toLowerCase();
        remember(key, fact);
        response = `Got it! I'll remember: "<strong>${fact}</strong>". This will persist across sessions.`;
      }
    }
    else if (has(text, 'what do you remember', 'what do you know about me', 'show memories', 'show memory', 'recall', 'my memories')) {
      const mem = recall();
      const entries = Object.entries(mem);
      if (entries.length === 0) {
        response = 'I don\'t have any saved memories yet. Tell me something to remember! For example: "remember that I prefer dark mode"';
      } else {
        let list = '<strong>Things I remember:</strong><ul>';
        entries.forEach(([key, val]) => {
          const ago = Math.round((Date.now() - val.time) / 60000);
          const timeStr = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.round(ago / 60)}h ago` : `${Math.round(ago / 1440)}d ago`;
          list += `<li>${val.value} <em>(${timeStr})</em></li>`;
        });
        list += '</ul>Say "forget [topic]" to remove a memory.';
        response = list;
      }
    }
    else if (has(text, 'forget') && !has(text, 'clip', 'filter', 'background', 'transition')) {
      const topic = text.replace(/^.*forget\s*/i, '').replace(/^(about|that|the)\s*/i, '').trim();
      if (!topic) {
        response = 'What should I forget? Say "forget [topic]" or "forget everything" to clear all memories.';
      } else if (has(topic, 'everything', 'all', 'all memories')) {
        saveMemory({});
        response = 'All memories cleared.';
      } else {
        const mem = loadMemory();
        const keys = Object.keys(mem);
        const match = keys.find(k => k.includes(topic.toLowerCase().replace(/\s+/g, '-')) || mem[k].value.toLowerCase().includes(topic.toLowerCase()));
        if (match) {
          const val = mem[match].value;
          forget(match);
          response = `Forgot: "<strong>${val}</strong>"`;
        } else {
          response = `I don't have a memory about "${topic}". Say "show memories" to see what I remember.`;
        }
      }
    }
    else if (has(text, 'history', 'last commands', 'recent commands', 'what did i say', 'what have i done', 'previous commands')) {
      const hist = loadHistory();
      if (hist.length === 0) {
        response = 'No command history yet.';
      } else {
        const recent = hist.slice(-10);
        let list = `<strong>Recent commands (${recent.length}):</strong><ul>`;
        recent.forEach(h => {
          const ago = Math.round((Date.now() - h.time) / 60000);
          const timeStr = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
          list += `<li>"${h.input}" <em>(${timeStr})</em></li>`;
        });
        list += '</ul>';
        response = list;
      }
    }

    // ==========================================
    // HELP
    // ==========================================
    else if (has(text, 'help', 'commands', 'what can you', 'what do you', 'how do i', 'how to', 'instructions', 'what are the commands')) {
      response = `I understand natural language! Here's what I can do:

<strong>Video Editing:</strong>
<ul>
  <li>"trim the first 5 seconds" / "trim the last 3 seconds"</li>
  <li>"split at 10 seconds" / "split here"</li>
  <li>"delete this clip" / "duplicate this clip"</li>
  <li>"set volume to 50" / "make it louder"</li>
  <li>"set speed to 2x" / "slow it down"</li>
  <li>"add text hello world"</li>
  <li>"what clips do I have"</li>
</ul>

<strong>Transitions:</strong>
<ul>
  <li>"add fade transition" / "dissolve" / "wipe left" / "slide right" / "zoom"</li>
  <li>"add 2 second zoom transition" — specify duration</li>
  <li>"remove transition" / "no transition"</li>
</ul>

<strong>Fade In/Out:</strong>
<ul>
  <li>"fade in 2 seconds" / "fade out 3 seconds" — both video and audio</li>
  <li>"fade in video 2 seconds" / "fade out audio 1 second" — separate control</li>
  <li>"clear fade" / "remove fade"</li>
</ul>

<strong>Clip Management:</strong>
<ul>
  <li>"rename clip Intro Scene" / "call this Opening Shot"</li>
  <li>"detach clip" — remove from main timeline for overlay layers</li>
  <li>"reattach clip" / "attach clip" — back to main timeline</li>
  <li>"set layer 2" — change overlay layer</li>
</ul>

<strong>Filters & Color:</strong>
<ul>
  <li>"make it cinematic" / "apply vintage" / "black and white"</li>
  <li>"set brightness to 120" / "darken it"</li>
  <li>"increase contrast" / "boost saturation"</li>
  <li>"remove all filters"</li>
</ul>

<strong>Photo Editing:</strong>
<ul>
  <li>"describe the image" — tells you what's in the photo</li>
  <li>"remove background" / "blur background"</li>
  <li>"remove the person in the middle"</li>
  <li>"auto enhance"</li>
</ul>

<strong>Playback:</strong>
<ul>
  <li>"play" / "pause" / "stop"</li>
  <li>"go to 30 seconds" / "where am I"</li>
  <li>"mute" / "unmute"</li>
</ul>

<strong>Memory & History:</strong>
<ul>
  <li>"remember that my project is called X"</li>
  <li>"what do you remember" / "show memories"</li>
  <li>"forget [topic]" / "forget everything"</li>
  <li>"history" / "recent commands"</li>
</ul>

<strong>Advanced Features:</strong>
<ul>
  <li>"green screen" / "chroma key" / "remove green" / "blue screen"</li>
  <li>"add keyframe opacity 2 50" — animate properties over time</li>
  <li>"speed ramp up" / "speed ramp down" / "dramatic speed ramp"</li>
  <li>"ken burns zoom in" / "pan left" / "pan right"</li>
  <li>"freeze frame" — hold current frame for a set duration</li>
  <li>"pip bottom right" / "pip top left" — picture-in-picture</li>
  <li>"color correction warm" / "temperature 50" / "tint"</li>
  <li>"enable ducking" — auto-lower music when speech plays</li>
  <li>"snap on" / "snap off" — timeline snapping</li>
  <li>"add lower third title" / "opening credits" — title templates</li>
  <li>"add marker" / "next marker" / "list markers"</li>
</ul>

<strong>Smart Tools:</strong>
<ul>
  <li>"auto color correct" / "suggest edits"</li>
  <li>"close gaps" / "create montage"</li>
  <li>"search for rain sound effect"</li>
  <li>"find background jazz music"</li>
  <li>"export as mp4" / "import media"</li>
  <li>"undo" / "redo" / "clear timeline"</li>
</ul>`;
    }

    // ==========================================
    // CATCH COMMON NATURAL PHRASES
    // ==========================================
    else if (has(text, 'make it') && has(text, 'black and white', 'b&w', 'grayscale', 'grey', 'gray')) {
      Effects.applyPreset('noir');
      response = 'Applied black and white filter.';
    }
    else if (has(text, 'make it') && has(text, 'bright', 'lighter')) {
      Effects.setFilter('brightness', 130);
      response = 'Brightened the video (130%).';
    }
    else if (has(text, 'make it') && has(text, 'dark', 'dim')) {
      Effects.setFilter('brightness', 70);
      response = 'Darkened the video (70%).';
    }
    else if (has(text, 'make it') && has(text, 'slow', 'slower')) {
      let clip = requireClip();
      if (!clip) { const clips = Timeline.getClips(); if (clips.length > 0) { clip = clips[0]; Timeline.selectClip(clip.id); } }
      if (clip) {
        const newSpeed = Math.max(0.25, (clip.speed || 1) / 2);
        Timeline.updateClipProperty(clip.id, 'speed', newSpeed);
        response = `Slowed down to <strong>${newSpeed}x</strong>.`;
      } else { response = 'No clips on the timeline.'; }
    }
    else if (has(text, 'make it') && has(text, 'fast', 'quicker')) {
      let clip = requireClip();
      if (!clip) { const clips = Timeline.getClips(); if (clips.length > 0) { clip = clips[0]; Timeline.selectClip(clip.id); } }
      if (clip) {
        const newSpeed = Math.min(4, (clip.speed || 1) * 2);
        Timeline.updateClipProperty(clip.id, 'speed', newSpeed);
        response = `Sped up to <strong>${newSpeed}x</strong>.`;
      } else { response = 'No clips on the timeline.'; }
    }

    // ==========================================
    // CHROMA KEY / GREEN SCREEN
    // ==========================================
    else if (has(text, 'chroma', 'green screen', 'greenscreen', 'chromakey', 'chroma key', 'remove green', 'blue screen', 'bluescreen')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'remove', 'clear', 'off', 'disable', 'none', 'no chroma', 'no green screen')) {
        Timeline.clearChromaKey(clip.id);
        response = `Removed chroma key from "<strong>${clip.name}</strong>".`;
      } else {
        let color = '#00ff00';
        if (has(text, 'blue')) color = '#0000ff';
        else if (has(text, 'red')) color = '#ff0000';
        else if (has(text, 'white')) color = '#ffffff';
        const tolerance = extractNumber(text) || 40;
        Timeline.setChromaKey(clip.id, color, tolerance, 10);
        response = `Applied chroma key (${color === '#00ff00' ? 'green' : color === '#0000ff' ? 'blue' : color}) to "<strong>${clip.name}</strong>" with tolerance ${tolerance}.<br>Adjust tolerance with "set chroma tolerance 50".`;
      }
    }

    // ==========================================
    // KEYFRAME ANIMATION
    // ==========================================
    else if (has(text, 'keyframe', 'key frame', 'animate', 'animation') && !has(text, 'ken burns')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'clear', 'remove', 'delete', 'reset') && has(text, 'all', 'keyframe', 'animation')) {
        Timeline.updateClipProperty(clip.id, 'keyframes', null);
        response = `Cleared all keyframes from "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'add', 'set', 'create')) {
        const nums = extractNumbers(text);
        let property = 'opacity';
        if (has(text, 'scale', 'size', 'zoom')) property = 'scale';
        else if (has(text, 'x', 'horizontal', 'left', 'right') && !has(text, 'opacity')) property = 'x';
        else if (has(text, 'y', 'vertical', 'up', 'down') && !has(text, 'opacity')) property = 'y';
        else if (has(text, 'rotation', 'rotate', 'angle', 'spin')) property = 'rotation';
        else if (has(text, 'opacity', 'transparent', 'alpha', 'visibility')) property = 'opacity';

        if (nums.length >= 2) {
          const time = nums[0];
          const value = nums[1];
          Timeline.addKeyframe(clip.id, property, time, value);
          response = `Added keyframe: <strong>${property}</strong> = ${value} at ${fmtTime(time)} on "<strong>${clip.name}</strong>".`;
        } else {
          response = `Specify time and value. Examples:<ul><li>"add keyframe opacity at 2 seconds value 50"</li><li>"add scale keyframe 0 100" (time 0s, value 100)</li><li>"add rotation keyframe 5 180"</li></ul>`;
        }
      } else {
        response = `Keyframe commands:<ul><li>"add keyframe opacity 0 100" — opacity 100 at 0s</li><li>"add scale keyframe 2 50" — scale 50% at 2s</li><li>"add rotation keyframe 5 180" — rotate 180° at 5s</li><li>"clear all keyframes"</li></ul>`;
      }
    }

    // ==========================================
    // SPEED RAMPING
    // ==========================================
    else if (has(text, 'speed ramp', 'ramp speed', 'speed ramping', 'variable speed', 'ramp up', 'ramp down') && !has(text, 'what', 'help')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'clear', 'remove', 'reset', 'off', 'none')) {
        Timeline.updateClipProperty(clip.id, 'speedRamp', null);
        response = `Removed speed ramp from "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'ramp up', 'accelerate', 'speed up ramp', 'slow to fast')) {
        Timeline.setSpeedRamp(clip.id, [{ time: 0, speed: 0.5 }, { time: clip.duration, speed: 2 }]);
        response = `Applied speed ramp up (0.5x → 2x) to "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'ramp down', 'decelerate', 'slow down ramp', 'fast to slow')) {
        Timeline.setSpeedRamp(clip.id, [{ time: 0, speed: 2 }, { time: clip.duration, speed: 0.5 }]);
        response = `Applied speed ramp down (2x → 0.5x) to "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'dramatic', 'punch', 'impact', 'highlight')) {
        const mid = clip.duration / 2;
        Timeline.setSpeedRamp(clip.id, [{ time: 0, speed: 1 }, { time: mid - 0.5, speed: 0.3 }, { time: mid + 0.5, speed: 0.3 }, { time: clip.duration, speed: 1 }]);
        response = `Applied dramatic speed ramp (slow-mo at center) to "<strong>${clip.name}</strong>".`;
      } else {
        response = `Speed ramp commands:<ul><li>"speed ramp up" — gradually accelerate</li><li>"speed ramp down" — gradually decelerate</li><li>"dramatic speed ramp" — slow-mo at the center</li><li>"clear speed ramp"</li></ul>`;
      }
    }

    // ==========================================
    // MARKERS
    // ==========================================
    else if (has(text, 'marker', 'add marker', 'set marker', 'remove marker', 'next marker', 'previous marker', 'prev marker', 'list marker', 'show marker', 'go to marker')) {
      if (has(text, 'remove', 'delete', 'clear') && has(text, 'all')) {
        const markers = Timeline.getMarkers ? Timeline.getMarkers() : [];
        markers.forEach(m => Timeline.removeMarker(m.id));
        response = 'All markers removed.';
      } else if (has(text, 'remove', 'delete')) {
        const markers = Timeline.getMarkers ? Timeline.getMarkers() : [];
        if (markers.length === 0) { response = 'No markers to remove.'; }
        else {
          const last = markers[markers.length - 1];
          Timeline.removeMarker(last.id);
          response = `Removed marker "<strong>${last.label}</strong>".`;
        }
      } else if (has(text, 'next')) {
        const current = Player.getCurrentTime();
        const next = Timeline.getNextMarker(current);
        if (next) {
          Player.seekTo(next.time);
          response = `Jumped to marker "<strong>${next.label}</strong>" at ${fmtTime(next.time)}.`;
        } else { response = 'No more markers ahead.'; }
      } else if (has(text, 'prev', 'previous', 'back', 'last')) {
        const current = Player.getCurrentTime();
        const prev = Timeline.getPrevMarker(current);
        if (prev) {
          Player.seekTo(prev.time);
          response = `Jumped to marker "<strong>${prev.label}</strong>" at ${fmtTime(prev.time)}.`;
        } else { response = 'No markers before this position.'; }
      } else if (has(text, 'list', 'show', 'what marker', 'all marker')) {
        const markers = Timeline.getMarkers ? Timeline.getMarkers() : [];
        if (markers.length === 0) { response = 'No markers set.'; }
        else {
          let list = `<strong>${markers.length} marker${markers.length > 1 ? 's' : ''}:</strong><ul>`;
          markers.forEach(m => { list += `<li><strong>${m.label}</strong> at ${fmtTime(m.time)}</li>`; });
          list += '</ul>Say "next marker" or "previous marker" to navigate.';
          response = list;
        }
      } else if (has(text, 'go to', 'jump to')) {
        const markers = Timeline.getMarkers ? Timeline.getMarkers() : [];
        const label = text.replace(/.*(?:go to|jump to)\s*marker\s*/i, '').trim();
        const found = markers.find(m => m.label.toLowerCase().includes(label));
        if (found) {
          Player.seekTo(found.time);
          response = `Jumped to marker "<strong>${found.label}</strong>" at ${fmtTime(found.time)}.`;
        } else { response = `Marker "${label}" not found. Say "list markers" to see all.`; }
      } else {
        // Add marker at current playhead
        const time = Player.getCurrentTime();
        let label = text.replace(/^.*(?:add|set|place|put|create)\s*(?:a\s*)?marker\s*/i, '').trim();
        if (!label || label === text.trim().toLowerCase()) label = `Marker at ${fmtTime(time)}`;
        const color = has(text, 'red') ? 'red' : has(text, 'blue') ? 'blue' : has(text, 'green') ? 'green' : has(text, 'yellow') ? 'yellow' : '#ff5722';
        Timeline.addMarker(time, label, color);
        response = `Added marker "<strong>${label}</strong>" at ${fmtTime(time)}.`;
      }
    }

    // ==========================================
    // FREEZE FRAME
    // ==========================================
    else if (has(text, 'freeze frame', 'freeze this', 'still frame', 'hold frame', 'freeze at')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else {
        const nums = extractNumbers(text);
        const time = nums.length > 0 ? nums[0] : Player.getCurrentTime();
        const duration = nums.length > 1 ? nums[1] : 3;
        Timeline.freezeFrame(clip.id, time, duration);
        response = `Freeze frame inserted at ${fmtTime(time)} for <strong>${duration} seconds</strong> on "<strong>${clip.name}</strong>".`;
      }
    }

    // ==========================================
    // KEN BURNS EFFECT
    // ==========================================
    else if (has(text, 'ken burns', 'pan and zoom', 'pan & zoom', 'slow zoom', 'zoom effect', 'cinematic zoom', 'pan across')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'remove', 'clear', 'off', 'disable', 'none', 'no ken')) {
        Timeline.clearKenBurns(clip.id);
        response = `Removed Ken Burns effect from "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'zoom in', 'push in')) {
        Timeline.setKenBurns(clip.id, 50, 50, 1, 50, 50, 1.5);
        response = `Applied Ken Burns <strong>zoom in</strong> to "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'zoom out', 'pull out', 'pull back')) {
        Timeline.setKenBurns(clip.id, 50, 50, 1.5, 50, 50, 1);
        response = `Applied Ken Burns <strong>zoom out</strong> to "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'pan left', 'slide left', 'move left')) {
        Timeline.setKenBurns(clip.id, 70, 50, 1.1, 30, 50, 1.1);
        response = `Applied Ken Burns <strong>pan left</strong> to "<strong>${clip.name}</strong>".`;
      } else if (has(text, 'pan right', 'slide right', 'move right')) {
        Timeline.setKenBurns(clip.id, 30, 50, 1.1, 70, 50, 1.1);
        response = `Applied Ken Burns <strong>pan right</strong> to "<strong>${clip.name}</strong>".`;
      } else {
        Timeline.setKenBurns(clip.id, 50, 50, 1, 50, 50, 1.3);
        response = `Applied Ken Burns <strong>slow zoom in</strong> to "<strong>${clip.name}</strong>".<br>Options: "ken burns zoom in", "zoom out", "pan left", "pan right", or "remove ken burns".`;
      }
    }

    // ==========================================
    // PICTURE IN PICTURE (PIP)
    // ==========================================
    else if (has(text, 'pip', 'picture in picture', 'picture-in-picture', 'overlay position', 'pip preset')) {
      const clip = requireClip();
      if (!clip) { response = 'No clip selected. Select a clip first.'; }
      else if (has(text, 'remove', 'clear', 'off', 'none', 'no pip', 'reset pip')) {
        Timeline.updateClipProperty(clip.id, 'pip', null);
        response = `Removed PIP position from "<strong>${clip.name}</strong>".`;
      } else {
        let preset = null;
        if (has(text, 'top left', 'top-left', 'upper left')) preset = 'top-left';
        else if (has(text, 'top right', 'top-right', 'upper right')) preset = 'top-right';
        else if (has(text, 'bottom left', 'bottom-left', 'lower left')) preset = 'bottom-left';
        else if (has(text, 'bottom right', 'bottom-right', 'lower right')) preset = 'bottom-right';
        else if (has(text, 'center', 'middle')) preset = 'center-small';
        else if (has(text, 'side by side left', 'side-by-side left', 'left half')) preset = 'side-by-side-left';
        else if (has(text, 'side by side right', 'side-by-side right', 'right half')) preset = 'side-by-side-right';
        else preset = 'bottom-right';

        Timeline.setPipPreset(clip.id, preset);
        response = `Applied PIP preset <strong>${preset}</strong> to "<strong>${clip.name}</strong>".<br>Options: top-left, top-right, bottom-left, bottom-right, center, side-by-side-left, side-by-side-right.`;
      }
    }

    // ==========================================
    // COLOR CORRECTION
    // ==========================================
    else if (has(text, 'color correct', 'color correction', 'colour correct', 'colour correction', 'white balance', 'color balance', 'colour balance', 'color grade', 'colour grade', 'color grading')) {
      if (has(text, 'reset', 'clear', 'remove', 'off', 'none')) {
        Effects.resetColorCorrection();
        response = 'Color correction reset to defaults.';
      } else if (has(text, 'temperature', 'temp', 'warm', 'cool')) {
        const num = extractNumber(text);
        if (num !== null) {
          const val = has(text, 'cool', 'cold') ? -Math.abs(num) : Math.abs(num);
          Effects.setColorCorrection('temperature', val);
          response = `Color temperature set to <strong>${val}</strong>.`;
        } else if (has(text, 'warm', 'warmer')) {
          Effects.setColorCorrection('temperature', 50);
          response = 'Warmed up the color temperature (+50).';
        } else if (has(text, 'cool', 'cooler', 'cold')) {
          Effects.setColorCorrection('temperature', -50);
          response = 'Cooled down the color temperature (-50).';
        }
      } else if (has(text, 'tint')) {
        const num = extractNumber(text);
        if (num !== null) {
          const val = has(text, 'green') ? -Math.abs(num) : Math.abs(num);
          Effects.setColorCorrection('tint', val);
          response = `Tint set to <strong>${val}</strong>.`;
        } else { response = 'Specify a tint value, e.g. "color correction tint 30" or "color correction tint green 20".'; }
      } else if (has(text, 'red')) {
        const num = extractNumber(text) || 120;
        Effects.setColorCorrection('redBalance', num);
        response = `Red balance set to <strong>${num}%</strong>.`;
      } else if (has(text, 'green') && !has(text, 'screen')) {
        const num = extractNumber(text) || 120;
        Effects.setColorCorrection('greenBalance', num);
        response = `Green balance set to <strong>${num}%</strong>.`;
      } else if (has(text, 'blue')) {
        const num = extractNumber(text) || 120;
        Effects.setColorCorrection('blueBalance', num);
        response = `Blue balance set to <strong>${num}%</strong>.`;
      } else if (has(text, 'shadow')) {
        const num = extractNumber(text) || 20;
        Effects.setColorCorrection('shadows', num);
        response = `Shadows set to <strong>${num}</strong>.`;
      } else if (has(text, 'highlight')) {
        const num = extractNumber(text) || 20;
        Effects.setColorCorrection('highlights', num);
        response = `Highlights set to <strong>${num}</strong>.`;
      } else {
        response = `Color correction commands:<ul><li>"color correction warm" / "cool"</li><li>"color correction temperature 50"</li><li>"color correction tint 20"</li><li>"color correction red 120"</li><li>"color correction shadows 30"</li><li>"reset color correction"</li></ul>`;
      }
    }

    // ==========================================
    // AUDIO DUCKING
    // ==========================================
    else if (has(text, 'ducking', 'audio duck', 'duck audio', 'duck music', 'auto duck')) {
      if (has(text, 'off', 'disable', 'remove', 'stop', 'no duck', 'none')) {
        Effects.setAudioDucking(false);
        response = 'Audio ducking <strong>disabled</strong>.';
      } else if (has(text, 'on', 'enable', 'start', 'activate')) {
        const amount = extractNumber(text) || 30;
        Effects.setAudioDucking(true, amount);
        response = `Audio ducking <strong>enabled</strong> — music reduced by ${amount}% when speech is detected.`;
      } else {
        const amount = extractNumber(text);
        if (amount !== null) {
          Effects.setAudioDucking(true, amount);
          response = `Audio ducking set to <strong>${amount}%</strong> reduction.`;
        } else {
          const isEnabled = Effects.isAudioDuckingEnabled();
          response = `Audio ducking is currently <strong>${isEnabled ? 'enabled' : 'disabled'}</strong>. ${isEnabled ? `Reducing music by ${Effects.getDuckAmount()}%.` : ''}<br>Commands: "enable ducking", "disable ducking", "set ducking to 50%".`;
        }
      }
    }

    // ==========================================
    // SNAPPING
    // ==========================================
    else if (has(text, 'snap', 'snapping') && !has(text, 'snapshot')) {
      if (has(text, 'off', 'disable', 'no snap', 'none', 'on', 'enable', 'activate', 'yes', 'toggle')) {
        Timeline.toggleSnap();
        response = `Snapping toggled. Say "snap" again to toggle back.`;
      } else {
        response = `Snapping controls timeline clip alignment. Say "snap toggle" to turn it on or off.`;
      }
    }

    // ==========================================
    // TITLE TEMPLATES
    // ==========================================
    else if (has(text, 'title template', 'add title', 'title card', 'lower third', 'opening credit', 'end credit', 'chapter title', 'subtitle card', 'news banner', 'countdown title')) {
      let templateName = null;
      if (has(text, 'lower third')) templateName = 'Lower Third';
      else if (has(text, 'opening credit')) templateName = 'Opening Credits';
      else if (has(text, 'end credit')) templateName = 'End Credits';
      else if (has(text, 'chapter')) templateName = 'Chapter Title';
      else if (has(text, 'subtitle card')) templateName = 'Subtitle Card';
      else if (has(text, 'bold intro')) templateName = 'Bold Intro';
      else if (has(text, 'minimalist')) templateName = 'Minimalist';
      else if (has(text, 'news banner')) templateName = 'News Banner';
      else if (has(text, 'quote')) templateName = 'Quote';
      else if (has(text, 'countdown')) templateName = 'Countdown';
      else if (has(text, 'social')) templateName = 'Social Handle';
      else if (has(text, 'simple')) templateName = 'Simple Title';

      if (templateName && Timeline.getTitleTemplates) {
        const templates = Timeline.getTitleTemplates();
        const tmpl = templates.find(t => t.name === templateName);
        if (tmpl) {
          const playheadTime = Player.getCurrentTime();
          Timeline.addClip({
            name: templateName,
            type: 'text',
            text: tmpl.text || templateName,
            duration: tmpl.duration || 5,
            startTime: playheadTime,
            titleStyle: tmpl.style || null,
          });
          response = `Added <strong>${templateName}</strong> title template at ${fmtTime(playheadTime)}.`;
        } else { response = `Template "${templateName}" not found.`; }
      } else if (has(text, 'list', 'show', 'what', 'available')) {
        const names = Timeline.getTitleTemplates ? Timeline.getTitleTemplates().map(t => t.name) : [];
        response = `Available title templates:<ul>${names.map(n => `<li>${n}</li>`).join('')}</ul>Say a template name to add it, e.g. "add lower third title".`;
      } else {
        response = `Title templates available:<ul><li>Simple Title</li><li>Lower Third</li><li>Opening Credits / End Credits</li><li>Chapter Title</li><li>Bold Intro / Minimalist</li><li>News Banner / Quote / Countdown</li><li>Social Handle</li></ul>Say e.g. "add lower third title" to insert one.`;
      }
    }

    // ==========================================
    // AI ASSISTANT FALLBACK (sound search, auto-edit, etc.)
    // ==========================================
    else {
      const aiResponse = AIAssistant.processAICommand(text);
      if (aiResponse) {
        response = aiResponse;
      } else {
        // Check if Gemini is not set up — nudge the user
      const geminiHint = !Gemini.isAvailable() ? '<br><br><strong>Tip:</strong> Connect a free Gemini API key in Settings for much better natural language understanding.' : '';
      response = `I didn't quite catch that. Try something like:
<ul>
  <li>"split" / "split at 10 seconds"</li>
  <li>"delete this" / "remove it"</li>
  <li>"trim the first 5 seconds"</li>
  <li>"make it cinematic" / "vintage" / "black and white"</li>
  <li>"describe image" / "remove background"</li>
  <li>"set volume to 50" / "louder" / "speed up"</li>
  <li>"export" / "play" / "undo"</li>
</ul>
Type <strong>help</strong> for the full list.${geminiHint}`;
      }
    }

    if (response) {
      showResponse(response);
    }

    // Track in history for memory/context
    trackCommand(input, response);
  }

  /** Describe what's in the loaded image */
  function describeImage() {
    const canvas = document.getElementById('photo-canvas');
    if (!canvas) return 'Cannot access the photo canvas.';
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    if (w === 0 || h === 0) return 'The image canvas is empty.';

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const totalPixels = w * h;

    // Analyze colors
    let rTotal = 0, gTotal = 0, bTotal = 0;
    let brightPixels = 0, darkPixels = 0;
    let redPixels = 0, greenPixels = 0, bluePixels = 0;
    let whitePixels = 0, blackPixels = 0;
    let skinTonePixels = 0;
    let transparentPixels = 0;

    // Region analysis (quadrants)
    const regions = { topLeft: { r: 0, g: 0, b: 0, n: 0 }, topRight: { r: 0, g: 0, b: 0, n: 0 },
                      bottomLeft: { r: 0, g: 0, b: 0, n: 0 }, bottomRight: { r: 0, g: 0, b: 0, n: 0 },
                      center: { r: 0, g: 0, b: 0, n: 0 } };
    const cx = w / 2, cy = h / 2, cw = w * 0.3, ch = h * 0.3;

    // Edge complexity (variance along edges)
    let edgeVariance = 0, edgeSamples = 0;
    let prevBrightness = -1;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      rTotal += r; gTotal += g; bTotal += b;

      if (a < 128) transparentPixels++;

      const brightness = (r + g + b) / 3;
      if (brightness > 200) brightPixels++;
      if (brightness < 55) darkPixels++;
      if (brightness > 240 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) whitePixels++;
      if (brightness < 15) blackPixels++;

      // Dominant color channel
      if (r > g + 30 && r > b + 30) redPixels++;
      else if (g > r + 30 && g > b + 30) greenPixels++;
      else if (b > r + 30 && b > g + 30) bluePixels++;

      // Skin tone detection (loose heuristic)
      if (r > 95 && g > 40 && b > 20 && r > g && r > b &&
          (r - g) > 15 && Math.abs(r - g) < 100 && a > 200) {
        skinTonePixels++;
      }

      // Region assignment
      const px = (i / 4) % w;
      const py = Math.floor(i / 4 / w);
      if (px < w / 2 && py < h / 2) { regions.topLeft.r += r; regions.topLeft.g += g; regions.topLeft.b += b; regions.topLeft.n++; }
      else if (px >= w / 2 && py < h / 2) { regions.topRight.r += r; regions.topRight.g += g; regions.topRight.b += b; regions.topRight.n++; }
      else if (px < w / 2) { regions.bottomLeft.r += r; regions.bottomLeft.g += g; regions.bottomLeft.b += b; regions.bottomLeft.n++; }
      else { regions.bottomRight.r += r; regions.bottomRight.g += g; regions.bottomRight.b += b; regions.bottomRight.n++; }
      if (Math.abs(px - cx) < cw && Math.abs(py - cy) < ch) {
        regions.center.r += r; regions.center.g += g; regions.center.b += b; regions.center.n++;
      }

      // Edge variance (sample edges)
      if (py === 0 || py === h - 1 || px === 0 || px === w - 1) {
        if (prevBrightness >= 0) {
          edgeVariance += Math.abs(brightness - prevBrightness);
          edgeSamples++;
        }
        prevBrightness = brightness;
      }
    }

    const avgR = Math.round(rTotal / totalPixels);
    const avgG = Math.round(gTotal / totalPixels);
    const avgB = Math.round(bTotal / totalPixels);
    const avgBrightness = Math.round((avgR + avgG + avgB) / 3);
    const skinPercent = Math.round(skinTonePixels / totalPixels * 100);
    const transPercent = Math.round(transparentPixels / totalPixels * 100);
    const avgEdgeVar = edgeSamples > 0 ? edgeVariance / edgeSamples : 0;

    // Color temperature
    const colorTemp = avgR > avgB + 20 ? 'warm' : avgB > avgR + 20 ? 'cool' : 'neutral';

    // Build description
    let desc = `<strong>Image Analysis:</strong><ul>`;
    desc += `<li><strong>Size:</strong> ${w} × ${h} pixels (${(w * h / 1000000).toFixed(1)} megapixels)</li>`;

    // Orientation
    if (w > h * 1.2) desc += `<li><strong>Orientation:</strong> Landscape (wider than tall)</li>`;
    else if (h > w * 1.2) desc += `<li><strong>Orientation:</strong> Portrait (taller than wide)</li>`;
    else desc += `<li><strong>Orientation:</strong> Square</li>`;

    // Overall brightness
    if (avgBrightness > 180) desc += `<li><strong>Exposure:</strong> Very bright, possibly overexposed in areas</li>`;
    else if (avgBrightness > 130) desc += `<li><strong>Exposure:</strong> Well-lit, bright image</li>`;
    else if (avgBrightness > 80) desc += `<li><strong>Exposure:</strong> Normal exposure, good balance</li>`;
    else if (avgBrightness > 40) desc += `<li><strong>Exposure:</strong> Underexposed, dark image</li>`;
    else desc += `<li><strong>Exposure:</strong> Very dark, severely underexposed</li>`;

    // Color temperature
    desc += `<li><strong>Color temperature:</strong> ${colorTemp === 'warm' ? 'Warm tones (more red/orange)' : colorTemp === 'cool' ? 'Cool tones (more blue)' : 'Neutral/balanced'}</li>`;

    // Dominant colors
    const colorPercs = [
      { name: 'Red tones', count: redPixels },
      { name: 'Green tones', count: greenPixels },
      { name: 'Blue tones', count: bluePixels },
    ].sort((a, b) => b.count - a.count);

    const topColor = colorPercs[0];
    if (topColor.count > totalPixels * 0.15) {
      desc += `<li><strong>Dominant color:</strong> ${topColor.name} (${Math.round(topColor.count / totalPixels * 100)}% of pixels)</li>`;
    } else {
      desc += `<li><strong>Colors:</strong> Mixed, no single dominant color</li>`;
    }

    // Content hints
    if (skinPercent > 5) {
      desc += `<li><strong>Content hint:</strong> Likely contains people or skin tones (~${skinPercent}% of pixels)</li>`;
    }
    if (transPercent > 5) {
      desc += `<li><strong>Transparency:</strong> ${transPercent}% transparent pixels (background already removed?)</li>`;
    }

    // Background complexity
    if (avgEdgeVar < 10) {
      desc += `<li><strong>Background:</strong> Edges are very uniform — likely a solid or simple background (good for removal)</li>`;
    } else if (avgEdgeVar < 30) {
      desc += `<li><strong>Background:</strong> Edges are fairly uniform — background removal should work well</li>`;
    } else {
      desc += `<li><strong>Background:</strong> Complex/varied edges — background removal may need higher tolerance</li>`;
    }

    // Region analysis
    desc += `</ul><strong>Regions:</strong><ul>`;
    for (const [name, reg] of Object.entries(regions)) {
      if (reg.n === 0) continue;
      const rAvg = Math.round(reg.r / reg.n);
      const gAvg = Math.round(reg.g / reg.n);
      const bAvg = Math.round(reg.b / reg.n);
      const bri = Math.round((rAvg + gAvg + bAvg) / 3);
      const label = name.replace(/([A-Z])/g, ' $1').trim();
      const briLabel = bri > 180 ? 'very bright' : bri > 130 ? 'bright' : bri > 80 ? 'medium' : bri > 40 ? 'dark' : 'very dark';
      desc += `<li><strong>${label}:</strong> ${briLabel} (avg brightness ${bri})</li>`;
    }

    // White/Black areas
    const whitePercent = Math.round(whitePixels / totalPixels * 100);
    const blackPercent = Math.round(blackPixels / totalPixels * 100);

    // Contrast estimation
    const brightPercent = Math.round(brightPixels / totalPixels * 100);
    const darkPercent = Math.round(darkPixels / totalPixels * 100);

    // Suggestions
    desc += `</ul><strong>Editing Suggestions:</strong><ul>`;
    if (avgBrightness < 80) desc += `<li>"brighten it" or "set brightness to 30" to lighten</li>`;
    if (avgBrightness > 180) desc += `<li>"darken it" or "set brightness to -20" to reduce brightness</li>`;
    if (brightPercent < 10 && darkPercent < 10) desc += `<li>"increase contrast" to add more punch</li>`;
    if (colorTemp === 'cool') desc += `<li>"apply warm filter" to balance the cool tones</li>`;
    if (colorTemp === 'warm') desc += `<li>"apply cool filter" to balance the warm tones</li>`;
    if (topColor.count < totalPixels * 0.05) desc += `<li>"boost saturation" to make colors more vivid</li>`;
    if (skinPercent > 5) desc += `<li>"blur background" for a portrait/bokeh effect</li>`;
    if (avgEdgeVar < 30 && transPercent < 5) desc += `<li>"remove background" — the background looks suitable for removal</li>`;
    if (skinPercent > 5) desc += `<li>"remove the [person/object] on the [left/right/center]" to remove specific elements</li>`;
    desc += `<li>"auto enhance" for automatic color correction</li>`;
    desc += `</ul>`;

    return desc;
  }

  /** Init */
  function init() {
    const sendBtn = document.getElementById('btn-send-chat');
    const dismissBtn = document.getElementById('btn-chat-dismiss');

    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          processCommand(chatInput.value);
          chatInput.value = '';
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        processCommand(chatInput.value);
        chatInput.value = '';
        chatInput.focus();
      });
    }

    // Dismiss inline response
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        if (responseInline) responseInline.classList.add('hidden');
        chatInput.focus();
      });
    }
  }

  return { processCommand, init, getContextSummary, remember, recall, forget };
})();
