/**
 * Player Module - Video playback controls
 */

const Player = (() => {
  const video = document.getElementById('video-player');
  const seekSlider = document.getElementById('seek-slider');
  const volumeSlider = document.getElementById('volume-slider');
  const timeDisplay = document.getElementById('time-display');
  const playBtn = document.getElementById('btn-play-pause');
  const muteBtn = document.getElementById('btn-mute');
  const noVideoMsg = document.getElementById('no-video-message');
  const filmstripCanvas = document.getElementById('filmstrip-canvas');
  const filmstripPlayhead = document.getElementById('filmstrip-playhead');
  const filmstripContainer = document.getElementById('filmstrip-container');

  let isPlaying = false;
  let isMuted = false;
  let currentSource = '';
  let filmstripGenerated = false;

  // Audio playback engine - manages audio clips from the timeline
  const activeAudioElements = new Map(); // clipId -> HTMLAudioElement

  /** Sync audio clips: start/stop audio elements based on current playhead time */
  function syncAudioClips(currentTime) {
    const allClips = Timeline.getClips();
    const audioClips = allClips.filter(c => c.type === 'audio');

    // Start audio clips that should be playing
    for (const clip of audioClips) {
      const clipEnd = clip.startTime + clip.duration;
      const shouldPlay = isPlaying && currentTime >= clip.startTime && currentTime < clipEnd;

      if (shouldPlay) {
        if (!activeAudioElements.has(clip.id)) {
          // Create and start a new audio element for this clip
          const audio = new Audio(clip.filePath);
          audio.volume = isMuted ? 0 : (clip.volume ?? 100) / 100 * (video.volume || 1);
          audio.currentTime = currentTime - clip.startTime;
          audio.play().catch(() => {}); // ignore autoplay errors
          activeAudioElements.set(clip.id, audio);
        } else {
          // Already playing - check if we need to correct drift
          const audio = activeAudioElements.get(clip.id);
          const expectedTime = currentTime - clip.startTime;
          if (Math.abs(audio.currentTime - expectedTime) > 0.3) {
            audio.currentTime = expectedTime;
          }
          audio.volume = isMuted ? 0 : (clip.volume ?? 100) / 100 * (video.volume || 1);
        }
      } else {
        // Should not be playing - stop if it is
        if (activeAudioElements.has(clip.id)) {
          const audio = activeAudioElements.get(clip.id);
          audio.pause();
          audio.src = '';
          activeAudioElements.delete(clip.id);
        }
      }
    }

    // Clean up audio elements for clips that no longer exist
    for (const [clipId, audio] of activeAudioElements) {
      if (!audioClips.find(c => c.id === clipId)) {
        audio.pause();
        audio.src = '';
        activeAudioElements.delete(clipId);
      }
    }
  }

  /** Stop all audio clips */
  function stopAllAudio() {
    for (const [clipId, audio] of activeAudioElements) {
      audio.pause();
      audio.src = '';
    }
    activeAudioElements.clear();
  }

  /** Load a video file */
  function loadVideo(filePath) {
    currentSource = filePath;
    video.src = filePath;
    video.style.display = 'block';
    if (noVideoMsg) noVideoMsg.style.display = 'none';

    video.addEventListener('loadedmetadata', () => {
      seekSlider.max = Math.floor(video.duration * 10) / 10;
      updateTimeDisplay();
      detectFrameRate();
      // Generate filmstrip thumbnails
      filmstripGenerated = false;
      setTimeout(() => generateFilmstrip(), 300);
      Accessibility.announce(`Video loaded. Duration: ${Accessibility.formatTime(video.duration)}`);
      Accessibility.setStatus('Video loaded: ' + filePath.split(/[\\/]/).pop());
    }, { once: true });

    video.addEventListener('error', () => {
      Accessibility.announce('Error loading video file');
      Accessibility.setStatus('Error: Could not load video');
    }, { once: true });
  }

  /** Play video and audio */
  function play() {
    const hasVideo = video.src && video.src !== '';
    const hasAudioClips = Timeline.getClips().some(c => c.type === 'audio');

    if (!hasVideo && !hasAudioClips) {
      Accessibility.announce('No media loaded. Import media first.');
      return;
    }

    if (hasVideo) {
      video.play();
    }
    isPlaying = true;
    syncAudioClips(getCurrentTime());

    // Start audio sync loop if we have audio clips
    if (hasAudioClips) {
      startAudioSyncLoop();
    }

    playBtn.textContent = 'Pause';
    playBtn.setAttribute('aria-label', 'Pause');
    Accessibility.announceStatus('Playing');
  }

  /** Pause video and audio */
  function pause() {
    video.pause();
    isPlaying = false;
    stopAllAudio();
    stopAudioSyncLoop();
    playBtn.textContent = 'Play';
    playBtn.setAttribute('aria-label', 'Play');
    Accessibility.announceStatus('Paused');
  }

  /** Toggle play/pause */
  function togglePlay() {
    if (isPlaying) pause();
    else play();
  }

  /** Stop and return to beginning */
  function stop() {
    video.pause();
    video.currentTime = 0;
    isPlaying = false;
    stopAllAudio();
    stopAudioSyncLoop();
    audioOnlyTime = 0;
    playBtn.textContent = 'Play';
    playBtn.setAttribute('aria-label', 'Play');
    updateTimeDisplay();
    Timeline.setPlayheadPosition(0);
    Accessibility.announceStatus('Stopped');
  }

  // Audio-only playback: when no video is loaded, we track time ourselves
  let audioOnlyTime = 0;
  let audioSyncInterval = null;
  let lastRealTime = 0;

  function startAudioSyncLoop() {
    if (audioSyncInterval) return;
    lastRealTime = performance.now();
    audioSyncInterval = setInterval(() => {
      if (!isPlaying) return;
      const now = performance.now();
      const delta = (now - lastRealTime) / 1000;
      lastRealTime = now;

      const hasVideo = video.src && video.src !== '' && video.duration;
      if (!hasVideo) {
        // Audio-only mode: advance our own clock
        audioOnlyTime += delta;
        updateTimeDisplay();
      }
      syncAudioClips(getCurrentTime());
    }, 50);
  }

  function stopAudioSyncLoop() {
    if (audioSyncInterval) {
      clearInterval(audioSyncInterval);
      audioSyncInterval = null;
    }
  }

  /** Skip forward */
  function skipForward(seconds = 5) {
    video.currentTime = Math.min(video.currentTime + seconds, video.duration || 0);
    updateTimeDisplay();
    Accessibility.announceStatus(`Skipped forward to ${Accessibility.formatTime(video.currentTime)}`);
  }

  /** Skip backward */
  function skipBack(seconds = 5) {
    video.currentTime = Math.max(video.currentTime - seconds, 0);
    updateTimeDisplay();
    Accessibility.announceStatus(`Skipped back to ${Accessibility.formatTime(video.currentTime)}`);
  }

  /** Detect video frame rate (default 30) */
  let detectedFPS = 30;

  function detectFrameRate() {
    // Try to detect FPS using requestVideoFrameCallback
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      let lastTime = null;
      let samples = [];
      const detect = (now, metadata) => {
        if (lastTime !== null) {
          const delta = metadata.mediaTime - lastTime;
          if (delta > 0 && delta < 0.2) {
            samples.push(1 / delta);
          }
        }
        lastTime = metadata.mediaTime;
        if (samples.length < 10) {
          video.requestVideoFrameCallback(detect);
        } else {
          const avgFps = samples.reduce((a, b) => a + b, 0) / samples.length;
          detectedFPS = Math.round(avgFps);
          if (detectedFPS < 10 || detectedFPS > 120) detectedFPS = 30;
        }
      };
      video.requestVideoFrameCallback(detect);
    }
  }

  /**
   * Frame forward - plays a tiny chunk in real time so audio is heard,
   * then pauses. Like scrubbing in a real NLE.
   */
  function frameForward() {
    if (!video.src || !video.duration) {
      Accessibility.announce('No video loaded');
      return;
    }

    const frameTime = 1 / detectedFPS;
    const targetTime = Math.min(video.currentTime + frameTime, video.duration);

    // Unmute so you hear the audio while stepping
    video.muted = false;
    video.playbackRate = 0.5; // slow so the audio blip is audible
    video.play();

    // Stop after one frame's worth of real time
    setTimeout(() => {
      video.pause();
      video.playbackRate = 1;
      video.currentTime = targetTime; // snap to exact frame
      isPlaying = false;
      playBtn.textContent = 'Play';
      playBtn.setAttribute('aria-label', 'Play video');
      updateTimeDisplay();
      const frameNum = Math.round(video.currentTime * detectedFPS);
      Accessibility.announceStatus(`Frame ${frameNum}, ${Accessibility.formatTimeDisplay(video.currentTime)}`);
    }, Math.round(frameTime * 1000 * 2)); // 2x because playbackRate is 0.5
  }

  /**
   * Frame backward - seeks back one frame and plays a tiny chunk
   * so you hear the audio at that position.
   */
  function frameBack() {
    if (!video.src || !video.duration) {
      Accessibility.announce('No video loaded');
      return;
    }

    const frameTime = 1 / detectedFPS;
    const targetTime = Math.max(video.currentTime - frameTime, 0);

    // Seek to the target frame
    video.currentTime = targetTime;

    // Play a tiny blip so user hears where they are
    video.muted = false;
    video.playbackRate = 0.5;
    video.play();

    setTimeout(() => {
      video.pause();
      video.playbackRate = 1;
      video.currentTime = targetTime; // snap back to exact frame
      isPlaying = false;
      playBtn.textContent = 'Play';
      playBtn.setAttribute('aria-label', 'Play video');
      updateTimeDisplay();
      const frameNum = Math.round(video.currentTime * detectedFPS);
      Accessibility.announceStatus(`Frame ${frameNum}, ${Accessibility.formatTimeDisplay(video.currentTime)}`);
    }, Math.round(frameTime * 1000 * 2));
  }

  /** Seek to time */
  function seekTo(time) {
    const maxTime = getDuration();
    const seekTime = Math.max(0, Math.min(time, maxTime));
    const hasVideo = video.src && video.src !== '' && video.duration;
    if (hasVideo) {
      video.currentTime = Math.min(seekTime, video.duration);
    }
    audioOnlyTime = seekTime;
    // Re-sync audio clips to new position
    stopAllAudio();
    if (isPlaying) {
      syncAudioClips(seekTime);
    }
    updateTimeDisplay();
  }

  /** Set volume (0-100) */
  function setVolume(val) {
    video.volume = val / 100;
    volumeSlider.value = val;
    volumeSlider.setAttribute('aria-valuetext', `${val} percent`);
    volumeSlider.setAttribute('aria-label', `Volume, currently ${val} percent`);
    if (val === 0) {
      isMuted = true;
      muteBtn.textContent = 'Unmute';
      muteBtn.setAttribute('aria-label', 'Unmute audio');
    } else {
      isMuted = false;
      muteBtn.textContent = 'Mute';
      muteBtn.setAttribute('aria-label', 'Mute audio');
    }
  }

  /** Toggle mute */
  function toggleMute() {
    if (isMuted) {
      video.muted = false;
      isMuted = false;
      // Unmute all active audio elements
      for (const [, audio] of activeAudioElements) {
        audio.volume = video.volume || 1;
      }
      muteBtn.textContent = 'Mute';
      muteBtn.setAttribute('aria-label', 'Mute audio');
      Accessibility.announceStatus('Audio unmuted');
    } else {
      video.muted = true;
      isMuted = true;
      // Mute all active audio elements
      for (const [, audio] of activeAudioElements) {
        audio.volume = 0;
      }
      muteBtn.textContent = 'Unmute';
      muteBtn.setAttribute('aria-label', 'Unmute audio');
      Accessibility.announceStatus('Audio muted');
    }
  }

  /** Track last announced second so we don't spam */
  let lastAnnouncedSecond = -1;

  /** Update time display + filmstrip playhead + playhead info */
  function updateTimeDisplay() {
    const current = getCurrentTime();
    const duration = getDuration();
    const currentStr = Accessibility.formatTimeDisplay(current);
    const durationStr = Accessibility.formatTimeDisplay(duration);
    timeDisplay.textContent = `${currentStr} / ${durationStr}`;
    seekSlider.value = current;
    seekSlider.setAttribute('aria-valuetext',
      `${Accessibility.formatTime(current)} of ${Accessibility.formatTime(duration)}`);

    // Update filmstrip playhead position
    if (filmstripPlayhead && filmstripContainer && duration > 0) {
      const pct = current / duration;
      const containerWidth = filmstripContainer.offsetWidth;
      filmstripPlayhead.style.left = (pct * containerWidth) + 'px';
    }

    // Update the playhead info text (visible + read by screen reader on demand)
    updatePlayheadInfo(current);

    // Update timeline playhead
    Timeline.setPlayheadPosition(current);
  }

  /** Build a description of what's at the playhead */
  function updatePlayheadInfo(time) {
    const infoEl = document.getElementById('playhead-position-text');
    if (!infoEl) return;

    const currentSecond = Math.floor(time);
    // Only update text once per second to avoid excessive DOM writes
    if (currentSecond === lastAnnouncedSecond) return;
    lastAnnouncedSecond = currentSecond;

    const clipsHere = Timeline.getClipsAtTime(time);
    const timeStr = Accessibility.formatTime(time);
    let info = `Playhead at ${timeStr}.`;

    if (clipsHere.length === 0) {
      info += ' No clips at this position.';
    } else {
      const descriptions = clipsHere.map(c => {
        const remaining = (c.startTime + c.duration) - time;
        return `${c.type} clip "${c.name}" (${Accessibility.formatTime(remaining)} remaining)`;
      });
      info += ' At this position: ' + descriptions.join(', ') + '.';
    }

    infoEl.textContent = info;
  }

  /** Announce full playhead context (for the "Where Am I?" button) */
  function announceWhereAmI() {
    const current = getCurrentTime();
    const duration = getDuration();
    const clipsHere = Timeline.getClipsAtTime(current);
    const timeStr = Accessibility.formatTime(current);
    const durationStr = Accessibility.formatTime(duration);

    let msg = `Playhead is at ${timeStr} out of ${durationStr} total.`;

    if (clipsHere.length === 0) {
      msg += ' There are no clips at this position. ';
      // Find the nearest clip
      const allClips = Timeline.getClips();
      if (allClips.length > 0) {
        const sorted = allClips.slice().sort((a, b) => {
          const distA = Math.min(Math.abs(a.startTime - current), Math.abs(a.startTime + a.duration - current));
          const distB = Math.min(Math.abs(b.startTime - current), Math.abs(b.startTime + b.duration - current));
          return distA - distB;
        });
        const nearest = sorted[0];
        if (current < nearest.startTime) {
          msg += `The next clip is "${nearest.name}" starting at ${Accessibility.formatTime(nearest.startTime)}, which is ${Accessibility.formatTime(nearest.startTime - current)} away.`;
        } else {
          msg += `The nearest clip "${nearest.name}" ended at ${Accessibility.formatTime(nearest.startTime + nearest.duration)}.`;
        }
      } else {
        msg += 'The timeline is empty. Import some media to get started.';
      }
    } else {
      msg += ' Currently playing: ';
      clipsHere.forEach(c => {
        const elapsed = current - c.startTime;
        const remaining = (c.startTime + c.duration) - current;
        msg += `${c.type} clip "${c.name}", ${Accessibility.formatTime(elapsed)} in, ${Accessibility.formatTime(remaining)} remaining. `;
      });
    }

    // Also tell them what percentage through the video we are
    if (duration > 0) {
      const pct = Math.round((current / duration) * 100);
      msg += `That is ${pct} percent through the video.`;
    }

    Accessibility.announce(msg);
  }

  /** Generate filmstrip thumbnails from the video */
  function generateFilmstrip() {
    if (!filmstripCanvas || !video.duration || filmstripGenerated) return;

    const ctx = filmstripCanvas.getContext('2d');
    if (!ctx) return;

    const container = filmstripContainer;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Set canvas resolution
    filmstripCanvas.width = width * 2;  // 2x for sharpness
    filmstripCanvas.height = height * 2;
    filmstripCanvas.style.width = width + 'px';
    filmstripCanvas.style.height = height + 'px';
    ctx.scale(2, 2);

    const duration = video.duration;
    const thumbWidth = Math.max(40, height * (video.videoWidth / video.videoHeight || 16/9));
    const numThumbs = Math.ceil(width / thumbWidth) + 1;
    const timeStep = duration / numThumbs;

    // Use an offscreen video to grab frames without interrupting playback
    const offscreen = document.createElement('video');
    offscreen.src = video.src;
    offscreen.muted = true;
    offscreen.preload = 'auto';

    let thumbIndex = 0;

    offscreen.addEventListener('loadeddata', () => {
      grabNextFrame();
    });

    function grabNextFrame() {
      if (thumbIndex >= numThumbs) {
        filmstripGenerated = true;
        offscreen.remove();
        // Draw subtle frame borders
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < numThumbs; i++) {
          const x = i * thumbWidth;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        return;
      }

      const seekTime = thumbIndex * timeStep;
      offscreen.currentTime = seekTime;

      offscreen.addEventListener('seeked', function onSeeked() {
        offscreen.removeEventListener('seeked', onSeeked);

        const x = thumbIndex * thumbWidth;
        try {
          ctx.drawImage(offscreen, x, 0, thumbWidth, height);
        } catch (e) {
          // If cross-origin or error, draw a placeholder
          ctx.fillStyle = `hsl(${(thumbIndex * 30) % 360}, 30%, 25%)`;
          ctx.fillRect(x, 0, thumbWidth, height);
        }

        thumbIndex++;
        // Use requestAnimationFrame to not block the UI
        requestAnimationFrame(grabNextFrame);
      }, { once: true });
    }
  }

  /** Handle clicking on the filmstrip to seek */
  function initFilmstripClick() {
    if (!filmstripContainer) return;

    let isDragging = false;

    function seekFromMouse(e) {
      const rect = filmstripContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const time = pct * (video.duration || 0);
      seekTo(time);
    }

    filmstripContainer.addEventListener('mousedown', (e) => {
      isDragging = true;
      seekFromMouse(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) seekFromMouse(e);
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    filmstripContainer.addEventListener('touchstart', (e) => {
      isDragging = true;
      const touch = e.touches[0];
      const rect = filmstripContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      seekTo(pct * (video.duration || 0));
    }, { passive: true });

    filmstripContainer.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const rect = filmstripContainer.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      seekTo(pct * (video.duration || 0));
    }, { passive: true });

    filmstripContainer.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  /** Get current time - uses video time if video loaded, otherwise audio-only clock */
  function getCurrentTime() {
    const hasVideo = video.src && video.src !== '' && video.duration;
    if (hasVideo) return video.currentTime || 0;
    return audioOnlyTime;
  }

  /** Get duration - uses video duration or end of last audio clip */
  function getDuration() {
    const videoDur = video.duration || 0;
    const allClips = Timeline.getClips();
    const audioDur = allClips
      .filter(c => c.type === 'audio')
      .reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
    return Math.max(videoDur, audioDur);
  }

  /** Apply CSS filter for preview */
  function applyFilter(filterString) {
    video.style.filter = filterString;
  }

  // Time update loop
  function init() {
    video.addEventListener('timeupdate', () => {
      updateTimeDisplay();
      if (isPlaying) syncAudioClips(getCurrentTime());
    });
    video.addEventListener('ended', () => {
      // Check if audio clips are still playing
      const audioDur = getDuration();
      const current = getCurrentTime();
      if (current < audioDur - 0.1) {
        // Audio still has time left, keep playing in audio-only mode
        audioOnlyTime = current;
        startAudioSyncLoop();
        return;
      }
      isPlaying = false;
      stopAllAudio();
      stopAudioSyncLoop();
      playBtn.textContent = 'Play';
      playBtn.setAttribute('aria-label', 'Play');
      Accessibility.announceStatus('Playback finished');
    });

    // Seek slider
    seekSlider.addEventListener('input', () => {
      seekTo(parseFloat(seekSlider.value));
    });

    // Volume slider
    volumeSlider.addEventListener('input', () => {
      setVolume(parseInt(volumeSlider.value));
    });

    // Filmstrip click-to-seek
    initFilmstripClick();

    // Regenerate filmstrip on window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        filmstripGenerated = false;
        if (video.duration) generateFilmstrip();
      }, 500);
    });
  }

  return {
    loadVideo,
    play,
    pause,
    togglePlay,
    stop,
    skipForward,
    skipBack,
    frameForward,
    frameBack,
    seekTo,
    setVolume,
    toggleMute,
    getCurrentTime,
    getDuration,
    applyFilter,
    announceWhereAmI,
    init,
  };
})();
