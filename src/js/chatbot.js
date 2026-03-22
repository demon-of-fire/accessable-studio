/**
 * Chatbot Module - Global assistant with dialog responses
 * Understands natural language, no API keys needed
 */

const Chatbot = (() => {
  const chatInput = document.getElementById('chat-input');
  const responseInline = document.getElementById('chat-response-inline');
  const responseBody = document.getElementById('chat-response-body');

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

  /** Process a user command */
  async function processCommand(input) {
    const text = input.trim().toLowerCase();
    if (!text) return;

    // Route through Gemini if available — it has full project access
    if (Gemini.isAvailable()) {
      showResponse('<em>Thinking...</em>');
      try {
        const rawResponse = await Gemini.send(input);
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
    // PHOTO: Remove background
    // ==========================================
    else if (has(text, 'remove background', 'remove bg', 'remove the background', 'delete background', 'cut out', 'cutout')) {
      if (!PhotoEditor.hasImage) {
        response = 'No image loaded. Go to the Photo Editor and open an image first.';
      } else {
        const tol = extractNumber(text) || 50;
        response = await PhotoEditor.removeBackground(tol);
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

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      rTotal += r; gTotal += g; bTotal += b;

      const brightness = (r + g + b) / 3;
      if (brightness > 200) brightPixels++;
      if (brightness < 55) darkPixels++;
      if (brightness > 240 && Math.abs(r - g) < 20 && Math.abs(g - b) < 20) whitePixels++;
      if (brightness < 15) blackPixels++;

      // Dominant color channel
      if (r > g + 30 && r > b + 30) redPixels++;
      else if (g > r + 30 && g > b + 30) greenPixels++;
      else if (b > r + 30 && b > g + 30) bluePixels++;
    }

    const avgR = Math.round(rTotal / totalPixels);
    const avgG = Math.round(gTotal / totalPixels);
    const avgB = Math.round(bTotal / totalPixels);
    const avgBrightness = Math.round((avgR + avgG + avgB) / 3);

    // Build description
    let desc = `<strong>Image Details:</strong><ul>`;
    desc += `<li><strong>Size:</strong> ${w} by ${h} pixels</li>`;

    // Orientation
    if (w > h * 1.2) desc += `<li><strong>Orientation:</strong> Landscape (wider than tall)</li>`;
    else if (h > w * 1.2) desc += `<li><strong>Orientation:</strong> Portrait (taller than wide)</li>`;
    else desc += `<li><strong>Orientation:</strong> Square</li>`;

    // Overall brightness
    if (avgBrightness > 180) desc += `<li><strong>Brightness:</strong> Very bright, well-lit image</li>`;
    else if (avgBrightness > 130) desc += `<li><strong>Brightness:</strong> Bright image</li>`;
    else if (avgBrightness > 80) desc += `<li><strong>Brightness:</strong> Medium brightness</li>`;
    else if (avgBrightness > 40) desc += `<li><strong>Brightness:</strong> Dark image</li>`;
    else desc += `<li><strong>Brightness:</strong> Very dark image</li>`;

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

    // Average color
    desc += `<li><strong>Average color:</strong> RGB(${avgR}, ${avgG}, ${avgB})</li>`;

    // White/Black areas
    const whitePercent = Math.round(whitePixels / totalPixels * 100);
    const blackPercent = Math.round(blackPixels / totalPixels * 100);
    if (whitePercent > 20) desc += `<li><strong>Note:</strong> ${whitePercent}% white areas (possibly sky, paper, or overexposed)</li>`;
    if (blackPercent > 20) desc += `<li><strong>Note:</strong> ${blackPercent}% very dark areas (shadows or black background)</li>`;

    // Contrast estimation
    const brightPercent = Math.round(brightPixels / totalPixels * 100);
    const darkPercent = Math.round(darkPixels / totalPixels * 100);
    if (brightPercent > 30 && darkPercent > 30) {
      desc += `<li><strong>Contrast:</strong> High contrast — mix of very bright and very dark areas</li>`;
    } else if (brightPercent < 10 && darkPercent < 10) {
      desc += `<li><strong>Contrast:</strong> Low contrast — mostly mid-tones</li>`;
    }

    // Suggestions
    desc += `</ul><strong>Suggestions:</strong><ul>`;
    if (avgBrightness < 80) desc += `<li>Try "brighten it" or "set brightness to 130" to lighten the image</li>`;
    if (avgBrightness > 180) desc += `<li>Try "darken it" or "set brightness to 80" to reduce brightness</li>`;
    if (topColor.count < totalPixels * 0.05) desc += `<li>Try "boost saturation" to make colors more vivid</li>`;
    desc += `<li>Try "remove background" or "blur background" for subject isolation</li>`;
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

  return { processCommand, init };
})();
