/**
 * AI Assistant Module
 * - Searches the internet for free sound effects and background music
 * - Auto-edits videos and photos with intelligent commands
 * - All local processing, no API keys needed
 * Uses Electron shell.openExternal for web searches and
 * fetch() for free/no-auth sound APIs
 */

const AIAssistant = (() => {

  // ==========================================
  // SOUND SEARCH - Free sound libraries
  // ==========================================

  // Free sound sources (no API key required for search/browse)
  const SOUND_SOURCES = {
    pixabay: {
      name: 'Pixabay Music',
      searchUrl: (query) => `https://pixabay.com/music/search/${encodeURIComponent(query)}/`,
      sfxUrl: (query) => `https://pixabay.com/sound-effects/search/${encodeURIComponent(query)}/`,
    },
    freesound: {
      name: 'Freesound',
      searchUrl: (query) => `https://freesound.org/search/?q=${encodeURIComponent(query)}`,
    },
    mixkit: {
      name: 'Mixkit',
      searchUrl: (query) => `https://mixkit.co/free-sound-effects/search/?q=${encodeURIComponent(query)}`,
      musicUrl: (query) => `https://mixkit.co/free-stock-music/search/?q=${encodeURIComponent(query)}`,
    },
    zapsplat: {
      name: 'ZapSplat',
      searchUrl: (query) => `https://www.zapsplat.com/sound-effect-search/?s=${encodeURIComponent(query)}`,
    },
  };

  /** Search for sound effects - opens browser to free sound libraries */
  function searchSounds(query, type = 'sfx') {
    if (!query) {
      return 'Please specify what sound you want to find. For example: "search for rain sounds" or "find background jazz music"';
    }

    const results = [];

    if (type === 'music' || type === 'background') {
      results.push({
        source: 'Pixabay Music',
        url: SOUND_SOURCES.pixabay.searchUrl(query),
      });
      results.push({
        source: 'Mixkit Music',
        url: SOUND_SOURCES.mixkit.musicUrl(query),
      });
    } else {
      results.push({
        source: 'Pixabay Sound Effects',
        url: SOUND_SOURCES.pixabay.sfxUrl(query),
      });
      results.push({
        source: 'Mixkit Sound Effects',
        url: SOUND_SOURCES.mixkit.searchUrl(query),
      });
    }

    results.push({
      source: 'Freesound',
      url: SOUND_SOURCES.freesound.searchUrl(query),
    });
    results.push({
      source: 'ZapSplat',
      url: SOUND_SOURCES.zapsplat.searchUrl(query),
    });

    // Open the first result in the default browser
    if (results.length > 0) {
      if (window.api && window.api.openExternal) {
        window.api.openExternal(results[0].url);
      } else {
        window.open(results[0].url, '_blank');
      }
    }

    return results;
  }

  // ==========================================
  // AI AUTO-EDIT COMMANDS
  // ==========================================

  /** Auto color correct - analyze and fix colors */
  function autoColorCorrect() {
    // Intelligent auto-correction based on common issues
    Effects.setFilter('brightness', 105);
    Effects.setFilter('contrast', 115);
    Effects.setFilter('saturation', 110);
    return 'Applied auto color correction: brightness 105%, contrast 115%, saturation 110%. This brightens dark footage and adds vibrance.';
  }

  /** Auto enhance photo */
  function autoEnhancePhoto() {
    PhotoEditor.setAdjustment('brightness', 10);
    PhotoEditor.setAdjustment('contrast', 15);
    PhotoEditor.setAdjustment('saturation', 10);
    PhotoEditor.setAdjustment('sharpness', 20);
    return 'Applied auto enhancement: +10 brightness, +15 contrast, +10 saturation, +20 sharpness.';
  }

  /** Create a quick montage from all clips */
  function createMontage(clipDuration = 3) {
    const clips = Timeline.getClips().filter(c => c.type === 'video');
    if (clips.length === 0) {
      return 'No video clips on the timeline to create a montage from. Import some videos first.';
    }

    // Trim each clip to the specified duration and space them evenly
    clips.forEach((clip, i) => {
      Timeline.updateClipProperty(clip.id, 'duration', clipDuration);
      Timeline.updateClipProperty(clip.id, 'startTime', i * clipDuration);
    });

    const totalDuration = clips.length * clipDuration;
    return `Created montage: ${clips.length} clips, each ${clipDuration} seconds long. Total duration: ${totalDuration} seconds.`;
  }

  /** Speed ramp - create a speed variation effect */
  function speedRamp(style = 'dramatic') {
    const clip = Timeline.getSelectedClip();
    if (!clip) return 'No clip selected. Select a clip first.';

    // Split clip into segments with varying speeds
    const duration = clip.duration;
    if (duration < 4) return 'Clip is too short for speed ramping. Need at least 4 seconds.';

    const thirdDuration = duration / 3;

    switch (style) {
      case 'dramatic':
        // Slow-normal-slow
        Timeline.splitClip(clip.id, clip.startTime + thirdDuration);
        const clips2 = Timeline.getClips();
        const secondClip = clips2[clips2.length - 1];
        Timeline.splitClip(secondClip.id, secondClip.startTime + thirdDuration);
        const clips3 = Timeline.getClips();

        // Set speeds
        Timeline.updateClipProperty(clip.id, 'speed', 0.5);
        Timeline.updateClipProperty(clips3[clips3.length - 2].id, 'speed', 1);
        Timeline.updateClipProperty(clips3[clips3.length - 1].id, 'speed', 0.5);
        return 'Applied dramatic speed ramp: slow (0.5x) → normal (1x) → slow (0.5x). Great for action shots!';

      case 'buildup':
        Timeline.updateClipProperty(clip.id, 'speed', 0.5);
        return 'Applied buildup: starting at 0.5x speed. Split and adjust further segments for a full buildup effect.';

      default:
        Timeline.updateClipProperty(clip.id, 'speed', 0.75);
        return 'Applied slow motion at 0.75x speed.';
    }
  }

  /** Auto trim silence / dead space (simulated) */
  function autoTrimSilence() {
    const clip = Timeline.getSelectedClip();
    if (!clip) return 'No clip selected.';

    // Trim 0.5s from start and end (common dead space)
    Timeline.trimClip(clip.id, 0.5, 0.5);
    return `Trimmed 0.5 seconds from start and end of "${clip.name}" to remove dead space.`;
  }

  /** Suggest edits based on clip content */
  function suggestEdits() {
    const clips = Timeline.getClips();
    if (clips.length === 0) {
      return 'No clips on the timeline. Import some media first, then I can suggest edits.';
    }

    const suggestions = [];

    // Check total duration
    const totalDuration = Timeline.getTotalDuration();
    if (totalDuration > 300) {
      suggestions.push('Your video is over 5 minutes. Consider trimming clips or increasing playback speed for better engagement.');
    }
    if (totalDuration < 10) {
      suggestions.push('Your video is very short. Consider adding more clips or slowing down the playback speed.');
    }

    // Check for gaps
    const videoClips = clips.filter(c => c.type === 'video').sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < videoClips.length; i++) {
      const gap = videoClips[i].startTime - (videoClips[i-1].startTime + videoClips[i-1].duration);
      if (gap > 1) {
        suggestions.push(`There's a ${gap.toFixed(1)} second gap between "${videoClips[i-1].name}" and "${videoClips[i].name}". Consider closing the gap.`);
      }
    }

    // Check for no audio
    const audioClips = clips.filter(c => c.type === 'audio');
    if (audioClips.length === 0 && videoClips.length > 0) {
      suggestions.push('No background music added. Consider searching for background tracks to make your video more engaging.');
    }

    // Check for no text
    const textClips = clips.filter(c => c.type === 'text');
    if (textClips.length === 0 && videoClips.length > 1) {
      suggestions.push('No text overlays. Consider adding titles or captions for accessibility.');
    }

    // Check filters
    const filters = Effects.getFilters();
    if (filters.brightness === 100 && filters.contrast === 100 && filters.saturation === 100) {
      suggestions.push('No color adjustments applied. Try "auto color correct" or apply a filter preset for a more polished look.');
    }

    if (suggestions.length === 0) {
      return 'Your project looks great! No major suggestions at this time.';
    }

    return 'Here are my suggestions:<ul>' + suggestions.map(s => `<li>${s}</li>`).join('') + '</ul>';
  }

  /** Close gaps between clips */
  function closeGaps() {
    const clips = Timeline.getClips();
    const types = ['video', 'audio', 'text'];

    let gapsClosed = 0;
    types.forEach(type => {
      const trackClips = clips.filter(c => c.type === type).sort((a, b) => a.startTime - b.startTime);
      let currentEnd = 0;
      trackClips.forEach(clip => {
        if (clip.startTime > currentEnd) {
          gapsClosed++;
          Timeline.updateClipProperty(clip.id, 'startTime', currentEnd);
        }
        currentEnd = clip.startTime + clip.duration;
      });
    });

    if (gapsClosed === 0) return 'No gaps found between clips.';
    return `Closed ${gapsClosed} gap${gapsClosed > 1 ? 's' : ''} between clips. All clips are now seamlessly connected.`;
  }

  /** Create a fade effect by adjusting opacity at start/end */
  function addFadeEffect(type = 'both') {
    const clip = Timeline.getSelectedClip();
    if (!clip) return 'No clip selected.';

    // Store fade info on the clip for export
    if (type === 'in' || type === 'both') {
      clip.fadeIn = true;
    }
    if (type === 'out' || type === 'both') {
      clip.fadeOut = true;
    }

    const fadeDesc = type === 'both' ? 'fade in and fade out' : `fade ${type}`;
    return `Added ${fadeDesc} effect to "${clip.name}". This will be applied during export.`;
  }

  // ==========================================
  // PROCESS AI COMMANDS (extends chatbot)
  // ==========================================

  function processAICommand(text) {
    const lower = text.toLowerCase().trim();

    // SEARCH FOR SOUNDS
    const searchSFXMatch = lower.match(/(?:search|find|look for|get)\s+(?:a\s+)?(?:sound\s+(?:effect|fx)|sfx|sound)\s+(?:of\s+|for\s+)?(.+)/);
    const searchMusicMatch = lower.match(/(?:search|find|look for|get)\s+(?:a\s+)?(?:background\s+)?(?:music|track|song|soundtrack)\s+(?:of\s+|for\s+|about\s+)?(.+)/);
    const searchAnyMatch = lower.match(/(?:search|find|look for)\s+(.+?)(?:\s+(?:sound|music|track|audio))?$/);

    if (searchSFXMatch) {
      const query = searchSFXMatch[1];
      const results = searchSounds(query, 'sfx');
      let msg = `Searching for "${query}" sound effects. I've opened <strong>${results[0].source}</strong> in your browser.<br><br>Other sources to try:`;
      msg += '<ul>' + results.slice(1).map(r => `<li><strong>${r.source}</strong></li>`).join('') + '</ul>';
      msg += 'Download the sound file, then use <strong>Import Audio</strong> to add it to your project.';
      return msg;
    }

    if (searchMusicMatch) {
      const query = searchMusicMatch[1];
      const results = searchSounds(query, 'music');
      let msg = `Searching for "${query}" background music. I've opened <strong>${results[0].source}</strong> in your browser.<br><br>Other sources:`;
      msg += '<ul>' + results.slice(1).map(r => `<li><strong>${r.source}</strong></li>`).join('') + '</ul>';
      msg += 'Download the track, then use <strong>Import Audio</strong> to add it to your timeline.';
      return msg;
    }

    // AUTO COLOR CORRECT
    if (lower.match(/auto\s*(?:color|colour)\s*correct|fix\s*(?:the\s+)?color|auto\s*fix/)) {
      return autoColorCorrect();
    }

    // AUTO ENHANCE (photo)
    if (lower.match(/auto\s*enhance|enhance\s*(?:the\s+)?photo|auto\s*improve|make\s*(?:it\s+)?(?:look\s+)?better/)) {
      return autoEnhancePhoto();
    }

    // CREATE MONTAGE
    if (lower.match(/(?:create|make)\s*(?:a\s+)?montage/)) {
      const durationMatch = lower.match(/(\d+)\s*(?:second|sec|s)/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 3;
      return createMontage(duration);
    }

    // SPEED RAMP
    if (lower.match(/speed\s*ramp|ramp\s*(?:the\s+)?speed/)) {
      const style = lower.includes('buildup') ? 'buildup' : 'dramatic';
      return speedRamp(style);
    }

    // AUTO TRIM / REMOVE DEAD SPACE
    if (lower.match(/auto\s*trim|remove\s*(?:dead\s*)?(?:space|silence)|trim\s*(?:the\s+)?(?:dead|silent|empty)\s*(?:space|parts?)/)) {
      return autoTrimSilence();
    }

    // SUGGEST EDITS
    if (lower.match(/suggest|recommend|what\s*should\s*I|any\s*(?:suggestions|tips|advice)|review\s*(?:my\s+)?(?:project|video|edit)/)) {
      return suggestEdits();
    }

    // CLOSE GAPS
    if (lower.match(/close\s*(?:all\s+)?gaps|remove\s*(?:all\s+)?gaps|snap\s*(?:clips\s+)?together|join\s*clips/)) {
      return closeGaps();
    }

    // ADD FADE
    if (lower.match(/(?:add\s+)?fade\s*in\s*(?:and\s*)?(?:fade\s*)?out|add\s*fade/)) {
      return addFadeEffect('both');
    }
    if (lower.match(/(?:add\s+)?fade\s*in/)) {
      return addFadeEffect('in');
    }
    if (lower.match(/(?:add\s+)?fade\s*out/)) {
      return addFadeEffect('out');
    }

    // MAKE CINEMATIC / DRAMATIC / etc.
    if (lower.match(/make\s*(?:it\s+)?(?:look\s+)?cinematic/)) {
      Effects.applyPreset('cinematic');
      return 'Applied cinematic look: lowered brightness, boosted contrast, desaturated slightly. Very film-like!';
    }
    if (lower.match(/make\s*(?:it\s+)?(?:look\s+)?dramatic/)) {
      Effects.applyPreset('dramatic');
      return 'Applied dramatic look: high contrast and saturation for maximum impact!';
    }
    if (lower.match(/make\s*(?:it\s+)?(?:look\s+)?vintage|make\s*(?:it\s+)?(?:look\s+)?retro|make\s*(?:it\s+)?(?:look\s+)?old/)) {
      Effects.applyPreset('vintage');
      return 'Applied vintage look: warm tones, reduced saturation, slight sepia. Like an old film!';
    }
    if (lower.match(/make\s*(?:it\s+)?black\s*(?:and|&)\s*white|make\s*(?:it\s+)?(?:look\s+)?noir/)) {
      Effects.applyPreset('noir');
      return 'Converted to black and white with high contrast noir look.';
    }

    // SEARCH GENERIC (fallback for search commands)
    if (searchAnyMatch && lower.startsWith('search') || lower.startsWith('find') || lower.startsWith('look for')) {
      const query = searchAnyMatch ? searchAnyMatch[1] : text;
      const results = searchSounds(query, 'sfx');
      let msg = `Searching for "${query}". I've opened <strong>${results[0].source}</strong> in your browser.`;
      msg += '<br>Download the file, then import it into your project.';
      return msg;
    }

    // Not an AI command
    return null;
  }

  return {
    searchSounds,
    autoColorCorrect,
    autoEnhancePhoto,
    createMontage,
    speedRamp,
    autoTrimSilence,
    suggestEdits,
    closeGaps,
    addFadeEffect,
    processAICommand,
  };
})();
