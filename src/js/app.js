/**
 * App Module - Main application controller
 * Wires up all modules, handles navigation, keyboard shortcuts, settings
 */

const App = (() => {
  // ==========================================
  // SIDEBAR NAVIGATION
  // ==========================================
  const navButtons = {
    'nav-video-editor': 'section-video-editor',
    'nav-photo-editor': 'section-photo-editor',
    'nav-file-converter': 'section-file-converter',
    'nav-assistant': 'section-assistant',
    'nav-user-guide': 'section-user-guide',
    'nav-settings': 'section-settings',
  };

  function switchSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.app-section').forEach(s => {
      s.style.display = 'none';
    });
    // Deactivate all nav buttons
    document.querySelectorAll('.nav-button').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    // Show target section
    const section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'flex';
    }
    // Activate nav button
    for (const [btnId, secId] of Object.entries(navButtons)) {
      if (secId === sectionId) {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.classList.add('active');
          btn.setAttribute('aria-pressed', 'true');
        }
        break;
      }
    }

    const sectionNames = {
      'section-video-editor': 'Video Editor',
      'section-photo-editor': 'Photo Editor',
      'section-file-converter': 'File Converter',
      'section-assistant': 'Project Assistant',
      'section-user-guide': 'User Guide',
      'section-settings': 'Settings',
    };
    Accessibility.announce(`Switched to ${sectionNames[sectionId] || sectionId}`);
    Accessibility.setStatus(sectionNames[sectionId] || 'Ready');
  }

  function initNavigation() {
    for (const [btnId, sectionId] of Object.entries(navButtons)) {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => switchSection(sectionId));
      }
    }
  }

  // ==========================================
  // MEDIA LIBRARY
  // ==========================================
  let mediaLibrary = [];
  let selectedMediaIndex = -1;

  // Queue of files waiting to be placed via the dialog
  let pendingFiles = [];
  let currentPendingFile = null;

  /**
   * Import files: auto-detects type, gets duration, adds to library,
   * then shows a placement dialog for each file so the user chooses
   * where on the timeline it goes.
   */
  function addMediaToLibrary(filePaths) {
    for (const fp of filePaths) {
      try {
        const fileName = fp.split(/[\\/]/).pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'mpeg', 'mpg', 'm4v'].includes(ext);
        const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'].includes(ext);
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'svg'].includes(ext);

        // Use default durations - no waiting for FFmpeg
        let duration = 10;
        let type = 'video';
        if (isAudio) type = 'audio';
        else if (isImage) { type = 'image'; duration = 5; }

        // Add to media library immediately
        const libEntry = { path: fp, name: fileName, type, duration };
        mediaLibrary.push(libEntry);
        renderMediaLibrary();

        // Load preview for video files
        if (isVideo) {
          Player.loadVideo(fp);
        }

        // Queue for placement dialog - show IMMEDIATELY, don't wait for media info
        const trackType = isAudio ? 'audio' : 'video';
        pendingFiles.push({ fileName, trackType, filePath: fp, duration });
        console.log('File queued for placement:', fileName, 'pending count:', pendingFiles.length);

        // Show placement dialog for first pending file
        if (pendingFiles.length === 1) {
          showPlacementDialog();
        }

        // Try to get real duration in background (update library entry if found)
        if ((isVideo || isAudio) && window.api) {
          window.api.getMediaInfo(fp).then(info => {
            if (info && info.duration) {
              libEntry.duration = info.duration;
              console.log('Updated duration for', fileName, ':', info.duration);
            }
          }).catch(e => {
            console.warn('Could not get media info for', fileName);
          });
        }
      } catch (err) {
        console.error('Error importing file:', fp, err);
        Accessibility.announce('Error importing file: ' + fp.split(/[\\/]/).pop());
      }
    }
  }

  /** Show the placement dialog for the next pending file */
  function showPlacementDialog() {
    console.log('showPlacementDialog called, pending:', pendingFiles.length);
    if (pendingFiles.length === 0) return;

    currentPendingFile = pendingFiles[0];
    const dialog = document.getElementById('placement-dialog');
    const nameEl = document.getElementById('placement-file-name');
    const infoEl = document.getElementById('placement-file-info');

    if (!dialog) {
      console.error('Placement dialog element not found!');
      // Fallback: just add to end of track
      const file = pendingFiles.shift();
      if (file) {
        Timeline.addClip({
          name: file.fileName,
          type: file.trackType,
          filePath: file.filePath,
          duration: file.duration,
        });
        Accessibility.announce(file.fileName + ' added to timeline.');
      }
      currentPendingFile = null;
      return;
    }

    try {
      // Update dialog text
      const playheadTime = Player.getCurrentTime ? Player.getCurrentTime() : 0;
      const trackEnd = Timeline.getTrackEndTime ? Timeline.getTrackEndTime(currentPendingFile.trackType) : 0;
      const selectedClip = Timeline.getSelectedClip ? Timeline.getSelectedClip() : null;

      if (nameEl) {
        nameEl.textContent = `File: ${currentPendingFile.fileName} (${currentPendingFile.trackType}, ${Accessibility.formatTime(currentPendingFile.duration)})`;
      }

      let infoText = `Playhead is at ${Accessibility.formatTime(playheadTime)}.`;
      infoText += ` End of ${currentPendingFile.trackType} track is at ${Accessibility.formatTime(trackEnd)}.`;
      if (selectedClip) {
        infoText += ` Selected clip: "${selectedClip.name}" (${Accessibility.formatTime(selectedClip.startTime)} to ${Accessibility.formatTime(selectedClip.startTime + selectedClip.duration)}).`;
      } else {
        infoText += ' No clip is currently selected.';
      }
      if (infoEl) infoEl.textContent = infoText;

      // Update button labels with actual times
      const startBtn = document.getElementById('placement-start-track');
      const playheadBtn = document.getElementById('placement-playhead');
      const endBtn = document.getElementById('placement-end-track');
      const afterBtn = document.getElementById('placement-after-selected');
      const beforeBtn = document.getElementById('placement-before-selected');

      if (startBtn) startBtn.textContent = 'Start of Track (0 seconds)';
      if (playheadBtn) playheadBtn.textContent = `Current Playhead Position (${Accessibility.formatTimeDisplay(playheadTime)})`;
      if (endBtn) endBtn.textContent = `End of Track (${Accessibility.formatTimeDisplay(trackEnd)})`;

      if (selectedClip) {
        if (afterBtn) {
          afterBtn.textContent = `After "${selectedClip.name}" (at ${Accessibility.formatTimeDisplay(selectedClip.startTime + selectedClip.duration)})`;
          afterBtn.disabled = false;
        }
        if (beforeBtn) {
          beforeBtn.textContent = `Before "${selectedClip.name}" (at ${Accessibility.formatTimeDisplay(selectedClip.startTime)})`;
          beforeBtn.disabled = false;
        }
      } else {
        if (afterBtn) {
          afterBtn.textContent = 'After Selected Clip (no clip selected)';
          afterBtn.disabled = true;
        }
        if (beforeBtn) {
          beforeBtn.textContent = 'Before Selected Clip (no clip selected)';
          beforeBtn.disabled = true;
        }
      }

      console.log('Opening placement dialog for:', currentPendingFile.fileName);
      Accessibility.showModal(dialog);
    } catch (err) {
      console.error('Error showing placement dialog:', err);
      // Fallback: add to end of track
      const file = pendingFiles.shift();
      if (file) {
        Timeline.addClip({
          name: file.fileName,
          type: file.trackType,
          filePath: file.filePath,
          duration: file.duration,
        });
        Accessibility.announce(file.fileName + ' added to end of timeline.');
      }
      currentPendingFile = null;
    }
  }

  /** Place the current pending file at a given time and move to next */
  function placePendingFile(startTime) {
    if (!currentPendingFile) return;

    Timeline.addClip({
      name: currentPendingFile.fileName,
      type: currentPendingFile.trackType,
      filePath: currentPendingFile.filePath,
      duration: currentPendingFile.duration,
      startTime,
    });

    const placedAt = Accessibility.formatTime(startTime);
    Accessibility.announce(
      `${currentPendingFile.fileName} placed on ${currentPendingFile.trackType} track at ${placedAt}. Duration: ${Accessibility.formatTime(currentPendingFile.duration)}.`
    );

    // Remove from queue
    pendingFiles.shift();
    currentPendingFile = null;

    // Close dialog
    Accessibility.hideModal(document.getElementById('placement-dialog'));

    // Show next if there are more
    if (pendingFiles.length > 0) {
      setTimeout(showPlacementDialog, 300);
    }
  }

  /** Init placement dialog buttons */
  function initPlacementDialog() {
    document.getElementById('placement-start-track')?.addEventListener('click', () => {
      placePendingFile(0);
    });

    document.getElementById('placement-playhead')?.addEventListener('click', () => {
      placePendingFile(Player.getCurrentTime());
    });

    document.getElementById('placement-end-track')?.addEventListener('click', () => {
      if (!currentPendingFile) return;
      placePendingFile(Timeline.getTrackEndTime(currentPendingFile.trackType));
    });

    document.getElementById('placement-after-selected')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (clip) {
        placePendingFile(clip.startTime + clip.duration);
      }
    });

    document.getElementById('placement-before-selected')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (clip) {
        placePendingFile(clip.startTime);
      }
    });

    document.getElementById('placement-cancel')?.addEventListener('click', () => {
      pendingFiles.shift();
      currentPendingFile = null;
      Accessibility.hideModal(document.getElementById('placement-dialog'));
      Accessibility.announce('Import cancelled.');
      // Show next if there are more
      if (pendingFiles.length > 0) {
        setTimeout(showPlacementDialog, 300);
      }
    });
  }

  function renderMediaLibrary() {
    const list = document.getElementById('media-list');
    const emptyMsg = document.getElementById('media-empty-message');
    if (!list) return;

    // Clear
    list.innerHTML = '';
    if (mediaLibrary.length === 0) {
      if (emptyMsg) {
        list.appendChild(emptyMsg);
        emptyMsg.style.display = 'block';
      }
      return;
    }

    mediaLibrary.forEach((item, idx) => {
      const el = document.createElement('div');
      el.className = 'media-item';
      el.setAttribute('role', 'listitem');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${item.name}, ${item.type}, ${item.duration > 0 ? 'duration ' + Accessibility.formatTime(item.duration) : 'image'}`);
      el.setAttribute('aria-selected', idx === selectedMediaIndex ? 'true' : 'false');

      const typeIcon = item.type === 'video' ? '[V]' : item.type === 'audio' ? '[A]' : '[I]';

      el.innerHTML = `
        <span class="media-name">${typeIcon} ${item.name}</span>
        ${item.duration > 0 ? `<span class="media-duration">${Accessibility.formatTimeDisplay(item.duration)}</span>` : ''}
      `;

      el.addEventListener('click', () => selectMedia(idx));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectMedia(idx);
        }
      });

      list.appendChild(el);
    });
  }

  function selectMedia(index) {
    selectedMediaIndex = index;
    const addBtn = document.getElementById('btn-add-to-timeline');
    if (addBtn) addBtn.disabled = false;

    // Update selection visuals
    document.querySelectorAll('.media-item').forEach((el, i) => {
      el.setAttribute('aria-selected', i === index ? 'true' : 'false');
      el.classList.toggle('selected', i === index);
    });

    const item = mediaLibrary[index];
    if (item) {
      // Load preview
      if (item.type === 'video') {
        Player.loadVideo(item.path);
      }
      Accessibility.announce(`Selected: ${item.name}`);
    }
  }

  function addSelectedToTimeline() {
    if (selectedMediaIndex < 0 || selectedMediaIndex >= mediaLibrary.length) {
      Accessibility.announce('No media selected. Select a file from the media library first.');
      return;
    }
    const item = mediaLibrary[selectedMediaIndex];
    Timeline.addClip({
      name: item.name,
      type: item.type === 'image' ? 'video' : item.type,
      filePath: item.path,
      duration: item.duration || 5,
    });
  }

  // ==========================================
  // VIDEO EDITOR TOOLBAR
  // ==========================================
  function initVideoToolbar() {
    // Import media
    document.getElementById('btn-import-media')?.addEventListener('click', async () => {
      if (window.api) {
        const result = await window.api.importMedia();
        if (!result.canceled && result.filePaths.length > 0) {
          addMediaToLibrary(result.filePaths);
        }
      }
    });

    // Import audio
    document.getElementById('btn-import-audio')?.addEventListener('click', async () => {
      if (window.api) {
        const result = await window.api.importAudio();
        if (!result.canceled && result.filePaths.length > 0) {
          addMediaToLibrary(result.filePaths);
        }
      }
    });

    // New project
    document.getElementById('btn-new-project')?.addEventListener('click', () => {
      Timeline.clearAll();
      mediaLibrary = [];
      selectedMediaIndex = -1;
      renderMediaLibrary();
      Accessibility.announce('New project created');
      Accessibility.setStatus('New project');
    });

    // Save project
    document.getElementById('btn-save-project')?.addEventListener('click', async () => {
      if (window.api) {
        const data = {
          timeline: Timeline.serialize(),
          mediaLibrary,
          version: '1.0.0',
        };
        const result = await window.api.saveProject(data);
        if (result) {
          Accessibility.announce('Project saved successfully');
          Accessibility.setStatus('Project saved');
        }
      }
    });

    // Open project
    document.getElementById('btn-open-project')?.addEventListener('click', async () => {
      if (window.api) {
        const result = await window.api.showOpenDialog({
          title: 'Open Project',
          filters: [{ name: 'Accessible Studio Project', extensions: ['asproj'] }],
          properties: ['openFile'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          try {
            const fs = require('fs');
            const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
            if (data.timeline) Timeline.deserialize(data.timeline);
            if (data.mediaLibrary) {
              mediaLibrary = data.mediaLibrary;
              renderMediaLibrary();
            }
            Accessibility.announce('Project loaded');
          } catch (e) {
            Accessibility.announce('Error loading project');
          }
        }
      }
    });

    // Export video
    document.getElementById('btn-export-video')?.addEventListener('click', () => {
      const dialog = document.getElementById('export-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    // Undo / Redo
    document.getElementById('btn-undo')?.addEventListener('click', () => Timeline.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => Timeline.redo());

    // Split / Delete / Duplicate
    document.getElementById('btn-split-clip')?.addEventListener('click', () => Timeline.splitAtPlayhead());
    document.getElementById('btn-delete-clip')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (clip) Timeline.removeClip(clip.id);
      else Accessibility.announce('No clip selected to delete');
    });
    document.getElementById('btn-duplicate-clip')?.addEventListener('click', () => Timeline.duplicateClip());

    // Add text
    document.getElementById('btn-add-text')?.addEventListener('click', () => {
      const dialog = document.getElementById('text-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    // Filters panel toggle
    document.getElementById('btn-show-filters')?.addEventListener('click', () => {
      const panel = document.getElementById('filters-panel');
      if (panel) {
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        Accessibility.announce(isHidden ? 'Filters panel opened' : 'Filters panel closed');
      }
    });
    document.getElementById('btn-close-filters')?.addEventListener('click', () => {
      document.getElementById('filters-panel')?.classList.add('hidden');
      Accessibility.announce('Filters panel closed');
    });

    // Add to timeline
    document.getElementById('btn-add-to-timeline')?.addEventListener('click', addSelectedToTimeline);

    // Playback controls
    document.getElementById('btn-play-pause')?.addEventListener('click', () => Player.togglePlay());
    document.getElementById('btn-stop')?.addEventListener('click', () => Player.stop());
    document.getElementById('btn-skip-back')?.addEventListener('click', () => Player.skipBack());
    document.getElementById('btn-skip-forward')?.addEventListener('click', () => Player.skipForward());
    document.getElementById('btn-frame-back')?.addEventListener('click', () => Player.frameBack());
    document.getElementById('btn-frame-forward')?.addEventListener('click', () => Player.frameForward());
    document.getElementById('btn-mute')?.addEventListener('click', () => Player.toggleMute());
    document.getElementById('btn-where-am-i')?.addEventListener('click', () => Player.announceWhereAmI());

    // Timeline zoom
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => Timeline.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => Timeline.zoomOut());

    // Filter presets
    document.querySelectorAll('.preset-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        Effects.applyPreset(preset);
        // Highlight active preset
        document.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Reset filters
    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
      Effects.resetAll();
      document.querySelectorAll('.preset-button').forEach(b => b.classList.remove('active'));
    });

    // Clip properties
    document.getElementById('clip-volume-slider')?.addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('clip-volume-display').textContent = val + '%';
      e.target.setAttribute('aria-valuetext', val + ' percent');
      e.target.setAttribute('aria-label', `Volume of this clip, currently ${val} percent`);
    });

    document.getElementById('btn-apply-clip-changes')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (!clip) return;
      const name = document.getElementById('clip-name-input')?.value;
      const start = parseFloat(document.getElementById('clip-start-input')?.value);
      const duration = parseFloat(document.getElementById('clip-duration-input')?.value);
      const volume = parseInt(document.getElementById('clip-volume-slider')?.value);
      const speed = parseFloat(document.getElementById('clip-speed-select')?.value);

      if (name) Timeline.updateClipProperty(clip.id, 'name', name);
      if (!isNaN(start)) Timeline.updateClipProperty(clip.id, 'startTime', start);
      if (!isNaN(duration)) Timeline.updateClipProperty(clip.id, 'duration', duration);
      if (!isNaN(volume)) Timeline.updateClipProperty(clip.id, 'volume', volume);
      if (!isNaN(speed)) Timeline.updateClipProperty(clip.id, 'speed', speed);

      Accessibility.announce('Clip properties updated');
    });

    document.getElementById('btn-remove-clip-audio')?.addEventListener('click', () => {
      Timeline.removeAudio();
    });
  }

  // ==========================================
  // PHOTO EDITOR TOOLBAR
  // ==========================================
  function initPhotoToolbar() {
    document.getElementById('btn-photo-open')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Open Image',
        filters: [
          { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff'] },
        ],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        PhotoEditor.loadImage(result.filePaths[0]);
      }
    });

    document.getElementById('btn-photo-save')?.addEventListener('click', async () => {
      if (!PhotoEditor.hasImage) {
        Accessibility.announce('No image to save');
        return;
      }
      Accessibility.announce('Use Save As to choose format and location');
    });

    document.getElementById('btn-photo-save-as')?.addEventListener('click', async () => {
      if (!PhotoEditor.hasImage || !window.api) return;
      const result = await window.api.showSaveDialog({
        title: 'Save Image As',
        filters: [
          { name: 'PNG Image', extensions: ['png'] },
          { name: 'JPEG Image', extensions: ['jpg'] },
          { name: 'WebP Image', extensions: ['webp'] },
          { name: 'BMP Image', extensions: ['bmp'] },
        ],
      });
      if (!result.canceled) {
        Accessibility.announce('Image saved');
        Accessibility.setStatus('Image saved: ' + result.filePath);
      }
    });

    document.getElementById('btn-photo-undo')?.addEventListener('click', () => PhotoEditor.undo());
    document.getElementById('btn-photo-redo')?.addEventListener('click', () => PhotoEditor.redo());
    document.getElementById('btn-photo-rotate-left')?.addEventListener('click', () => PhotoEditor.rotateLeft());
    document.getElementById('btn-photo-rotate-right')?.addEventListener('click', () => PhotoEditor.rotateRight());
    document.getElementById('btn-photo-flip-h')?.addEventListener('click', () => PhotoEditor.flipHorizontal());
    document.getElementById('btn-photo-flip-v')?.addEventListener('click', () => PhotoEditor.flipVertical());

    // Crop button
    document.getElementById('btn-photo-crop')?.addEventListener('click', () => {
      Accessibility.announce('Crop mode: Use the resize dialog to set new dimensions. Press the Resize button.');
    });

    // Resize
    document.getElementById('btn-photo-resize')?.addEventListener('click', () => {
      const dialog = document.getElementById('resize-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    document.getElementById('btn-resize-apply')?.addEventListener('click', () => {
      const w = parseInt(document.getElementById('resize-width')?.value);
      const h = parseInt(document.getElementById('resize-height')?.value);
      if (w > 0 && h > 0) {
        PhotoEditor.resize(w, h);
        Accessibility.hideModal(document.getElementById('resize-dialog'));
      }
    });
    document.getElementById('btn-resize-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('resize-dialog'));
    });

    // Filters toggle
    document.getElementById('btn-photo-filters')?.addEventListener('click', () => {
      const panel = document.getElementById('photo-adjustments');
      if (panel) {
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        Accessibility.announce(isHidden ? 'Photo adjustments panel opened' : 'Photo adjustments panel closed');
      }
    });
    document.getElementById('btn-photo-close-filters')?.addEventListener('click', () => {
      document.getElementById('photo-adjustments')?.classList.add('hidden');
    });

    document.getElementById('btn-photo-reset-filters')?.addEventListener('click', () => {
      PhotoEditor.resetAdjustments();
      PhotoEditor.applyPreset('none');
      Accessibility.announce('Photo adjustments reset');
    });

    // Photo presets
    document.querySelectorAll('.photo-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PhotoEditor.applyPreset(btn.dataset.preset);
      });
    });
  }

  // ==========================================
  // EXPORT DIALOG
  // ==========================================
  function initExportDialog() {
    document.getElementById('btn-export-start')?.addEventListener('click', async () => {
      const format = document.getElementById('export-format')?.value || 'mp4';
      const resolution = document.getElementById('export-resolution')?.value || '1920:1080';
      const fps = document.getElementById('export-fps')?.value || '30';
      const quality = document.getElementById('export-quality')?.value || 'medium';

      const clips = Timeline.getVideoClips();
      if (clips.length === 0) {
        Accessibility.announce('No clips to export. Add media to the timeline first.');
        return;
      }

      if (!window.api) {
        Accessibility.announce('Export requires the desktop application');
        return;
      }

      const result = await window.api.showSaveDialog({
        title: 'Export Video',
        defaultPath: `output.${format}`,
        filters: [{ name: `${format.toUpperCase()} Video`, extensions: [format] }],
      });

      if (result.canceled) return;

      const progressArea = document.getElementById('export-progress-area');
      const statusEl = document.getElementById('export-status');
      if (progressArea) progressArea.classList.remove('hidden');
      if (statusEl) statusEl.textContent = 'Exporting... This may take a while.';
      Accessibility.announce('Export started. Please wait.');

      // Build FFmpeg command
      const ffmpegPath = await window.api.getFFmpegPath();
      const inputArgs = clips.map(c => `-i "${c.filePath}"`).join(' ');
      const bitrateMap = { high: '8M', medium: '5M', low: '2M' };
      const bitrate = bitrateMap[quality] || '5M';

      let scaleFilter = '';
      if (resolution !== 'original') {
        scaleFilter = `-vf scale=${resolution}`;
      }

      const command = `"${ffmpegPath}" ${inputArgs} ${scaleFilter} -r ${fps} -b:v ${bitrate} -c:v libx264 -c:a aac "${result.filePath}" -y`;

      try {
        await window.api.exportVideo({ command, outputPath: result.filePath });
        if (statusEl) statusEl.textContent = 'Export complete!';
        Accessibility.announce('Export complete! Your video has been saved.');
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Export failed: ' + err;
        Accessibility.announce('Export failed. ' + err);
      }
    });

    document.getElementById('btn-export-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('export-dialog'));
    });
  }

  // ==========================================
  // TEXT OVERLAY DIALOG
  // ==========================================
  function initTextDialog() {
    document.getElementById('btn-text-add')?.addEventListener('click', () => {
      const text = document.getElementById('text-content-input')?.value || 'Text';
      const fontSize = parseInt(document.getElementById('text-font-size-input')?.value) || 48;
      const color = document.getElementById('text-color-input')?.value || '#ffffff';
      const position = document.getElementById('text-position-select')?.value || 'center';
      const duration = parseFloat(document.getElementById('text-duration-input')?.value) || 5;

      // Place text at playhead position, or at end of text track
      const playheadTime = Player.getCurrentTime();
      const trackEnd = Timeline.getTrackEndTime('text');
      const placeAt = (playheadTime > 0) ? playheadTime : trackEnd;

      Timeline.addClip({
        name: 'Text: ' + text.substring(0, 20),
        type: 'text',
        text,
        fontSize,
        textColor: color,
        textPosition: position,
        duration,
        startTime: placeAt,
      });

      const placedAt = Accessibility.formatTime(placeAt);
      Accessibility.announce(`Text "${text.substring(0, 30)}" added to timeline at ${placedAt}, showing for ${duration} seconds.`);
      Accessibility.hideModal(document.getElementById('text-dialog'));
    });

    document.getElementById('btn-text-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('text-dialog'));
    });
  }

  // ==========================================
  // SETTINGS
  // ==========================================
  function initSettings() {
    // Theme / Contrast / Font size
    document.getElementById('btn-apply-theme')?.addEventListener('click', () => {
      const theme = document.getElementById('theme-mode-select')?.value || 'dark';
      const contrast = document.getElementById('contrast-level-select')?.value || 'normal';
      const fontSize = document.getElementById('font-size-select')?.value || 'normal';

      // Apply theme
      document.body.classList.remove('light-mode');
      if (theme === 'light') document.body.classList.add('light-mode');

      // Apply contrast
      document.body.classList.remove('high-contrast', 'very-high-contrast');
      if (contrast === 'high') document.body.classList.add('high-contrast');
      else if (contrast === 'very-high') document.body.classList.add('very-high-contrast');

      // Apply font size
      document.body.classList.remove('font-small', 'font-normal', 'font-large', 'font-very-large');
      document.body.classList.add(`font-${fontSize.replace(' ', '-')}`);

      // Save to localStorage
      localStorage.setItem('as-theme', theme);
      localStorage.setItem('as-contrast', contrast);
      localStorage.setItem('as-font-size', fontSize);

      Accessibility.announce(`Theme applied: ${theme} mode, ${contrast} contrast, ${fontSize} text size`);
    });

    document.getElementById('btn-reset-theme')?.addEventListener('click', () => {
      document.body.className = '';
      document.getElementById('theme-mode-select').value = 'dark';
      document.getElementById('contrast-level-select').value = 'normal';
      document.getElementById('font-size-select').value = 'normal';
      localStorage.removeItem('as-theme');
      localStorage.removeItem('as-contrast');
      localStorage.removeItem('as-font-size');
      Accessibility.announce('Appearance reset to defaults');
    });

    // Load saved settings
    const savedTheme = localStorage.getItem('as-theme');
    const savedContrast = localStorage.getItem('as-contrast');
    const savedFontSize = localStorage.getItem('as-font-size');

    if (savedTheme === 'light') document.body.classList.add('light-mode');
    if (savedContrast === 'high') document.body.classList.add('high-contrast');
    else if (savedContrast === 'very-high') document.body.classList.add('very-high-contrast');
    if (savedFontSize) document.body.classList.add(`font-${savedFontSize.replace(' ', '-')}`);

    if (savedTheme) document.getElementById('theme-mode-select').value = savedTheme;
    if (savedContrast) document.getElementById('contrast-level-select').value = savedContrast;
    if (savedFontSize) document.getElementById('font-size-select').value = savedFontSize;

    // Login (local simulation)
    document.getElementById('btn-login')?.addEventListener('click', () => {
      const email = document.getElementById('login-email')?.value;
      const password = document.getElementById('login-password')?.value;
      if (!email || !password) {
        document.getElementById('login-status').textContent = 'Please enter both email and password.';
        Accessibility.announce('Please enter both email and password');
        return;
      }
      // Simulate local login (store in localStorage)
      localStorage.setItem('as-user-email', email);
      document.getElementById('login-status').textContent = 'Logged in successfully!';
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('account-info').classList.remove('hidden');
      document.getElementById('account-email').textContent = `Logged in as: ${email}`;
      Accessibility.announce('Logged in successfully as ' + email);
    });

    document.getElementById('btn-register')?.addEventListener('click', () => {
      const email = document.getElementById('login-email')?.value;
      const password = document.getElementById('login-password')?.value;
      if (!email || !password) {
        document.getElementById('login-status').textContent = 'Please enter email and password to create an account.';
        Accessibility.announce('Please enter email and password');
        return;
      }
      localStorage.setItem('as-user-email', email);
      document.getElementById('login-status').textContent = 'Account created and logged in!';
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('account-info').classList.remove('hidden');
      document.getElementById('account-email').textContent = `Logged in as: ${email}`;
      Accessibility.announce('Account created. Logged in as ' + email);
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
      localStorage.removeItem('as-user-email');
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('account-info').classList.add('hidden');
      document.getElementById('login-status').textContent = 'Logged out.';
      Accessibility.announce('Logged out');
    });

    // Check if already logged in
    const savedEmail = localStorage.getItem('as-user-email');
    if (savedEmail) {
      document.getElementById('login-form')?.classList.add('hidden');
      document.getElementById('account-info')?.classList.remove('hidden');
      document.getElementById('account-email').textContent = `Logged in as: ${savedEmail}`;
    }

    // Save project locally
    document.getElementById('btn-save-local')?.addEventListener('click', async () => {
      if (window.api) {
        const data = {
          timeline: Timeline.serialize(),
          mediaLibrary,
          version: '1.0.0',
        };
        const result = await window.api.saveProject(data);
        if (result) {
          Accessibility.announce('Project saved locally');
        }
      } else {
        Accessibility.announce('Local save requires the desktop application');
      }
    });
  }

  // ==========================================
  // KEYBOARD SHORTCUTS
  // ==========================================
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't capture when typing in an input
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      // F1 - shortcuts dialog (always works)
      if (e.key === 'F1') {
        e.preventDefault();
        const dialog = document.getElementById('shortcuts-dialog');
        if (dialog) Accessibility.showModal(dialog);
        return;
      }

      // Ctrl combinations (always work)
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            Timeline.undo();
            return;
          case 'y':
            e.preventDefault();
            Timeline.redo();
            return;
          case 'i':
            e.preventDefault();
            if (e.shiftKey) {
              document.getElementById('btn-import-audio')?.click();
            } else {
              document.getElementById('btn-import-media')?.click();
            }
            return;
          case 'e':
            e.preventDefault();
            document.getElementById('btn-export-video')?.click();
            return;
          case 's':
            e.preventDefault();
            document.getElementById('btn-save-project')?.click();
            return;
          case 'b':
            e.preventDefault();
            switchSection('section-assistant');
            return;
        }
        return;
      }

      // Skip if typing
      if (isTyping) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          Player.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          Player.skipForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          Player.skipBack();
          break;
        case 'ArrowUp':
          e.preventDefault();
          Player.setVolume(Math.min(100, parseInt(document.getElementById('volume-slider')?.value || 100) + 5));
          break;
        case 'ArrowDown':
          e.preventDefault();
          Player.setVolume(Math.max(0, parseInt(document.getElementById('volume-slider')?.value || 100) - 5));
          break;
        case '.':
          Player.frameForward();
          break;
        case ',':
          Player.frameBack();
          break;
        case 's':
          Timeline.splitAtPlayhead();
          break;
        case 'Delete':
        case 'Backspace':
          const clip = Timeline.getSelectedClip();
          if (clip) Timeline.removeClip(clip.id);
          break;
        case 'm':
          Player.toggleMute();
          break;
        case 'w':
          Player.announceWhereAmI();
          break;
      }
    });
  }

  // ==========================================
  // MODAL DIALOGS
  // ==========================================
  function initDialogs() {
    document.getElementById('btn-keyboard-shortcuts')?.addEventListener('click', () => {
      Accessibility.showModal(document.getElementById('shortcuts-dialog'));
    });
    document.getElementById('btn-shortcuts-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('shortcuts-dialog'));
    });

    document.getElementById('btn-about')?.addEventListener('click', () => {
      Accessibility.showModal(document.getElementById('about-dialog'));
    });
    document.getElementById('btn-about-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('about-dialog'));
    });
  }

  // ==========================================
  // IPC LISTENERS (from Electron menu)
  // ==========================================
  function initIPC() {
    if (!window.api) return;

    window.api.onFilesImported((files) => addMediaToLibrary(files));
    window.api.onAudioImported((files) => addMediaToLibrary(files));
    window.api.onMenuAction((action) => {
      switch (action) {
        case 'new-project': document.getElementById('btn-new-project')?.click(); break;
        case 'save-project': document.getElementById('btn-save-project')?.click(); break;
        case 'export': document.getElementById('btn-export-video')?.click(); break;
        case 'undo': Timeline.undo(); break;
        case 'redo': Timeline.redo(); break;
        case 'split': Timeline.splitAtPlayhead(); break;
        case 'delete-clip':
          const c = Timeline.getSelectedClip();
          if (c) Timeline.removeClip(c.id);
          break;
        case 'duplicate': Timeline.duplicateClip(); break;
        case 'zoom-in': Timeline.zoomIn(); break;
        case 'zoom-out': Timeline.zoomOut(); break;
        case 'toggle-chatbot': switchSection('section-assistant'); break;
        case 'toggle-converter': switchSection('section-file-converter'); break;
        case 'show-shortcuts':
          Accessibility.showModal(document.getElementById('shortcuts-dialog'));
          break;
        case 'about':
          Accessibility.showModal(document.getElementById('about-dialog'));
          break;
      }
    });
  }

  // ==========================================
  // INITIALIZATION
  // ==========================================
  function init() {
    initNavigation();
    initVideoToolbar();
    initPhotoToolbar();
    initExportDialog();
    initTextDialog();
    initSettings();
    initKeyboardShortcuts();
    initDialogs();
    initPlacementDialog();
    initIPC();

    // Init sub-modules
    Player.init();
    Effects.init();
    PhotoEditor.init();
    Chatbot.init();
    Converter.init();
    Timeline.initTimelineClick();
    Timeline.renderAllTracks();

    // Setup toolbar navigation for screen readers
    document.querySelectorAll('[role="toolbar"]').forEach(toolbar => {
      Accessibility.setupToolbarNavigation(toolbar);
    });

    Accessibility.setStatus('Ready. Use the sidebar to navigate between sections.');
    Accessibility.announce('Accessible Studio loaded. Use the sidebar buttons to switch between Video Editor, Photo Editor, File Converter, Assistant, User Guide, and Settings.');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { switchSection, addMediaToLibrary };
})();
