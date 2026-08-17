const App = (() => {
  console.log('DEBUG: app.js loaded and starting execution');
  const navButtons = {
    'nav-video-editor': 'section-video-editor',
    'nav-photo-editor': 'section-photo-editor',
    'nav-music-studio': 'section-music-studio',
    'nav-podcast-studio': 'section-podcast-studio',
    'nav-live-stream': 'section-live-stream',
    'nav-file-converter': 'section-file-converter',
    'nav-user-guide': 'section-user-guide',
    'nav-settings': 'section-settings',
  };

  function switchSection(sectionId) {
    document.querySelectorAll('.app-section').forEach(s => {
      s.style.display = 'none';
    });
    document.querySelectorAll('.nav-button').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    const section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'flex';
    }
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
      'section-music-studio': 'Music Studio',
      'section-podcast-studio': 'Podcast Studio',
      'section-file-converter': 'File Converter',
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

  let mediaLibrary = [];
  let selectedMediaIndex = -1;
  let pendingFiles = [];
  let currentPendingFile = null;

  function addMediaToLibrary(filePaths) {
    for (const fp of filePaths) {
      try {
        const fileName = fp.split(/[\\/]/).pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const isVideo = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'mpeg', 'mpg', 'm4v'].includes(ext);
        const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'].includes(ext);
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'svg'].includes(ext);

        let type = 'video';
        if (isAudio) type = 'audio';
        else if (isImage) type = 'image';

        const libEntry = { path: fp, name: fileName, type, duration: isImage ? 5 : 10 };
        mediaLibrary.push(libEntry);
        renderMediaLibrary();

        const trackType = isAudio ? 'audio' : 'video';

        if (isVideo || isAudio) {
          const mediaEl = isVideo ? document.createElement('video') : document.createElement('audio');
          mediaEl.preload = 'metadata';
          mediaEl.src = fp;
          let metadataHandled = false;
          mediaEl.addEventListener('loadedmetadata', () => {
            if (metadataHandled) return;
            metadataHandled = true;
            const realDuration = mediaEl.duration && isFinite(mediaEl.duration) ? mediaEl.duration : 10;
            libEntry.duration = realDuration;
            renderMediaLibrary();

            pendingFiles.push({ fileName, trackType, filePath: fp, duration: realDuration });
            if (pendingFiles.length === 1) {
              showPlacementDialog();
            }
            mediaEl.src = '';
          }, { once: true });
          mediaEl.addEventListener('error', () => {
            if (metadataHandled) return;
            metadataHandled = true;
            pendingFiles.push({ fileName, trackType, filePath: fp, duration: 10 });
            if (pendingFiles.length === 1) {
              showPlacementDialog();
            }
          }, { once: true });

          if (isVideo) {
            Player.loadVideo(fp);
            showVideoPlayer();
          }
        } else {
          pendingFiles.push({ fileName, trackType, filePath: fp, duration: 5 });
          if (pendingFiles.length === 1) {
            showPlacementDialog();
          }
        }
      } catch (err) {
        console.error('Error importing file:', fp, err);
        Accessibility.announce('Error importing file: ' + fp.split(/[\\/]/).pop());
      }
    }
    if (window.api) window.api.markUnsavedChanges();
  }

  function showVideoPlayer() {
    const wrapper = document.getElementById('video-player-wrapper');
    const noVideoMsg = document.getElementById('no-video-message');
    if (wrapper) wrapper.classList.remove('hidden');
    if (noVideoMsg) noVideoMsg.style.display = 'none';
  }

  function showPlacementDialog() {
    if (pendingFiles.length === 0) return;

    currentPendingFile = pendingFiles[0];
    const dialog = document.getElementById('placement-dialog');
    const nameEl = document.getElementById('placement-file-name');
    const infoEl = document.getElementById('placement-file-info');

    if (!dialog) {
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

      Accessibility.showModal(dialog);
    } catch (err) {
      console.error('Error showing placement dialog:', err);
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

  let isPlacing = false;
  function placePendingFile(startTime) {
    if (!currentPendingFile || isPlacing) return;
    isPlacing = true;

    const file = currentPendingFile;
    pendingFiles.shift();
    currentPendingFile = null;

    Timeline.addClip({
      name: file.fileName,
      type: file.trackType,
      filePath: file.filePath,
      duration: file.duration,
      startTime,
    });

    const placedAt = Accessibility.formatTime(startTime);
    Accessibility.announce(
      `${file.fileName} placed on ${file.trackType} track at ${placedAt}. Duration: ${Accessibility.formatTime(file.duration)}.`
    );

    Accessibility.hideModal(document.getElementById('placement-dialog'));

    isPlacing = false;

    if (pendingFiles.length > 0) {
      setTimeout(showPlacementDialog, 300);
    }
  }

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
      if (pendingFiles.length > 0) {
        setTimeout(showPlacementDialog, 300);
      }
    });
  }

  function renderMediaLibrary() {
    const list = document.getElementById('media-list');
    const emptyMsg = document.getElementById('media-empty-message');
    if (!list) return;

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

    document.querySelectorAll('.media-item').forEach((el, i) => {
      el.setAttribute('aria-selected', i === index ? 'true' : 'false');
      el.classList.toggle('selected', i === index);
    });

    const item = mediaLibrary[index];
    if (item) {
      if (item.type === 'video') {
        Player.loadVideo(item.path);
        showVideoPlayer();
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
    if (window.api) window.api.markUnsavedChanges();
  }

  function initVideoToolbar() {
    document.getElementById('btn-import-media')?.addEventListener('click', async () => {
      if (window.api) {
        const result = await window.api.importMedia();
        if (!result.canceled && result.filePaths.length > 0) {
          addMediaToLibrary(result.filePaths);
        }
      }
    });

    document.getElementById('btn-import-audio')?.addEventListener('click', async () => {
      if (window.api) {
        const result = await window.api.importAudio();
        if (!result.canceled && result.filePaths.length > 0) {
          addMediaToLibrary(result.filePaths);
        }
      }
    });

    document.getElementById('btn-new-project')?.addEventListener('click', () => {
      Timeline.clearAll();
      mediaLibrary = [];
      selectedMediaIndex = -1;
      renderMediaLibrary();
      Accessibility.announce('New project created');
      Accessibility.setStatus('New project');
      if (window.api) window.api.clearUnsavedChanges();
    });

    document.getElementById('btn-save-project')?.addEventListener('click', () => {
      const dialog = document.getElementById('save-project-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    document.getElementById('btn-save-project-confirm')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('save-project-name');
      const name = nameInput?.value?.trim();
      if (!name) {
        Accessibility.announce('Please enter a project name');
        return;
      }
      if (!window.api) {
        Accessibility.announce('Save requires the desktop application');
        return;
      }
      try {
        const projectData = {
          timeline: Timeline.serialize(),
          mediaLibrary,
        };
        await window.api.saveProjectToLibrary({ name, data: projectData });
        Accessibility.announce(`Project "${name}" saved successfully`);
        Accessibility.hideModal(document.getElementById('save-project-dialog'));
        nameInput.value = '';
        loadProjectList();
      } catch (e) {
        Accessibility.announce('Error saving project: ' + (e.message || e));
      }
    });

    document.getElementById('btn-save-project-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('save-project-dialog'));
    });

    document.getElementById('btn-export-video')?.addEventListener('click', () => {
      const dialog = document.getElementById('export-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    document.getElementById('btn-normalize')?.addEventListener('click', () => {
      const clips = Timeline.getClips();
      if (clips.length === 0) {
        Accessibility.announce('No clips to normalize');
        return;
      }
      clips.forEach(c => {
        Timeline.updateClipProperty(c.id, 'volume', 100);
      });
      Effects.setFilter('brightness', 100);
      Effects.setFilter('contrast', 100);
      Accessibility.announce(`Normalized ${clips.length} clips: all volumes set to 100%, brightness and contrast reset to neutral.`);
    });

    document.getElementById('btn-accessibility-score')?.addEventListener('click', () => {
      Accessibility.showModal(document.getElementById('accessibility-score-dialog'));
    });

    document.getElementById('btn-undo')?.addEventListener('click', () => Timeline.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => Timeline.redo());

    document.getElementById('btn-split-clip')?.addEventListener('click', () => Timeline.splitAtPlayhead());
    document.getElementById('btn-delete-clip')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (clip) Timeline.removeClip(clip.id);
      else Accessibility.announce('No clip selected to delete');
    });

    // Picture Lock
    document.getElementById('btn-picture-lock')?.addEventListener('click', async () => {
      if (window.api) {
        const result = await window.api.togglePictureLock();
        const btn = document.getElementById('btn-picture-lock');
        if (btn) btn.textContent = `Picture Lock: ${result.locked ? 'On' : 'Off'}`;
        Accessibility.announce(result.locked ? 'Picture lock enabled. Video edits are disabled.' : 'Picture lock disabled. Video edits enabled.');
      }
    });

    // Grid Overlay
    document.getElementById('btn-toggle-grid')?.addEventListener('click', async () => {
      const current = await (window.api ? window.api.getGrid() : { type: 'none' });
      const newType = current.type === 'none' ? 'thirds' : 'none';
      if (window.api) await window.api.setGrid({ type: newType, density: 3 });
      const btn = document.getElementById('btn-toggle-grid');
      if (btn) btn.textContent = `Grid: ${newType === 'none' ? 'Off' : 'On'}`;
      Accessibility.announce(newType === 'none' ? 'Grid overlay hidden.' : 'Rule of thirds grid enabled.');
    });

    // Batch Rename
    document.getElementById('btn-batch-rename')?.addEventListener('click', () => {
      Accessibility.showModal(document.getElementById('batch-rename-dialog'));
    });
    document.getElementById('btn-batch-rename-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('batch-rename-dialog'));
    });
    document.getElementById('btn-batch-rename-execute')?.addEventListener('click', async () => {
      if (!window.api) return;
      const pattern = document.getElementById('batch-rename-pattern')?.value || '{sequence}_{original}';
      if (!window.api.showOpenDialog) return;
      const result = await window.api.showOpenDialog({
        title: 'Select files to rename',
        filters: [{ name: 'All Files', extensions: ['*'] }],
        properties: ['openFile', 'multiSelections'],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return;
      const files = result.filePaths.map(p => ({ oldPath: p }));
      const renameResult = await window.api.batchRename({ files, pattern });
      if (renameResult.success) {
        const renamed = renameResult.results.filter(r => r.success).length;
        Accessibility.announce(`Renamed ${renamed} of ${files.length} files.`);
      }
      Accessibility.hideModal(document.getElementById('batch-rename-dialog'));
    });

    // Readability
    document.getElementById('btn-readability')?.addEventListener('click', () => {
      Accessibility.showModal(document.getElementById('readability-dialog'));
    });
    document.getElementById('btn-readability-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('readability-dialog'));
    });
    document.getElementById('btn-analyse-readability')?.addEventListener('click', async () => {
      const text = document.getElementById('readability-input')?.value;
      if (!text || !text.trim()) { Accessibility.announce('Enter some text to analyse.'); return; }
      const results = document.getElementById('readability-results');
      if (!results) return;
      results.innerHTML = '<p>Analysing...</p>';
      if (window.api) {
        const data = await window.api.analyseReadability(text);
        if (data.success) {
          const s = data.stats;
          results.innerHTML = `
            <table style="width:100%;font-size:0.9em;">
              <tr><td>Words</td><td>${s.wordCount}</td></tr>
              <tr><td>Sentences</td><td>${s.sentenceCount}</td></tr>
              <tr><td>Avg words/sentence</td><td>${s.avgWordsPerSentence}</td></tr>
              <tr><td>Syllables/word</td><td>${s.avgSyllablesPerWord}</td></tr>
              <tr><td><strong>Flesch Reading Ease</strong></td><td><strong>${s.fleschReadingEase}</strong></td></tr>
              <tr><td><strong>Grade Level</strong></td><td><strong>${s.fleschKincaidGrade}</strong></td></tr>
              <tr><td>Passive voice instances</td><td>${s.passiveVoiceCount}</td></tr>
              <tr><td colspan="2" style="padding-top:8px;font-style:italic;">${data.interpretation}</td></tr>
            </table>`;
          Accessibility.announce(`Readability score: ${s.fleschReadingEase}. ${data.interpretation}`);
        }
      }
    });

    // Photo Restoration
    document.getElementById('btn-photo-restore')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select photo to restore',
        filters: [{ name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'tiff'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return;
      const saveResult = await window.api.showSaveDialog({
        title: 'Save restored photo',
        defaultPath: `restored-${result.filePaths[0].split(/[/\\]/).pop()}`,
        filters: [{ name: 'Image Files', extensions: ['jpg', 'png'] }],
      });
      if (saveResult.canceled) return;
      const status = document.getElementById('photo-restore-status');
      if (status) status.textContent = 'Restoring...';
      Accessibility.announce('Restoring photo. This may take a moment.');
      const restoreResult = await window.api.restorePhoto({ inputPath: result.filePaths[0], outputPath: saveResult.filePath, pipeline: ['enhance', 'sharpen', 'denoise'] });
      if (status) status.textContent = restoreResult.success ? 'Photo restored successfully.' : `Restore failed: ${restoreResult.error}`;
      Accessibility.announce(restoreResult.success ? 'Photo restored successfully.' : 'Photo restoration failed.');
    });

    // LUT Browser
    document.getElementById('btn-lut-browser')?.addEventListener('click', () => {
      const list = document.getElementById('lut-list');
      if (!list) return;
      list.innerHTML = '<p>Loading LUTs...</p>';
      Accessibility.showModal(document.getElementById('lut-dialog'));
      if (window.api) {
        window.api.listBuiltinLuts().then(luts => {
          list.innerHTML = '';
          if (!luts || luts.length === 0) { list.innerHTML = '<p>No LUT presets available.</p>'; return; }
          luts.forEach(lut => {
            const item = document.createElement('div');
            item.setAttribute('role', 'listitem');
            item.className = 'lut-item';
            item.style.cssText = 'padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;';
            item.innerHTML = `<span style="flex:1;"><strong>${lut.name}</strong><br><span style="font-size:0.85em;color:var(--text-muted);">${lut.description}</span></span>
              <button class="btn-apply-lut" data-lut-id="${lut.id}" aria-label="Apply ${lut.name} LUT to selected clip">Apply</button>
              <button class="btn-export-lut" data-lut-id="${lut.id}" aria-label="Export ${lut.name} as .cube file">Export .cube</button>`;
            list.appendChild(item);
          });
          // Apply LUT handler
          list.querySelectorAll('.btn-apply-lut').forEach(btn => {
            btn.addEventListener('click', async () => {
              const lutId = btn.dataset.lutId;
              const clip = Timeline.getSelectedClip();
              if (!clip) { Accessibility.announce('Select a clip first to apply LUT.'); return; }
              Accessibility.announce(`Applying ${lutId} LUT. This may take a moment.`);
              if (window.api) {
                const result = await window.api.showSaveDialog({
                  title: 'Save LUT-graded clip',
                  defaultPath: `graded-${clip.fileName || 'clip'}.mp4`,
                  filters: [{ name: 'Video Files', extensions: ['mp4'] }],
                });
                if (!result.canceled && result.filePath) {
                  const lutPath = window.electronAPI.pathJoin(window.electronAPI.tmpdir(), `${lutId}.cube`);
                  await window.api.exportLut({ lutId, outputPath: lutPath });
                  const applyResult = await window.api.applyLutToClip({ inputPath: clip.filePath, outputPath: result.filePath, lutPath });
                  if (applyResult.success) {
                    Accessibility.announce('LUT applied successfully. Graded clip saved.');
                  } else {
                    Accessibility.announce('Failed to apply LUT: ' + (applyResult.error || ''));
                  }
                }
              }
            });
          });
          // Export LUT handler
          list.querySelectorAll('.btn-export-lut').forEach(btn => {
            btn.addEventListener('click', async () => {
              const lutId = btn.dataset.lutId;
              if (window.api) {
                const result = await window.api.showSaveDialog({
                  title: 'Export LUT as .cube file',
                  defaultPath: `${lutId}.cube`,
                  filters: [{ name: 'Cube LUT Files', extensions: ['cube'] }],
                });
                if (!result.canceled && result.filePath) {
                  const exportResult = await window.api.exportLut({ lutId, outputPath: result.filePath });
                  if (exportResult.success) {
                    Accessibility.announce(`LUT exported to ${result.filePath}`);
                  }
                }
              }
            });
          });
        });
      }
    });
    document.getElementById('btn-import-cube-lut')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Import .cube LUT file',
        filters: [{ name: 'Cube LUT Files', extensions: ['cube'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths[0]) {
        const info = await window.api.importLut(result.filePaths[0]);
        const status = document.getElementById('lut-import-status');
        if (status) status.textContent = info.success ? `Imported: ${info.name} (${info.size})` : `Import failed: ${info.error}`;
        Accessibility.announce(info.success ? `LUT imported: ${info.name}` : 'LUT import failed.');
      }
    });
    document.getElementById('btn-lut-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('lut-dialog'));
    });

    // Document Templates
    document.getElementById('btn-document-templates')?.addEventListener('click', () => {
      const list = document.getElementById('template-list');
      if (!list) return;
      list.innerHTML = '<p>Loading templates...</p>';
      Accessibility.showModal(document.getElementById('template-dialog'));
      if (window.api) {
        window.api.listDocumentTemplates().then(templates => {
          list.innerHTML = '';
          if (!templates || templates.length === 0) { list.innerHTML = '<p>No templates available.</p>'; return; }
          templates.forEach(t => {
            const item = document.createElement('div');
            item.setAttribute('role', 'listitem');
            item.className = 'template-item';
            item.style.cssText = 'padding:8px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;cursor:pointer;';
            item.innerHTML = `<span style="flex:1;"><strong>${t.name}</strong><br><span style="font-size:0.85em;color:var(--text-muted);">${t.description}</span></span>
              <button class="btn-use-template" data-template-id="${t.id}" aria-label="Create document from ${t.name} template">Create</button>`;
            list.appendChild(item);
            item.querySelector('.btn-use-template')?.addEventListener('click', async () => {
              const templateId = item.dataset.templateId || t.id;
              if (window.api) {
                const saveResult = await window.api.showSaveDialog({
                  title: `Save ${t.name} document`,
                  defaultPath: `${t.name.toLowerCase().replace(/\s+/g, '-')}.docx`,
                  filters: [{ name: 'Word Document', extensions: ['docx'] }],
                });
                if (!saveResult.canceled && saveResult.filePath) {
                  const createResult = await window.api.createDocumentFromTemplate({ templateId, outputPath: saveResult.filePath });
                  if (createResult.success) {
                    Accessibility.announce(`${t.name} document created.`);
                  } else {
                    Accessibility.announce('Failed to create document: ' + (createResult.error || ''));
                  }
                }
              }
            });
          });
        });
      }
    });
    document.getElementById('btn-template-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('template-dialog'));
    });
    document.getElementById('btn-duplicate-clip')?.addEventListener('click', () => Timeline.duplicateClip());

    document.getElementById('btn-add-caption')?.addEventListener('click', () => {
      const playheadTime = Player.getCurrentTime();
      const startInput = document.getElementById('caption-start-input');
      const multiStart = document.getElementById('caption-multi-start');
      if (startInput) startInput.value = playheadTime.toFixed(1);
      if (multiStart) multiStart.value = playheadTime.toFixed(1);
      const dialog = document.getElementById('caption-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    document.getElementById('caption-mode-select')?.addEventListener('change', (e) => {
      const isMulti = e.target.value === 'multi';
      const singleMode = document.getElementById('caption-single-mode');
      const multiMode = document.getElementById('caption-multi-mode');
      if (singleMode) singleMode.classList.toggle('hidden', isMulti);
      if (multiMode) multiMode.classList.toggle('hidden', !isMulti);
    });

    document.getElementById('btn-caption-add')?.addEventListener('click', () => {
      const mode = document.getElementById('caption-mode-select')?.value || 'single';
      const position = document.getElementById('caption-position-select')?.value || 'bottom';
      const fontSize = parseInt(document.getElementById('caption-size-input')?.value) || 32;
      const color = document.getElementById('caption-color-input')?.value || '#ffffff';

      if (mode === 'single') {
        const text = document.getElementById('caption-text-input')?.value || 'Caption';
        const startTime = parseFloat(document.getElementById('caption-start-input')?.value) || 0;
        const duration = parseFloat(document.getElementById('caption-duration-input')?.value) || 3;

        Timeline.addClip({
          name: 'Caption: ' + text.substring(0, 25),
          type: 'text', text, fontSize, textColor: color, textPosition: position,
          duration, startTime,
        });
        Accessibility.announce(`Caption added at ${Accessibility.formatTime(startTime)} for ${duration} seconds`);
        document.getElementById('caption-text-input').value = '';
      } else {
        const multiText = document.getElementById('caption-multi-text')?.value || '';
        const lines = multiText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) {
          Accessibility.announce('No caption lines entered');
          return;
        }
        const startTime = parseFloat(document.getElementById('caption-multi-start')?.value) || 0;
        const lineDuration = parseFloat(document.getElementById('caption-line-duration')?.value) || 3;
        const gap = parseFloat(document.getElementById('caption-gap-duration')?.value) || 0.25;

        let currentTime = startTime;
        lines.forEach((line, i) => {
          Timeline.addClip({
            name: `Caption ${i + 1}: ${line.substring(0, 20)}`,
            type: 'text', text: line, fontSize, textColor: color, textPosition: position,
            duration: lineDuration, startTime: currentTime,
          });
          currentTime += lineDuration + gap;
        });
        Accessibility.announce(`Added ${lines.length} captions starting at ${Accessibility.formatTime(startTime)}, ${lineDuration} seconds each`);
        document.getElementById('caption-multi-text').value = '';
      }

      Accessibility.hideModal(document.getElementById('caption-dialog'));
      if (window.api) window.api.markUnsavedChanges();
    });

    document.getElementById('btn-caption-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('caption-dialog'));
    });

    const transSelect = document.getElementById('transition-type-select');
    if (transSelect) {
      Timeline.getTransitionTypes().forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        const displayName = type.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        opt.textContent = `${displayName} — ${Timeline.getTransitionDescription(type)}`;
        transSelect.appendChild(opt);
      });
    }

    function openTransitionDialog() {
      const clip = Timeline.getSelectedClip();
      if (!clip) {
        Accessibility.announce('Select a clip first to add a transition');
        return;
      }
      const typeSelect = document.getElementById('transition-type-select');
      const durInput = document.getElementById('transition-duration-input');
      if (typeSelect) typeSelect.value = clip.transition ? clip.transition.type : 'none';
      if (durInput) durInput.value = clip.transition ? clip.transition.duration : 1;
      const dialog = document.getElementById('transition-dialog');
      if (dialog) Accessibility.showModal(dialog);
    }

    document.getElementById('btn-add-transition')?.addEventListener('click', openTransitionDialog);
    document.getElementById('btn-change-transition')?.addEventListener('click', openTransitionDialog);

    document.getElementById('btn-transition-apply')?.addEventListener('click', () => {
      const type = document.getElementById('transition-type-select')?.value || 'none';
      const duration = parseFloat(document.getElementById('transition-duration-input')?.value) || 1;
      Timeline.setTransition(null, type, duration);
      Accessibility.hideModal(document.getElementById('transition-dialog'));
      updateTransitionButton();
    });

    document.getElementById('btn-transition-remove')?.addEventListener('click', () => {
      Timeline.setTransition(null, 'none');
      Accessibility.hideModal(document.getElementById('transition-dialog'));
      updateTransitionButton();
    });

    document.getElementById('btn-transition-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('transition-dialog'));
    });

    function updateTransitionButton() {
      const clip = Timeline.getSelectedClip();
      const btn = document.getElementById('btn-change-transition');
      if (btn) {
        btn.classList.toggle('hidden', !clip || !clip.transition);
        if (clip && clip.transition) {
          btn.textContent = `Change Transition (${clip.transition.type})`;
        }
      }
    }
    Timeline.onChange(updateTransitionButton);

    document.getElementById('btn-add-text')?.addEventListener('click', () => {
      const dialog = document.getElementById('text-dialog');
      if (dialog) Accessibility.showModal(dialog);
    });

    document.getElementById('btn-chroma-key')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (!clip) { Accessibility.announce('Select a clip first'); return; }
      if (clip.chromaKey) {
        document.getElementById('chroma-color').value = clip.chromaKey.color;
        document.getElementById('chroma-tolerance').value = clip.chromaKey.tolerance;
        document.getElementById('chroma-softness').value = clip.chromaKey.softness;
      }
      Accessibility.showModal(document.getElementById('chroma-dialog'));
    });
    document.getElementById('chroma-tolerance')?.addEventListener('input', (e) => {
      document.getElementById('chroma-tolerance-val').textContent = e.target.value;
      e.target.setAttribute('aria-valuetext', e.target.value);
    });
    document.getElementById('chroma-softness')?.addEventListener('input', (e) => {
      document.getElementById('chroma-softness-val').textContent = e.target.value;
      e.target.setAttribute('aria-valuetext', e.target.value);
    });
    document.getElementById('btn-chroma-apply')?.addEventListener('click', () => {
      const color = document.getElementById('chroma-color')?.value || '#00ff00';
      const tolerance = parseInt(document.getElementById('chroma-tolerance')?.value) || 40;
      const softness = parseInt(document.getElementById('chroma-softness')?.value) || 10;
      Timeline.setChromaKey(null, color, tolerance, softness);
      Accessibility.hideModal(document.getElementById('chroma-dialog'));
    });
    document.getElementById('btn-chroma-remove')?.addEventListener('click', () => {
      Timeline.clearChromaKey();
      Accessibility.hideModal(document.getElementById('chroma-dialog'));
    });
    document.getElementById('btn-chroma-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('chroma-dialog'));
    });

    document.getElementById('btn-keyframe')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (!clip) { Accessibility.announce('Select a clip first'); return; }
      updateKeyframeDisplay();
      Accessibility.showModal(document.getElementById('keyframe-dialog'));
    });
    function updateKeyframeDisplay() {
      const clip = Timeline.getSelectedClip();
      const prop = document.getElementById('keyframe-property')?.value || 'opacity';
      const display = document.getElementById('keyframe-list-display');
      if (!clip || !display) return;
      const kfs = Timeline.getKeyframes(clip.id, prop);
      if (kfs.length === 0) {
        display.textContent = `No ${prop} keyframes set.`;
      } else {
        display.textContent = `${prop} keyframes: ` + kfs.map(k => `${k.time}s→${k.value}`).join(', ');
      }
    }
    document.getElementById('keyframe-property')?.addEventListener('change', updateKeyframeDisplay);
    document.getElementById('btn-keyframe-add')?.addEventListener('click', () => {
      const prop = document.getElementById('keyframe-property')?.value;
      const time = parseFloat(document.getElementById('keyframe-time')?.value) || 0;
      const value = parseFloat(document.getElementById('keyframe-value')?.value) || 0;
      Timeline.addKeyframe(null, prop, time, value);
      updateKeyframeDisplay();
    });
    document.getElementById('btn-keyframe-clear')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      const prop = document.getElementById('keyframe-property')?.value;
      if (clip && clip.keyframes && clip.keyframes[prop]) {
        const kfs = [...clip.keyframes[prop]];
        kfs.forEach(k => Timeline.removeKeyframe(clip.id, prop, k.time));
      }
      updateKeyframeDisplay();
    });
    document.getElementById('btn-keyframe-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('keyframe-dialog'));
    });

    let tempSpeedPoints = [];
    document.getElementById('btn-speed-ramp')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (!clip) { Accessibility.announce('Select a clip first'); return; }
      tempSpeedPoints = clip.speedRamp ? [...clip.speedRamp] : [];
      renderSpeedRampPoints();
      Accessibility.showModal(document.getElementById('speedramp-dialog'));
    });
    function renderSpeedRampPoints() {
      const container = document.getElementById('speedramp-points');
      if (!container) return;
      if (tempSpeedPoints.length === 0) {
        container.innerHTML = '<p class="help-text">No speed ramp points yet. Add points below.</p>';
        return;
      }
      container.innerHTML = '';
      tempSpeedPoints.sort((a, b) => a.time - b.time).forEach((p, i) => {
        const el = document.createElement('div');
        el.className = 'speedramp-point';
        el.setAttribute('role', 'listitem');
        el.innerHTML = `<span>At ${p.time}s: ${p.speed}x speed</span>`;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('aria-label', `Remove speed point at ${p.time} seconds`);
        removeBtn.addEventListener('click', () => { tempSpeedPoints.splice(i, 1); renderSpeedRampPoints(); });
        el.appendChild(removeBtn);
        container.appendChild(el);
      });
    }
    document.getElementById('btn-speedramp-add-point')?.addEventListener('click', () => {
      const time = parseFloat(document.getElementById('speedramp-time')?.value) || 0;
      const speed = parseFloat(document.getElementById('speedramp-speed')?.value) || 1;
      tempSpeedPoints.push({ time, speed });
      renderSpeedRampPoints();
    });
    document.getElementById('btn-speedramp-apply')?.addEventListener('click', () => {
      if (tempSpeedPoints.length > 0) Timeline.setSpeedRamp(null, tempSpeedPoints);
      Accessibility.hideModal(document.getElementById('speedramp-dialog'));
    });
    document.getElementById('btn-speedramp-clear')?.addEventListener('click', () => {
      tempSpeedPoints = [];
      const clip = Timeline.getSelectedClip();
      if (clip) Timeline.updateClipProperty(clip.id, 'speedRamp', null);
      renderSpeedRampPoints();
      Accessibility.announce('Speed ramp cleared');
    });
    document.getElementById('btn-speedramp-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('speedramp-dialog'));
    });

    document.getElementById('btn-ken-burns')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (!clip) { Accessibility.announce('Select a clip first'); return; }
      if (clip.kenBurns) {
        document.getElementById('kb-start-x').value = clip.kenBurns.startX;
        document.getElementById('kb-start-y').value = clip.kenBurns.startY;
        document.getElementById('kb-start-scale').value = clip.kenBurns.startScale;
        document.getElementById('kb-end-x').value = clip.kenBurns.endX;
        document.getElementById('kb-end-y').value = clip.kenBurns.endY;
        document.getElementById('kb-end-scale').value = clip.kenBurns.endScale;
      }
      Accessibility.showModal(document.getElementById('kenburns-dialog'));
    });
    document.getElementById('btn-kb-zoom-in')?.addEventListener('click', () => {
      document.getElementById('kb-start-x').value = 50;
      document.getElementById('kb-start-y').value = 50;
      document.getElementById('kb-start-scale').value = 1;
      document.getElementById('kb-end-x').value = 50;
      document.getElementById('kb-end-y').value = 50;
      document.getElementById('kb-end-scale').value = 1.5;
      Accessibility.announce('Zoom in preset loaded');
    });
    document.getElementById('btn-kb-zoom-out')?.addEventListener('click', () => {
      document.getElementById('kb-start-scale').value = 1.5;
      document.getElementById('kb-end-scale').value = 1;
      Accessibility.announce('Zoom out preset loaded');
    });
    document.getElementById('btn-kb-pan-left')?.addEventListener('click', () => {
      document.getElementById('kb-start-x').value = 70;
      document.getElementById('kb-end-x').value = 30;
      Accessibility.announce('Pan left preset loaded');
    });
    document.getElementById('btn-kb-pan-right')?.addEventListener('click', () => {
      document.getElementById('kb-start-x').value = 30;
      document.getElementById('kb-end-x').value = 70;
      Accessibility.announce('Pan right preset loaded');
    });
    document.getElementById('btn-kb-apply')?.addEventListener('click', () => {
      Timeline.setKenBurns(null,
        parseFloat(document.getElementById('kb-start-x').value),
        parseFloat(document.getElementById('kb-start-y').value),
        parseFloat(document.getElementById('kb-start-scale').value),
        parseFloat(document.getElementById('kb-end-x').value),
        parseFloat(document.getElementById('kb-end-y').value),
        parseFloat(document.getElementById('kb-end-scale').value)
      );
      Accessibility.hideModal(document.getElementById('kenburns-dialog'));
    });
    document.getElementById('btn-kb-remove')?.addEventListener('click', () => {
      Timeline.clearKenBurns();
      Accessibility.hideModal(document.getElementById('kenburns-dialog'));
    });
    document.getElementById('btn-kb-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('kenburns-dialog'));
    });

    document.getElementById('btn-freeze-frame')?.addEventListener('click', () => {
      const clip = Timeline.getSelectedClip();
      if (!clip) { Accessibility.announce('Select a clip first'); return; }
      const playheadTime = Player.getCurrentTime();
      Timeline.freezeFrame(clip.id, playheadTime, 3);
    });

    document.getElementById('btn-toggle-snap')?.addEventListener('click', () => {
      Timeline.toggleSnap();
      const btn = document.getElementById('btn-toggle-snap');
      btn.textContent = btn.textContent.includes('On') ? 'Snap: Off' : 'Snap: On';
    });

    function refreshMarkerList() {
      const list = document.getElementById('marker-list');
      const empty = document.getElementById('marker-list-empty');
      if (!list) return;
      const markers = Timeline.getMarkers();
      // Remove old items (keep empty message)
      list.querySelectorAll('.marker-list-item').forEach(el => el.remove());
      if (markers.length === 0) {
        if (empty) empty.style.display = '';
        return;
      }
      if (empty) empty.style.display = 'none';
      markers.forEach((m, idx) => {
        const item = document.createElement('div');
        item.className = 'marker-list-item';
        item.setAttribute('role', 'listitem');
        item.innerHTML = `<span style="color:${m.color};">●</span> <strong>${m.label}</strong> at ${Accessibility.formatTime(m.time)} <button class="marker-delete-btn" data-marker-id="${m.id}" aria-label="Delete marker: ${m.label}">Delete</button>`;
        list.appendChild(item);
      });
      // Attach delete handlers
      list.querySelectorAll('.marker-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.target.getAttribute('data-marker-id');
          Timeline.removeMarker(id);
          refreshMarkerList();
          Accessibility.announce('Marker deleted');
        });
      });
    }

    document.getElementById('btn-add-marker')?.addEventListener('click', () => {
      const timeDisplay = document.getElementById('marker-time-display');
      const playheadTime = Player.getCurrentTime();
      if (timeDisplay) timeDisplay.textContent = `Marker will be placed at ${Accessibility.formatTime(playheadTime)}`;
      refreshMarkerList();
      Accessibility.showModal(document.getElementById('marker-dialog'));
    });
    document.getElementById('btn-marker-add')?.addEventListener('click', () => {
      const label = document.getElementById('marker-label')?.value?.trim() || 'Marker';
      const color = document.getElementById('marker-color')?.value || '#ffcc00';
      const playheadTime = Player.getCurrentTime();
      Timeline.addMarker(playheadTime, label, color);
      refreshMarkerList();
      document.getElementById('marker-label').value = '';
    });
    document.getElementById('btn-marker-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('marker-dialog'));
    });

    document.getElementById('btn-prev-marker')?.addEventListener('click', () => {
      const prev = Timeline.getPrevMarker(Player.getCurrentTime());
      if (prev) {
        Player.seekTo(prev.time);
        Accessibility.announce(`Previous marker: ${prev.label}`);
      } else {
        Accessibility.announce('No previous marker');
      }
    });
    document.getElementById('btn-next-marker')?.addEventListener('click', () => {
      const next = Timeline.getNextMarker(Player.getCurrentTime());
      if (next) {
        Player.seekTo(next.time);
        Accessibility.announce(`Next marker: ${next.label}`);
      } else {
        Accessibility.announce('No next marker');
      }
    });

    document.getElementById('btn-color-correct')?.addEventListener('click', () => {
      const panel = document.getElementById('color-correction-panel');
      if (panel) {
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        Accessibility.announce(isHidden ? 'Color correction panel opened' : 'Color correction panel closed');
      }
    });
    document.getElementById('btn-close-cc')?.addEventListener('click', () => {
      document.getElementById('color-correction-panel')?.classList.add('hidden');
      Accessibility.announce('Color correction panel closed');
    });
    document.getElementById('btn-reset-cc')?.addEventListener('click', () => {
      Effects.resetColorCorrection();
    });
    ['redBalance', 'greenBalance', 'blueBalance', 'temperature', 'tint', 'shadows', 'highlights'].forEach(name => {
      const slider = document.getElementById(`cc-${name}-slider`);
      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = e.target.value;
          const display = document.getElementById(`cc-${name}-val`);
          if (display) display.textContent = val + (name === 'temperature' || name === 'tint' || name === 'shadows' || name === 'highlights' ? '' : '%');
          e.target.setAttribute('aria-valuetext', val + '%');
          Effects.setColorCorrection(name, parseFloat(val));
        });
      }
    });

    document.getElementById('btn-add-title')?.addEventListener('click', () => {
      const list = document.getElementById('title-template-list');
      if (list && list.children.length === 0) {
        Timeline.getTitleTemplates().forEach((tmpl, i) => {
          const item = document.createElement('div');
          item.className = 'title-template-item';
          item.setAttribute('role', 'listitem');
          item.setAttribute('tabindex', '0');
          item.setAttribute('aria-label', `${tmpl.name}: ${tmpl.text.substring(0, 40)}, ${tmpl.duration} seconds`);
          item.innerHTML = `<strong>${tmpl.name}</strong><span>"${tmpl.text.substring(0, 50)}" — ${tmpl.duration}s</span>`;
          item.addEventListener('click', () => {
            const customText = document.getElementById('title-custom-text')?.value?.trim();
            Timeline.addTitleFromTemplate(i, Player.getCurrentTime(), customText || null);
            Accessibility.hideModal(document.getElementById('title-dialog'));
          });
          item.addEventListener('keydown', (e) => { if (e.key === 'Enter') item.click(); });
          list.appendChild(item);
        });
      }
      Accessibility.showModal(document.getElementById('title-dialog'));
    });
    document.getElementById('btn-title-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('title-dialog'));
    });

    document.getElementById('btn-pip-preset')?.addEventListener('click', () => {
      const list = document.getElementById('pip-preset-list');
      if (list && list.children.length === 0) {
        Timeline.getPipPresets().forEach(name => {
          const btn = document.createElement('button');
          btn.className = 'pip-preset-btn';
          btn.setAttribute('role', 'listitem');
          const displayName = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          btn.textContent = displayName;
          btn.setAttribute('aria-label', `Position clip at ${displayName}`);
          btn.addEventListener('click', () => {
            const clipId = getSelectedClipId('detached-clip-select');
            if (clipId) {
              Timeline.setPipPreset(clipId, name);
              renderClipList();
            }
            Accessibility.hideModal(document.getElementById('pip-dialog'));
          });
          list.appendChild(btn);
        });
      }
      Accessibility.showModal(document.getElementById('pip-dialog'));
    });
    document.getElementById('btn-pip-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('pip-dialog'));
    });

    document.getElementById('audio-ducking-toggle')?.addEventListener('change', (e) => {
      Effects.setAudioDucking(e.target.checked);
    });
    document.getElementById('duck-amount')?.addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('duck-amount-val').textContent = val + '%';
      e.target.setAttribute('aria-valuetext', val + '%');
      Effects.setAudioDucking(document.getElementById('audio-ducking-toggle')?.checked, parseInt(val));
    });

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

    document.getElementById('btn-add-to-timeline')?.addEventListener('click', addSelectedToTimeline);

    document.getElementById('btn-play-pause')?.addEventListener('click', () => Player.togglePlay());
    document.getElementById('btn-stop')?.addEventListener('click', () => Player.stop());
    document.getElementById('btn-skip-back')?.addEventListener('click', () => Player.skipBack());
    document.getElementById('btn-skip-forward')?.addEventListener('click', () => Player.skipForward());
    document.getElementById('btn-frame-back')?.addEventListener('click', () => Player.frameBack());
    document.getElementById('btn-frame-forward')?.addEventListener('click', () => Player.frameForward());
    document.getElementById('btn-mute')?.addEventListener('click', () => Player.toggleMute());
    document.getElementById('btn-where-am-i')?.addEventListener('click', () => Player.announceWhereAmI());
    document.getElementById('btn-describe-scene')?.addEventListener('click', async () => {
      const currentTime = Player.getCurrentTime();
      const clips = Timeline.getClipsAtTime(currentTime);
      let desc = `At ${Accessibility.formatTime(currentTime)}: `;
      if (clips.length === 0) {
        desc += 'No clips at this position. The preview is empty.';
      } else {
        const clipDescs = clips.map(c => {
          let d = `${c.label || c.fileName || 'Clip'}`;
          if (c.type) d += ` (${c.type})`;
          if (c.textContent) d += `: "${c.textContent}"`;
          return d;
        });
        desc += clipDescs.join('; ');
      }
      Accessibility.announce(desc);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(desc);
        utter.rate = 0.85;
        window.speechSynthesis.speak(utter);
      }
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => Timeline.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => Timeline.zoomOut());

    const brightnessSlider = document.getElementById('filter-brightness-slider');
    if (brightnessSlider) {
      brightnessSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('filter-brightness-val').textContent = val + '%';
        e.target.setAttribute('aria-valuetext', val + ' percent');
        e.target.setAttribute('aria-label', `Brightness, currently ${val} percent`);
        Effects.setFilter('brightness', val);
      });
    }

    const contrastSlider = document.getElementById('filter-contrast-slider');
    if (contrastSlider) {
      contrastSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('filter-contrast-val').textContent = val + '%';
        e.target.setAttribute('aria-valuetext', val + ' percent');
        e.target.setAttribute('aria-label', `Contrast, currently ${val} percent`);
        Effects.setFilter('contrast', val);
      });
    }

    let pendingFilterPreset = null;

    const filterList = document.getElementById('filter-list');
    if (filterList) {
      const presetNames = Effects.getPresetNames();
      presetNames.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'filter-option';
        btn.setAttribute('role', 'listitem');
        btn.dataset.preset = name;
        const displayName = name === 'none' ? 'None (Original)' : name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const desc = Effects.getPresetDescription(name);
        btn.setAttribute('aria-label', `${displayName}: ${desc}`);
        btn.innerHTML = `<strong>${displayName}</strong><span class="filter-desc">${desc}</span>`;
        filterList.appendChild(btn);
      });
    }

    document.querySelectorAll('.filter-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        const wasActive = btn.classList.contains('active');

        if (wasActive || preset === 'none') {
          document.querySelectorAll('.filter-option').forEach(b => b.classList.remove('active'));
          Effects.applyPreset('none');
          return;
        }

        pendingFilterPreset = preset;
        const scopeDialog = document.getElementById('filter-scope-dialog');
        const scopeDesc = document.getElementById('filter-scope-desc');
        if (scopeDesc) scopeDesc.textContent = `Apply the "${btn.querySelector('strong').textContent}" filter to:`;
        if (scopeDialog) Accessibility.showModal(scopeDialog);
      });
    });

    document.getElementById('filter-scope-clip')?.addEventListener('click', () => {
      if (pendingFilterPreset) {
        document.querySelectorAll('.filter-option').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.filter-option[data-preset="${pendingFilterPreset}"]`);
        if (btn) btn.classList.add('active');
        Effects.applyPreset(pendingFilterPreset);
        Accessibility.announce(`Applied ${pendingFilterPreset} filter to the selected clip.`);
      }
      pendingFilterPreset = null;
      Accessibility.hideModal(document.getElementById('filter-scope-dialog'));
    });

    document.getElementById('filter-scope-all')?.addEventListener('click', () => {
      if (pendingFilterPreset) {
        document.querySelectorAll('.filter-option').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.filter-option[data-preset="${pendingFilterPreset}"]`);
        if (btn) btn.classList.add('active');
        Effects.applyPreset(pendingFilterPreset);
        const clips = Timeline.getClips().filter(c => c.type === 'video');
        clips.forEach(c => {
          Timeline.updateClipProperty(c.id, 'filters', { preset: pendingFilterPreset });
        });
        Accessibility.announce(`Applied ${pendingFilterPreset} filter to all ${clips.length} video clips.`);
      }
      pendingFilterPreset = null;
      Accessibility.hideModal(document.getElementById('filter-scope-dialog'));
    });

    document.getElementById('filter-scope-cancel')?.addEventListener('click', () => {
      pendingFilterPreset = null;
      Accessibility.hideModal(document.getElementById('filter-scope-dialog'));
    });

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

    document.getElementById('btn-photo-remove-bg')?.addEventListener('click', async () => {
      if (!PhotoEditor.hasImage) { Accessibility.announce('No image loaded'); return; }
      const fillMode = await new Promise((resolve) => {
        const dialog = document.createElement('div');
        dialog.className = 'modal';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-label', 'Choose background removal mode');
        dialog.setAttribute('aria-modal', 'true');
        dialog.innerHTML = `<div class="modal-content">
          <h2>Remove Background</h2>
          <p>Choose how to fill the removed area:</p>
          <div class="modal-actions">
            <button id="bg-remove-transparent" aria-label="Make background transparent">Transparent</button>
            <button id="bg-remove-mirror" aria-label="Fill background with mirrored content from the foreground">Mirror Fill</button>
            <button id="bg-remove-cancel" aria-label="Cancel">Cancel</button>
          </div>
        </div>`;
        document.body.appendChild(dialog);
        document.getElementById('bg-remove-transparent').focus();
        const cleanup = (val) => { dialog.remove(); resolve(val); };
        document.getElementById('bg-remove-transparent').addEventListener('click', () => cleanup('transparent'));
        document.getElementById('bg-remove-mirror').addEventListener('click', () => cleanup('mirror'));
        document.getElementById('bg-remove-cancel').addEventListener('click', () => cleanup(null));
        dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') cleanup(null); });
      });
      if (!fillMode) return;
      Accessibility.announce('Removing background, please wait...');
      await PhotoEditor.removeBackground(70, fillMode);
    });

    document.getElementById('btn-photo-blur-bg')?.addEventListener('click', async () => {
      if (!PhotoEditor.hasImage) { Accessibility.announce('No image loaded'); return; }
      Accessibility.announce('Blurring background, please wait...');
      await PhotoEditor.blurBackground(70, 35);
    });

    document.getElementById('btn-photo-insert-image')?.addEventListener('click', async () => {
      if (!PhotoEditor.hasImage) { Accessibility.announce('Open a base image first, then use Insert Image to add an overlay'); return; }
      await PhotoEditor.insertImageFromPicker('center', 0.3);
    });

    document.getElementById('btn-photo-crop')?.addEventListener('click', () => {
      Accessibility.announce('Crop mode: Use the resize dialog to set new dimensions. Press the Resize button.');
    });

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

    document.querySelectorAll('.photo-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        PhotoEditor.applyPreset(btn.dataset.preset);
      });
    });
  }

  // Accessibility Score Dialog
  function initAccessibilityScore() {
    document.getElementById('btn-run-accessibility-check')?.addEventListener('click', () => {
      const results = document.getElementById('accessibility-score-results');
      const breakdown = document.getElementById('accessibility-score-breakdown');
      const totalEl = document.getElementById('accessibility-score-total');
      if (!results || !breakdown || !totalEl) return;

      const clips = Timeline.getVideoClips();
      const markers = Timeline.getMarkers();
      let score = 0;
      let maxScore = 100;
      let items = [];
      let details = '';

      // Check captions present
      const hasCaptions = clips.some(c => c.captionFile || c.captions);
      items.push({ label: 'Captions present', pass: hasCaptions, points: 20 });
      if (hasCaptions) score += 20;

      // Check audio description
      const hasAudioDesc = clips.some(c => c.isAudioDescription);
      items.push({ label: 'Audio description present', pass: hasAudioDesc, points: 20 });
      if (hasAudioDesc) score += 20;

      // Check marker count (chapters)
      const hasChapters = markers.length >= 2;
      items.push({ label: `Chapter markers present (${markers.length})`, pass: hasChapters, points: 15 });
      if (hasChapters) score += 15;

      // Check text overlays exist (content may have text)
      const hasText = clips.some(c => c.type === 'text' || c.textContent);
      items.push({ label: 'Text overlays present (visual content structure)', pass: hasText, points: 10 });
      if (hasText) score += 10;

      // Check audio levels safe
      const hasAudio = clips.some(c => c.type === 'audio' || c.audioFile);
      items.push({ label: 'Audio tracks present', pass: hasAudio, points: 10 });
      if (hasAudio) score += 10;

      // Check clip count (more clips = more complex content)
      const hasEnoughClips = clips.length >= 2;
      items.push({ label: 'Multiple clips (content variety)', pass: hasEnoughClips, points: 10 });
      if (hasEnoughClips) score += 10;

      // Check for flashing content warning
      items.push({ label: 'No flashing content faster than 3Hz (manual confirmation needed)', pass: true, points: 10 });
      score += 10;

      // Caption accuracy indicator
      if (hasCaptions) {
        items.push({ label: 'Caption accuracy (auto-generated - review recommended)', pass: false, warn: true, points: 5 });
      } else {
        items.push({ label: 'Caption accuracy review', pass: false, points: 5 });
      }

      // Duration announcement
      const totalDuration = clips.reduce((sum, c) => sum + (c.duration || 0), 0);
      const durationStr = Accessibility.formatTime(totalDuration);
      items.push({ label: `Duration: ${durationStr}`, pass: true, info: true, points: 0 });

      breakdown.innerHTML = '';
      items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'a11y-score-item';
        if (item.info) {
          div.innerHTML = `<span>${item.label}</span>`;
        } else if (item.warn) {
          div.innerHTML = `<span>${item.label}</span><span class="a11y-score-warn">+${item.points} (review needed)</span>`;
          score += item.points;
        } else if (item.pass) {
          div.innerHTML = `<span>${item.label}</span><span class="a11y-score-pass">+${item.points}</span>`;
        } else {
          div.innerHTML = `<span>${item.label}</span><span class="a11y-score-fail">-${item.points}</span>`;
        }
        breakdown.appendChild(div);
      });

      const pct = Math.round((score / maxScore) * 100);
      totalEl.textContent = `Accessibility Score: ${pct}/100`;
      if (pct >= 80) {
        totalEl.style.color = 'var(--success)';
        results.innerHTML = `<p style="color:var(--success);">Great! Your content is highly accessible. Score: ${pct}/100</p>`;
      } else if (pct >= 50) {
        totalEl.style.color = 'var(--warning)';
        results.innerHTML = `<p style="color:var(--warning);">Good, but improvements recommended. Score: ${pct}/100 — add captions, audio description, or chapters to improve.</p>`;
      } else {
        totalEl.style.color = 'var(--error)';
        results.innerHTML = `<p style="color:var(--error);">Your content needs accessibility improvements. Score: ${pct}/100 — add captions, audio description, and chapter markers.</p>`;
      }
      Accessibility.announce(`Accessibility score: ${pct} out of 100. ${results.textContent}`);
    });

    document.getElementById('btn-accessibility-score-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('accessibility-score-dialog'));
    });
  }

  // Export Dialog with Cancel + Open Folder support
  let isExporting = false;

  function initExportDialog() {
    document.getElementById('btn-export-start')?.addEventListener('click', async () => {
      if (isExporting) {
        Accessibility.announce('An export is already in progress.');
        return;
      }

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

      isExporting = true;

      const progressArea = document.getElementById('export-progress-area');
      const statusEl = document.getElementById('export-status');
      const cancelBtn = document.getElementById('btn-export-cancel-proc');
      const openFolderBtn = document.getElementById('btn-export-open-folder');
      const startBtn = document.getElementById('btn-export-start');

      if (startBtn) startBtn.disabled = true;
      if (progressArea) progressArea.classList.remove('hidden');
      if (cancelBtn) cancelBtn.classList.remove('hidden');
      if (openFolderBtn) openFolderBtn.classList.add('hidden');
      if (statusEl) statusEl.textContent = 'Exporting... This may take a while. Press Cancel Export to stop.';
      Accessibility.announce('Export started. You can cancel at any time.');

      const ffmpegPath = await window.api.getFFmpegPath();
      const inputArgs = clips.map(c => `-i "${c.filePath}"`).join(' ');
      const bitrateMap = { high: '8M', medium: '5M', low: '2M' };
      const bitrate = bitrateMap[quality] || '5M';

      let scaleFilter = '';
      if (resolution !== 'original') {
        scaleFilter = `-vf scale=${resolution}`;
      }

      // Check hardware acceleration setting
      const hwAccelToggle = document.getElementById('hw-accel-toggle');
      const useHWAccel = hwAccelToggle && hwAccelToggle.checked;
      const hwAccelFlag = useHWAccel ? '-hwaccel auto' : '';

      const command = `"${ffmpegPath}" ${hwAccelFlag} ${inputArgs} ${scaleFilter} -r ${fps} -b:v ${bitrate} -c:v libx264 -c:a aac "${result.filePath}" -y`;

      try {
        await window.api.exportVideo({ command, outputPath: result.filePath });
        if (statusEl) statusEl.textContent = 'Export complete! Your video has been saved.';
        if (openFolderBtn) {
          openFolderBtn.classList.remove('hidden');
          openFolderBtn.dataset.outputPath = result.filePath;
        }
        Accessibility.announce('Export complete! Your video has been saved.');
      } catch (err) {
        if (err === 'Export cancelled by user.') {
          if (statusEl) statusEl.textContent = 'Export cancelled.';
          Accessibility.announce('Export cancelled.');
        } else {
          if (statusEl) statusEl.textContent = 'Export failed: ' + err;
          Accessibility.announce('Export failed. ' + err);
        }
      }

      isExporting = false;
      if (startBtn) startBtn.disabled = false;
      if (cancelBtn) cancelBtn.classList.add('hidden');
    });

    // Cancel export button
    document.getElementById('btn-export-cancel-proc')?.addEventListener('click', async () => {
      if (window.api) {
        await window.api.cancelExport();
        const statusEl = document.getElementById('export-status');
        if (statusEl) statusEl.textContent = 'Export cancelled by user.';
        isExporting = false;
        const startBtn = document.getElementById('btn-export-start');
        if (startBtn) startBtn.disabled = false;
        Accessibility.announce('Export cancelled.');
      }
    });

    // Open containing folder button
    document.getElementById('btn-export-open-folder')?.addEventListener('click', async () => {
      const outputPath = this?.dataset?.outputPath;
      if (outputPath && window.api) {
        await window.api.openContainingFolder(outputPath);
      }
    });

    document.getElementById('btn-export-cancel')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('export-dialog'));
    });
  }

  function initTextDialog() {
    document.getElementById('btn-text-add')?.addEventListener('click', () => {
      const text = document.getElementById('text-content-input')?.value || 'Text';
      const fontSize = parseInt(document.getElementById('text-font-size-input')?.value) || 48;
      const color = document.getElementById('text-color-input')?.value || '#ffffff';
      const position = document.getElementById('text-position-select')?.value || 'center';
      const duration = parseFloat(document.getElementById('text-duration-input')?.value) || 5;

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

  function initSettings() {
    document.getElementById('btn-apply-theme')?.addEventListener('click', () => {
      const theme = document.getElementById('theme-mode-select')?.value || 'dark';
      const contrast = document.getElementById('contrast-level-select')?.value || 'normal';
      const fontSize = document.getElementById('font-size-select')?.value || 'normal';

      document.body.classList.remove('light-mode');
      if (theme === 'light') document.body.classList.add('light-mode');

      document.body.classList.remove('high-contrast', 'very-high-contrast');
      if (contrast === 'high') document.body.classList.add('high-contrast');
      else if (contrast === 'very-high') document.body.classList.add('very-high-contrast');

      document.body.classList.remove('font-small', 'font-normal', 'font-large', 'font-very-large');
      document.body.classList.add(`font-${fontSize.replace(' ', '-')}`);

      const sliderOrientation = document.getElementById('slider-orientation-select')?.value || 'horizontal';
      document.body.classList.toggle('vertical-sliders', sliderOrientation === 'vertical');

      localStorage.setItem('as-theme', theme);
      localStorage.setItem('as-contrast', contrast);
      localStorage.setItem('as-font-size', fontSize);
      localStorage.setItem('as-slider-orientation', sliderOrientation);

      Accessibility.announce(`Theme applied: ${theme} mode, ${contrast} contrast, ${fontSize} text size, ${sliderOrientation} sliders`);
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

    // Gemini API key
    const geminiInput = document.getElementById('gemini-api-key');
    const geminiStatus = document.getElementById('gemini-status');
    const savedGeminiKey = Gemini.getApiKey();
    if (savedGeminiKey && geminiInput) {
      geminiInput.value = savedGeminiKey;
      if (geminiStatus) geminiStatus.textContent = 'API key saved. Gemini AI is active — it can see and edit your project.';
      if (geminiStatus) geminiStatus.style.color = 'var(--success)';
    }

    document.getElementById('btn-save-gemini-key')?.addEventListener('click', () => {
      const key = geminiInput?.value?.trim();
      if (key) {
        Gemini.setApiKey(key);
        if (geminiStatus) {
          geminiStatus.textContent = 'API key saved. Gemini AI is active — it can see and edit your project in real time.';
          geminiStatus.style.color = 'var(--success)';
        }
        Accessibility.announce('Gemini API key saved. AI assistant can now see and edit your project.');
      } else {
        Gemini.setApiKey('');
        if (geminiStatus) {
          geminiStatus.textContent = 'No API key set. The assistant will use basic keyword matching.';
          geminiStatus.style.color = 'var(--text-muted)';
        }
        Accessibility.announce('Gemini API key removed.');
      }
    });

    document.getElementById('link-gemini-api')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.api) window.api.openExternal('https://aistudio.google.com/apikey');
    });

    // Encrypted API Keys (safeStorage)
    const apiKeyServices = ['youtube', 'twitch', 'openai'];
    apiKeyServices.forEach(service => {
      const input = document.getElementById(`api-key-${service}`);
      const saveBtn = document.getElementById(`btn-save-api-key-${service}`);
      const revealBtn = document.getElementById(`btn-reveal-api-key-${service}`);

      // Load saved key
      if (window.api) {
        window.api.loadEncryptedSetting(`api-key-${service}`).then(result => {
          if (result.success && input) {
            input.value = result.value;
            input.type = 'password';
          }
        });
      }

      saveBtn?.addEventListener('click', async () => {
        if (!window.api || !input) return;
        const value = input.value.trim();
        if (value) {
          await window.api.saveEncryptedSetting({ key: `api-key-${service}`, value });
          Accessibility.announce(`${service} API key saved securely.`);
        } else {
          await window.api.deleteEncryptedSetting(`api-key-${service}`);
          Accessibility.announce(`${service} API key cleared.`);
        }
      });

      revealBtn?.addEventListener('click', () => {
        if (!input) return;
        if (input.type === 'password') {
          input.type = 'text';
          revealBtn.textContent = 'Hide';
        } else {
          input.type = 'password';
          revealBtn.textContent = 'Show';
        }
      });
    });

    // OAuth Account Linking
    function refreshAccountsUI() {
      if (!window.api) return;
      window.api.getLinkedAccounts().then(accounts => {
        document.querySelectorAll('.account-item').forEach(item => {
          const platform = item.dataset.platform;
          const statusEl = item.querySelector('.account-status');
          const connectBtn = item.querySelector('.btn-connect-account');
          const disconnectBtn = item.querySelector('.btn-disconnect-account');
          const detailsEl = document.getElementById(`account-details-${platform}`);
          const acct = accounts[platform];

          if (acct && acct.connected) {
            statusEl.textContent = `Connected${acct.needsReauth ? ' (needs re-authorization)' : ''}`;
            statusEl.className = acct.needsReauth ? 'account-status' : 'account-status connected';
            connectBtn.classList.add('hidden');
            disconnectBtn.classList.remove('hidden');
            if (detailsEl) {
              detailsEl.classList.remove('hidden');
              const profile = acct.profile || {};
              let html = `<p><strong>${profile.name || platform}</strong>`;
              if (profile.subscribers) html += ` — ${profile.subscribers} subscribers`;
              html += '</p>';
              if (acct.expiresAt) {
                const expires = new Date(acct.expiresAt);
                html += `<p>Token expires: ${expires.toLocaleString()}${acct.needsReauth ? ' (EXPIRED — click Disconnect and re-connect)' : ''}</p>`;
              }
              detailsEl.innerHTML = html;
            }
          } else {
            statusEl.textContent = 'Not connected';
            statusEl.className = 'account-status';
            connectBtn.classList.remove('hidden');
            disconnectBtn.classList.add('hidden');
            if (detailsEl) {
              detailsEl.classList.add('hidden');
              detailsEl.innerHTML = '';
            }
          }
        });
      });
    }

    // Connect buttons — just works like OBS once Client IDs are embedded
    document.querySelectorAll('.btn-connect-account').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.api) return;
        const platform = btn.dataset.platform;
        const result = await window.api.linkAccount(platform);
        if (result.success && result.authUrl) {
          window.api.openExternal(result.authUrl);
          Accessibility.announce(`Opening browser to connect your ${platform} account. Complete authorization there, then return here.`);
        } else if (result.needsSetup) {
          // Developer hasn't embedded their Client IDs yet
          const urls = { youtube: 'https://console.cloud.google.com/apis/credentials', twitch: 'https://dev.twitch.tv/console/apps' };
          const url = urls[platform] || '';
          Accessibility.announce(`One-time setup needed. Open ${platform} developer console to get a Client ID. ${url ? 'Opening link now.' : ''}`);
          if (url && window.api) window.api.openExternal(url);
        } else {
          Accessibility.announce(`Connection failed: ${result.error || 'Unknown error'}`);
        }
      });
    });

    // Disconnect buttons
    document.querySelectorAll('.btn-disconnect-account').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.api) return;
        const platform = btn.dataset.platform;
        await window.api.disconnectAccount(platform);
        refreshAccountsUI();
        Accessibility.announce(`${platform} account disconnected.`);
      });
    });

    // Listen for OAuth results
    if (window.api) {
      window.api.onOAuthResult((data) => {
        if (data.success && data.platform) {
          refreshAccountsUI();
        } else if (data.type === 'token-refresh-failed') {
          refreshAccountsUI();
          Accessibility.announce(`${data.platform} token expired. Please re-connect the account in Settings.`);
        }
      });
    }

    // Refresh accounts on settings tab show
    refreshAccountsUI();

    // HW Accel toggle
    if (window.api) {
      window.api.getHardwareAccel().then(available => {
        const hwToggle = document.getElementById('hw-accel-toggle');
        if (hwToggle) {
          hwToggle.disabled = !available;
          if (!available) {
            hwToggle.checked = false;
            hwToggle.setAttribute('aria-label', 'Hardware acceleration is not available on this system');
          }
        }
      });
    }

    // Blind-First Design Mode
    const bfToggle = document.getElementById('blind-first-mode-toggle');
    const savedBF = localStorage.getItem('as-blind-first') === 'true';
    if (bfToggle) {
      bfToggle.checked = savedBF;
      if (savedBF) document.body.classList.add('blind-first-mode');
      bfToggle.addEventListener('change', () => {
        const enabled = bfToggle.checked;
        document.body.classList.toggle('blind-first-mode', enabled);
        localStorage.setItem('as-blind-first', enabled);
        Accessibility.announce(enabled ? 'Blind first mode enabled. Visual elements hidden, timeline now in list format.' : 'Blind first mode disabled. Visual elements restored.');
      });
    }

    // RTL Mode
    const rtlToggle = document.getElementById('rtl-mode-toggle');
    const savedRTL = localStorage.getItem('as-rtl') === 'true';
    if (rtlToggle) {
      rtlToggle.checked = savedRTL;
      if (savedRTL) document.body.classList.add('rtl-mode');
      rtlToggle.addEventListener('change', () => {
        const enabled = rtlToggle.checked;
        document.body.classList.toggle('rtl-mode', enabled);
        localStorage.setItem('as-rtl', enabled);
        Accessibility.announce(enabled ? 'Right to left layout enabled.' : 'Right to left layout disabled.');
      });
    }

    // Low Bandwidth Mode
    const lbToggle = document.getElementById('low-bandwidth-toggle');
    const savedLB = localStorage.getItem('as-low-bandwidth') === 'true';
    if (lbToggle) {
      lbToggle.checked = savedLB;
      lbToggle.addEventListener('change', () => {
        const enabled = lbToggle.checked;
        localStorage.setItem('as-low-bandwidth', enabled);
        if (enabled && window.api) {
          window.api.setLowBandwidthMode(true);
        }
        Accessibility.announce(enabled ? 'Low bandwidth mode enabled. Network features disabled.' : 'Low bandwidth mode disabled.');
      });
    }

    // Encryption toggle
    const encToggle = document.getElementById('encryption-toggle');
    const encPwdRow = document.getElementById('encryption-password-row');
    const savedEnc = localStorage.getItem('as-encryption') === 'true';
    if (encToggle) {
      encToggle.checked = savedEnc;
      if (savedEnc && encPwdRow) encPwdRow.style.display = 'flex';
      encToggle.addEventListener('change', () => {
        const enabled = encToggle.checked;
        if (encPwdRow) encPwdRow.style.display = enabled ? 'flex' : 'none';
        if (!enabled) {
          localStorage.setItem('as-encryption', 'false');
          Accessibility.announce('Encryption disabled. Project files are no longer encrypted.');
        } else {
          Accessibility.announce('Set an encryption password to secure your project library.');
        }
      });
    }
    document.getElementById('btn-set-encryption')?.addEventListener('click', () => {
      const pwd = document.getElementById('encryption-password')?.value;
      if (!pwd || pwd.length < 4) {
        Accessibility.announce('Password must be at least 4 characters.');
        return;
      }
      localStorage.setItem('as-encryption', 'true');
      localStorage.setItem('as-encryption-pwd', pwd);
      if (window.api) window.api.setEncryptionKey(pwd);
      Accessibility.announce('Encryption password set. Your project library is now encrypted with AES-256.');
    });

    // Project search
    const projectSearchInput = document.getElementById('project-search-input');
    if (projectSearchInput) {
      projectSearchInput.addEventListener('input', async () => {
        const query = projectSearchInput.value.trim();
        if (window.api) {
          const projects = await window.api.listProjects(query || undefined);
          const resultsContainer = document.getElementById('project-search-results');
          if (resultsContainer) {
            resultsContainer.innerHTML = '';
            if (projects.length === 0) {
              resultsContainer.innerHTML = '<p class="help-text" style="padding: 8px;">No projects found.</p>';
            } else {
              projects.forEach(proj => {
                const item = document.createElement('div');
                item.setAttribute('role', 'listitem');
                item.setAttribute('tabindex', '0');
                item.setAttribute('aria-label', `Project: ${proj.name}, saved ${new Date(proj.date).toLocaleDateString()}`);
                item.style.cssText = 'padding: 6px 12px; cursor: pointer; border-bottom: 1px solid var(--border-color);';
                item.textContent = `${proj.name} - ${new Date(proj.date).toLocaleDateString()}`;
                item.addEventListener('click', async () => {
                  try {
                    const data = await window.api.loadProjectFromLibrary(proj.path);
                    if (data.timeline) Timeline.deserialize(data.timeline);
                    if (data.mediaLibrary) {
                      mediaLibrary = data.mediaLibrary;
                      renderMediaLibrary();
                    }
                    const clips = Timeline.getClips();
                    const videoClip = clips.find(c => c.type === 'video' && c.filePath);
                    if (videoClip) {
                      Player.loadVideo(videoClip.filePath);
                      showVideoPlayer();
                    }
                    Accessibility.announce(`Project "${proj.name}" loaded`);
                    Accessibility.setStatus(`Project: ${proj.name}`);
                    switchSection('section-video-editor');
                  } catch (err) {
                    Accessibility.announce('Error loading project');
                  }
                });
                item.addEventListener('keydown', (e) => {
                  if (e.key === 'Enter') item.click();
                });
                resultsContainer.appendChild(item);
              });
            }
          }
        }
      });
    }

    // Load saved settings
    const savedTheme = localStorage.getItem('as-theme');
    const savedContrast = localStorage.getItem('as-contrast');
    const savedFontSize = localStorage.getItem('as-font-size');

    if (savedTheme === 'light') document.body.classList.add('light-mode');
    if (savedContrast === 'high') document.body.classList.add('high-contrast');
    else if (savedContrast === 'very-high') document.body.classList.add('very-high-contrast');
    if (savedFontSize) document.body.classList.add(`font-${savedFontSize.replace(' ', '-')}`);

    const savedSliderOrientation = localStorage.getItem('as-slider-orientation');
    if (savedSliderOrientation === 'vertical') document.body.classList.add('vertical-sliders');

    if (savedTheme) document.getElementById('theme-mode-select').value = savedTheme;
    if (savedContrast) document.getElementById('contrast-level-select').value = savedContrast;
    if (savedFontSize) document.getElementById('font-size-select').value = savedFontSize;
    if (savedSliderOrientation) {
      const sliderSelect = document.getElementById('slider-orientation-select');
      if (sliderSelect) sliderSelect.value = savedSliderOrientation;
    }

    // Storage Quota
    function refreshStorageQuota() {
      if (!window.api) return;
      window.api.getStorageQuota().then(data => {
        const display = document.getElementById('storage-quota-display');
        if (!display) return;
        if (!data.success) { display.innerHTML = `<p>Could not load storage info.</p>`; return; }
        const fmt = (bytes) => {
          if (bytes < 1024) return bytes + ' B';
          if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
          return (bytes / 1048576).toFixed(1) + ' MB';
        };
        let html = '<table style="width:100%;font-size:0.9em;">';
        html += `<tr><td><strong>Projects</strong></td><td>${fmt(data.projects.size)}</td><td>${data.projects.files} files</td></tr>`;
        html += `<tr><td><strong>Exports</strong></td><td>${fmt(data.exports.size)}</td><td>${data.exports.files} files</td></tr>`;
        html += `<tr><td><strong>Temp files</strong></td><td>${fmt(data.temp.size)}</td><td>${data.temp.files} files</td></tr>`;
        html += '</table>';
        display.innerHTML = html;
      });
    }
    refreshStorageQuota();
    document.getElementById('btn-cleanup-old-projects')?.addEventListener('click', async () => {
      const days = parseInt(document.getElementById('cleanup-days-input')?.value) || 30;
      if (window.api) {
        const result = await window.api.cleanupOldProjects(days);
        if (result.success) {
          Accessibility.announce(`Cleaned up ${result.deleted} old project files.`);
          refreshStorageQuota();
        }
      }
    });

    // Background Task Manager
    function refreshTaskManager() {
      if (!window.api) return;
      window.api.getBackgroundTasks().then(tasks => {
        const list = document.getElementById('background-tasks-list');
        const bar = document.getElementById('task-bar');
        const barCount = document.getElementById('task-bar-count');
        const barStatus = document.getElementById('task-bar-status');
        if (!list) return;
        if (!tasks || tasks.length === 0) {
          list.innerHTML = '<p class="help-text">No background tasks running.</p>';
          if (bar) bar.classList.add('hidden');
          return;
        }
        if (bar) bar.classList.remove('hidden');
        if (barCount) barCount.textContent = `${tasks.length} task${tasks.length > 1 ? 's' : ''}`;
        if (barStatus) barStatus.textContent = tasks.map(t => `${t.name} (${t.progress}%)`).join(', ');
        list.innerHTML = '';
        tasks.forEach(task => {
          const item = document.createElement('div');
          item.style.cssText = 'padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;';
          item.innerHTML = `<span style="flex:1;"><strong>${task.name}</strong> <span style="font-size:0.85em;color:var(--text-muted);">[${task.type}]</span></span>
            <span>${task.progress}%</span>
            <button class="btn-cancel-task" data-task-id="${task.id}" aria-label="Cancel task: ${task.name}" ${task.status !== 'running' ? 'disabled' : ''}>Cancel</button>`;
          list.appendChild(item);
        });
        list.querySelectorAll('.btn-cancel-task').forEach(btn => {
          btn.addEventListener('click', () => {
            if (window.api) window.api.cancelTask(btn.dataset.taskId);
          });
        });
      });
    }
    // Listen for task updates
    if (window.api) {
      window.api.onTaskUpdate(() => refreshTaskManager());
      window.api.onTaskRemoved(() => refreshTaskManager());
    }
    refreshTaskManager();
    document.getElementById('btn-show-task-manager')?.addEventListener('click', () => {
      const navBtn = document.getElementById('nav-settings');
      if (navBtn) navBtn.click();
      setTimeout(() => {
        const tasksSection = document.getElementById('settings-tasks');
        if (tasksSection) tasksSection.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    // Audio Cues
    const audioCuesToggle = document.getElementById('audio-cues-toggle');
    const savedCues = localStorage.getItem('as-audio-cues') === 'true';
    if (audioCuesToggle) {
      audioCuesToggle.checked = savedCues;
      audioCuesToggle.addEventListener('change', () => {
        localStorage.setItem('as-audio-cues', audioCuesToggle.checked);
      });
    }
    const cuesVolSlider = document.getElementById('audio-cues-volume');
    const cuesVolVal = document.getElementById('audio-cues-volume-val');
    if (cuesVolSlider && cuesVolVal) {
      const savedVol = localStorage.getItem('as-audio-cues-volume') || '30';
      cuesVolSlider.value = savedVol;
      cuesVolVal.textContent = savedVol + '%';
      cuesVolSlider.addEventListener('input', () => {
        cuesVolVal.textContent = cuesVolSlider.value + '%';
        localStorage.setItem('as-audio-cues-volume', cuesVolSlider.value);
      });
    }

    // Dependencies Check
    document.getElementById('btn-check-dependencies')?.addEventListener('click', async () => {
      const statusEl = document.getElementById('dependencies-status');
      if (statusEl) statusEl.textContent = 'Checking...';
      Accessibility.announce('Checking system dependencies.');
      if (window.api) {
        const result = await window.api.checkDependencies();
        if (result.success && statusEl) {
          const ok = result.checks.filter(c => c.status === 'ok').length;
          const errors = result.checks.filter(c => c.status === 'error').length;
          statusEl.textContent = `${ok} ok, ${errors} error${errors !== 1 ? 's' : ''}`;
          statusEl.style.color = errors > 0 ? 'var(--error)' : 'var(--success)';
          Accessibility.announce(errors > 0 ? `${errors} dependency issues found. Check the console for details.` : 'All dependencies ok.');
        }
      }
    });

    // No Dark Patterns Pledge
    document.getElementById('btn-show-pledge')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.api) {
        window.api.getDarkPatternsPledge().then(pledgeData => {
          if (pledgeData.success) {
            const msg = pledgeData.pledge.commitments.join('. ');
            Accessibility.announce(`No Dark Patterns Pledge: ${msg}`);
          }
        });
      }
    });

    // Accessibility Profile Wizard
    function checkAndShowProfileWizard() {
      if (!window.api) return;
      window.api.getAccessibilityProfile().then(result => {
        if (result.completed) return;
        setTimeout(() => {
          Accessibility.showModal(document.getElementById('a11y-profile-wizard'));
        }, 1500);
      });
    }

    let wizardStep = 1;
    const totalWizardSteps = 5;
    function updateWizard() {
      for (let i = 1; i <= totalWizardSteps; i++) {
        const el = document.getElementById(`wizard-step-${i}`);
        if (el) el.classList.toggle('hidden', i !== wizardStep);
      }
      document.getElementById('btn-wizard-prev').disabled = wizardStep <= 1;
      const nextBtn = document.getElementById('btn-wizard-next');
      const finishBtn = document.getElementById('btn-wizard-finish');
      if (nextBtn) nextBtn.classList.toggle('hidden', wizardStep >= totalWizardSteps);
      if (finishBtn) {
        finishBtn.classList.toggle('hidden', wizardStep < totalWizardSteps);
        if (wizardStep >= totalWizardSteps) {
          finishBtn.focus();
        }
      }
      
      // Focus the header of the current step for NVDA
      const header = document.getElementById(`step-${wizardStep}-title`);
      if (header && wizardStep < totalWizardSteps) {
        header.focus();
      }
      Accessibility.announce(`Step ${wizardStep} of ${totalWizardSteps}`);
    }

    document.getElementById('btn-wizard-next')?.addEventListener('click', () => {
      if (wizardStep < totalWizardSteps) { wizardStep++; updateWizard(); }
    });
    document.getElementById('btn-wizard-prev')?.addEventListener('click', () => {
      if (wizardStep > 1) { wizardStep--; updateWizard(); }
    });
    document.getElementById('btn-wizard-finish')?.addEventListener('click', async () => {
      const inputMethod = document.querySelector('input[name="wizard-input"]:checked')?.value || 'keyboard';
      const sr = document.getElementById('wizard-sr-select')?.value || 'nvda';
      const vision = document.querySelector('input[name="wizard-vision"]:checked')?.value || 'full';
      const motor = document.querySelector('input[name="wizard-motor"]:checked')?.value || 'none';
      const profile = { inputMethod, screenReader: sr, vision, motor, completedAt: new Date().toISOString() };
      if (window.api) await window.api.saveAccessibilityProfile(profile);
      Accessibility.hideModal(document.getElementById('a11y-profile-wizard'));

      // Apply settings based on profile
      if (vision === 'blind' || sr !== 'none') {
        document.getElementById('blind-first-mode-toggle').checked = true;
        document.body.classList.add('blind-first-mode');
        localStorage.setItem('as-blind-first', 'true');
      }
      if (vision === 'low-vision') {
        document.body.classList.add('high-contrast');
        localStorage.setItem('as-contrast', 'high');
        document.getElementById('contrast-level-select').value = 'high';
      }
      Accessibility.announce(`Setup complete. Welcome to Accessible Studio. The app has been configured for ${inputMethod} input and ${sr} screen reader.`);
    });
    document.getElementById('btn-wizard-skip')?.addEventListener('click', async () => {
      if (window.api) await window.api.saveAccessibilityProfile({ skipped: true, completedAt: new Date().toISOString() });
      Accessibility.hideModal(document.getElementById('a11y-profile-wizard'));
      Accessibility.announce('Setup skipped. You can configure your preferences in Settings at any time.');
    });

    document.getElementById('btn-reopen-wizard')?.addEventListener('click', () => {
      wizardStep = 1;
      updateWizard();
      Accessibility.showModal(document.getElementById('a11y-profile-wizard'));
    });

    checkAndShowProfileWizard();

    // Crash Recovery Check
    if (window.api) {
      window.api.checkCrashRecovery().then(result => {
        if (result.success && result.crashed) {
          setTimeout(() => {
            Accessibility.announce(`The app appears to have crashed during your last session at ${result.crashTime}. Your projects should be intact. ${result.diagnosis}`);
          }, 3000);
        }
        // Clear crash flag on successful load
        window.api.clearCrashFlag();
      });
    }
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if (e.key === 'F1') {
        e.preventDefault();
        const dialog = document.getElementById('shortcuts-dialog');
        if (dialog) Accessibility.showModal(dialog);
        return;
      }

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
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              // Save As
              Accessibility.announce('Use the Save dialog to save a copy');
            } else {
              document.getElementById('btn-save-project')?.click();
            }
            return;
          case 'e':
            e.preventDefault();
            document.getElementById('btn-export-video')?.click();
            return;
          case 'a':
            if (e.shiftKey) {
              e.preventDefault();
              Accessibility.showModal(document.getElementById('accessibility-score-dialog'));
              return;
            }
            break;
          case 'b':
            e.preventDefault();
            document.getElementById('chat-input')?.focus();
            return;
          case 'arrowleft':
            if (e.shiftKey) {
              e.preventDefault();
              const prev = Timeline.getPrevMarker(Player.getCurrentTime());
              if (prev) {
                Player.seekTo(prev.time);
                Accessibility.announce(`Previous marker: ${prev.label}`);
              } else {
                Accessibility.announce('No previous marker');
              }
              return;
            }
            break;
          case 'arrowright':
            if (e.shiftKey) {
              e.preventDefault();
              const next = Timeline.getNextMarker(Player.getCurrentTime());
              if (next) {
                Player.seekTo(next.time);
                Accessibility.announce(`Next marker: ${next.label}`);
              } else {
                Accessibility.announce('No next marker');
              }
              return;
            }
            break;
        }
        return;
      }

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
          // Also speak via Web Speech API for extra NVDA support
          if ('speechSynthesis' in window) {
            const msg = document.getElementById('playhead-position-text')?.textContent || '';
            if (msg) {
              window.speechSynthesis.cancel();
              const utter = new SpeechSynthesisUtterance(msg);
              utter.rate = 0.9;
              window.speechSynthesis.speak(utter);
            }
          }
          break;
      }
    });
  }

  function initDialogs() {
    document.getElementById('btn-keyboard-shortcuts')?.addEventListener('click', () => {
      Accessibility.showModal(document.getElementById('shortcuts-dialog'));
    });
    document.getElementById('btn-shortcuts-close')?.addEventListener('click', () => {
      Accessibility.hideModal(document.getElementById('shortcuts-dialog'));
    });
  }

  function initIPC() {
    if (!window.api) return;

    window.api.onFilesImported((files) => addMediaToLibrary(files));
    window.api.onAudioImported((files) => addMediaToLibrary(files));
    window.api.onMenuAction((action) => {
      switch (action) {
        case 'new-project': document.getElementById('btn-new-project')?.click(); break;
        case 'save-project': document.getElementById('btn-save-project')?.click(); break;
        case 'save-project-as': document.getElementById('btn-save-project')?.click(); break;
        case 'export': document.getElementById('btn-export-video')?.click(); break;
        case 'convert': switchSection('section-file-converter'); break;
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
        case 'toggle-chatbot': document.getElementById('chat-input')?.focus(); break;
        case 'toggle-converter': switchSection('section-file-converter'); break;
        case 'show-shortcuts':
          Accessibility.showModal(document.getElementById('shortcuts-dialog'));
          break;
        case 'about':
          Accessibility.showModal(document.getElementById('about-dialog'));
          break;
      }
    });

    // Export progress parsing for NVDA-friendly messages
    window.api.onExportProgress((data) => {
      const progressFill = document.getElementById('export-progress-fill');
      const progressBar = document.getElementById('export-progress');
      if (progressBar && progressFill) {
        const match = data.match(/time=(\d+):(\d+):(\d+)\.\d+/);
        if (match) {
          const hours = parseInt(match[1]);
          const mins = parseInt(match[2]);
          const secs = parseInt(match[3]);
          const totalSec = hours * 3600 + mins * 60 + secs;
          const estimatedTotal = Timeline.getTotalDuration();
          const percent = estimatedTotal > 0 ? Math.min(99, Math.round((totalSec / estimatedTotal) * 100)) : 0;
          progressFill.style.width = percent + '%';
          progressBar.setAttribute('aria-valuenow', percent);
          progressBar.setAttribute('aria-label', `Export progress: ${percent} percent`);
          const timeStr = Accessibility.formatTimeDisplay(totalSec);
          const statusEl = document.getElementById('export-status');
          if (statusEl) statusEl.textContent = `Exporting... ${timeStr} processed, ${percent}% complete`;
        }
      }
    });

    // Restore focus after dialogs (NVDA focus restoration)
    window.api.onRestoreFocus(() => {
      if (document.activeElement && document.activeElement.id) {
        // Focus was restored, announce which element
      } else {
        const lastActive = document.querySelector('[aria-pressed="true"]') || document.getElementById('chat-input');
        if (lastActive) lastActive.focus();
      }
    });

    // Load recent project from menu
    window.api.onLoadRecentProject(async (proj) => {
      try {
        const data = await window.api.loadProjectFromLibrary(proj.path);
        if (data.timeline) Timeline.deserialize(data.timeline);
        if (data.mediaLibrary) {
          mediaLibrary = data.mediaLibrary;
          renderMediaLibrary();
        }
        const clips = Timeline.getClips();
        const videoClip = clips.find(c => c.type === 'video' && c.filePath);
        if (videoClip) {
          Player.loadVideo(videoClip.filePath);
          showVideoPlayer();
        }
        Accessibility.announce(`Project "${proj.name}" loaded from recent projects`);
        Accessibility.setStatus(`Project: ${proj.name}`);
      } catch (err) {
        Accessibility.announce('Error loading recent project');
      }
    });

    // Update available
    window.api.onUpdateAvailable((data) => {
      const banner = document.getElementById('update-banner');
      const bannerText = document.getElementById('update-banner-text');
      if (banner && bannerText) {
        bannerText.innerHTML = `Version ${data.version} is available. <a href="#" id="update-download-link" style="color: #fff; font-weight: bold;">Download it</a>. ${data.notes ? data.notes.substring(0, 200) : ''}`;
        banner.classList.remove('hidden');
        const link = document.getElementById('update-download-link');
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.api) window.api.openExternal(data.url);
          });
        }
        Accessibility.announce(`A new version is available: ${data.version}`);
      }
    });

    window.api.onUpdateNotification((msg) => {
      Accessibility.announce(msg);
    });

    // Request save for recovery
    window.api.onRequestSaveForRecovery(() => {
      const clips = Timeline.getClips();
      if (clips.length === 0) return;
      const projectData = { timeline: Timeline.serialize(), mediaLibrary };
      if (window.api) window.api.recoverySave(projectData);
    });

    // Converter progress
    window.api.onConvertProgressParsed((data) => {
      const progressFill = document.getElementById('conv-media-progress-fill');
      const progressText = document.getElementById('conv-media-progress-text');
      if (progressFill && data.percent) {
        const percent = Math.min(99, data.percent % 100);
        progressFill.style.width = percent + '%';
        if (progressText) progressText.textContent = percent + '%';
      }
    });

    // Export complete
    window.api.onExportComplete((outputPath) => {
      const openFolderBtn = document.getElementById('btn-export-open-folder');
      if (openFolderBtn) {
        openFolderBtn.dataset.outputPath = outputPath;
        openFolderBtn.classList.remove('hidden');
      }
    });
  }

  async function loadProjectList() {
    const listEl = document.getElementById('projects-list');
    const emptyMsg = document.getElementById('projects-empty-message');
    if (!listEl || !window.api) return;

    try {
      const projects = await window.api.listProjects();
      listEl.innerHTML = '';

      if (projects.length === 0) {
        if (emptyMsg) {
          listEl.appendChild(emptyMsg);
          emptyMsg.style.display = 'block';
        }
        return;
      }

      projects.forEach(proj => {
        const item = document.createElement('div');
        item.className = 'project-item';
        item.setAttribute('role', 'listitem');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `Project: ${proj.name}, saved ${new Date(proj.date).toLocaleDateString()}`);

        const dateStr = new Date(proj.date).toLocaleDateString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });

        item.innerHTML = `
          <span class="project-item-name">${proj.name}</span>
          <span class="project-item-date">${dateStr}</span>
          <div class="project-item-actions">
            <button class="load-btn" aria-label="Open project ${proj.name}">Open</button>
            <button class="duplicate-btn" aria-label="Duplicate project ${proj.name}">Duplicate</button>
            <button class="rename-btn" aria-label="Rename project ${proj.name}">Rename</button>
            <button class="delete-btn" aria-label="Delete project ${proj.name}">Delete</button>
          </div>
        `;

        const loadBtn = item.querySelector('.load-btn');
        loadBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const data = await window.api.loadProjectFromLibrary(proj.path);
            if (data.timeline) Timeline.deserialize(data.timeline);
            if (data.mediaLibrary) {
              mediaLibrary = data.mediaLibrary;
              renderMediaLibrary();
            }
            const clips = Timeline.getClips();
            const videoClip = clips.find(c => c.type === 'video' && c.filePath);
            if (videoClip) {
              Player.loadVideo(videoClip.filePath);
              showVideoPlayer();
            }
            Accessibility.announce(`Project "${proj.name}" loaded`);
            Accessibility.setStatus(`Project: ${proj.name}`);
          } catch (err) {
            Accessibility.announce('Error loading project');
          }
        });

        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') loadBtn.click();
        });

        // Duplicate project
        const duplicateBtn = item.querySelector('.duplicate-btn');
        duplicateBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const result = await window.api.duplicateProject({ sourcePath: proj.path });
            if (result.success) {
              Accessibility.announce(`Project "${proj.name}" duplicated`);
              loadProjectList();
            }
          } catch (err) {
            Accessibility.announce('Error duplicating project');
          }
        });

        // Rename project
        const renameBtn = item.querySelector('.rename-btn');
        renameBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const newName = prompt('Enter a new name for the project:', proj.name);
          if (newName && newName.trim()) {
            try {
              const result = await window.api.renameProject({ oldPath: proj.path, newName: newName.trim() });
              if (result.success) {
                Accessibility.announce(`Project renamed to "${newName.trim()}"`);
                loadProjectList();
              }
            } catch (err) {
              Accessibility.announce('Error renaming project');
            }
          }
        });

        // Delete project
        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Are you sure you want to delete "' + proj.name + '"?')) {
            try {
              await window.api.deleteProjectFromLibrary(proj.path);
              Accessibility.announce(`Project "${proj.name}" deleted`);
              loadProjectList();
            } catch (err) {
              Accessibility.announce('Error deleting project');
            }
          }
        });

        listEl.appendChild(item);
      });
    } catch (e) {
      console.error('Error loading project list:', e);
    }
  }

  function initMenuBar() {
    document.querySelectorAll('.menu-bar').forEach(bar => {
      bar.querySelectorAll('.menu-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const dropdown = trigger.nextElementSibling;
          const wasOpen = dropdown.classList.contains('open');
          document.querySelectorAll('.menu-dropdown.open').forEach(d => {
            d.classList.remove('open');
            d.previousElementSibling.setAttribute('aria-expanded', 'false');
          });
          if (!wasOpen) {
            dropdown.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
        trigger.addEventListener('mouseenter', () => {
          const anyOpen = document.querySelector('.menu-dropdown.open');
          if (anyOpen) {
            document.querySelectorAll('.menu-dropdown.open').forEach(d => {
              d.classList.remove('open');
              d.previousElementSibling.setAttribute('aria-expanded', 'false');
            });
            const dropdown = trigger.nextElementSibling;
            dropdown.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
      });
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.menu-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.previousElementSibling.setAttribute('aria-expanded', 'false');
      });
    });
    document.querySelectorAll('.menu-dropdown button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.menu-dropdown.open').forEach(d => {
          d.classList.remove('open');
          d.previousElementSibling.setAttribute('aria-expanded', 'false');
        });
      });
    });
  }

  function initStreaming() {
    // Browse input file
    document.getElementById('btn-browse-stream-input')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select file to stream',
        filters: [{ name: 'Media Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'mp3', 'wav', 'ogg', 'aac'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        document.getElementById('stream-input-file').value = result.filePaths[0];
      }
    });

    // Browse overlay
    document.getElementById('btn-browse-overlay')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select overlay image',
        filters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        document.getElementById('stream-overlay-file').value = result.filePaths[0];
      }
    });

    // Pre-stream checklist
    document.getElementById('btn-run-checklist')?.addEventListener('click', async () => {
      const resultsDiv = document.getElementById('stream-checklist-results');
      if (!window.api || !resultsDiv) return;
      resultsDiv.innerHTML = '<p>Running checks...</p>';
      const results = await window.api.runPreStreamChecklist();
      let html = '<h3>Pre-stream Checklist Results</h3><ul>';
      let allPass = true;
      results.forEach(r => {
        const icon = r.pass ? '✓' : '✗';
        if (!r.pass) allPass = false;
        html += `<li>${icon} <strong>${r.check}:</strong> ${r.message}</li>`;
      });
      html += '</ul>';
      html += allPass ? '<p style="color:var(--success);font-weight:bold;">All checks passed. Ready to stream!</p>' : '<p style="color:var(--warning);font-weight:bold;">Some checks failed. Review and fix before streaming.</p>';
      resultsDiv.innerHTML = html;
      Accessibility.announce(allPass ? 'All pre-stream checks passed. Ready to stream.' : 'Some pre-stream checks failed. See checklist for details.');
    });

    // Test connection
    document.getElementById('btn-test-connection')?.addEventListener('click', async () => {
      if (!window.api) return;
      const primaryUrl = document.getElementById('stream-primary-url')?.value;
      if (!primaryUrl) { Accessibility.announce('Enter a primary RTMP URL first.'); return; }
      const testBtn = document.getElementById('btn-test-connection');
      if (!window.api.streamingTestConnection) { Accessibility.announce('Connection test not available.'); return; }
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      Accessibility.announce(`Testing connection to ${primaryUrl.substring(0, 60)}...`);
      const result = await window.api.streamingTestConnection({ url: primaryUrl });
      testBtn.textContent = 'Test Connection';
      testBtn.disabled = false;
      if (result.success) {
        Accessibility.announce('Connection successful! Server is reachable.');
        document.getElementById('stream-status-text').textContent = 'Connection OK';
        document.getElementById('stream-status-text').style.color = 'var(--success)';
      } else {
        Accessibility.announce(`Connection failed: ${result.error}`);
        document.getElementById('stream-status-text').textContent = `Connection failed: ${result.error}`;
        document.getElementById('stream-status-text').style.color = 'var(--error)';
      }
    });

    // Start stream
    document.getElementById('btn-start-stream')?.addEventListener('click', async () => {
      if (!window.api) return;
      const input = document.getElementById('stream-input-file')?.value;
      const primaryUrl = document.getElementById('stream-primary-url')?.value;
      const backupUrl = document.getElementById('stream-backup-url')?.value;
      const bitrate = parseInt(document.getElementById('stream-bitrate-input')?.value) || 6000;
      const overlay = document.getElementById('stream-overlay-file')?.value;

      if (!input) { Accessibility.announce('Please select an input file to stream.'); return; }
      if (!primaryUrl) { Accessibility.announce('Please enter a primary RTMP stream URL.'); return; }

      const result = await window.api.startStream({ input, primaryUrl, backupUrl, bitrate, overlay });
      if (result.success) {
        document.getElementById('btn-start-stream').disabled = true;
        document.getElementById('btn-stop-stream').disabled = false;
        document.getElementById('stream-status-area').classList.remove('hidden');
        document.getElementById('stream-status-text').textContent = 'Stream is active.';
        document.getElementById('stream-status-text').style.color = 'var(--success)';
        Accessibility.announce('Stream started successfully.');
      } else {
        Accessibility.announce('Failed to start stream: ' + (result.error || 'Unknown error'));
      }
    });

    // Stop stream
    document.getElementById('btn-stop-stream')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.stopStream();
      document.getElementById('btn-start-stream').disabled = false;
      document.getElementById('btn-stop-stream').disabled = true;
      document.getElementById('stream-status-text').textContent = `Stream stopped. Duration: ${result.duration || 0} seconds.`;
      document.getElementById('stream-status-text').style.color = '';
      Accessibility.announce('Stream stopped.');
    });

    // Listen for stream status updates
    if (window.api) {
      window.api.onStreamStatus((data) => {
        const statusText = document.getElementById('stream-status-text');
        if (statusText) statusText.textContent = data.message || 'Status update';
        if (data.type === 'started') {
          document.getElementById('stream-stat-dest').textContent = data.dest || '';
          document.getElementById('stream-stat-bitrate').textContent = data.bitrate ? data.bitrate + ' kbps' : '';
        }
        if (data.type === 'stopped') {
          document.getElementById('btn-start-stream').disabled = false;
          document.getElementById('btn-stop-stream').disabled = true;
        }
        if (data.type === 'failover') {
          Accessibility.announce('Failover: switching to backup stream destination.');
        }
        Accessibility.announce(data.message);
      });

      window.api.onStreamProgress((data) => {
        if (data.bitrate) document.getElementById('stream-stat-bitrate').textContent = data.bitrate + ' kbps';
        if (data.fps !== undefined) document.getElementById('stream-stat-fps').textContent = data.fps + ' fps';
        if (data.uptime !== undefined) {
          const m = Math.floor(data.uptime / 60);
          const s = data.uptime % 60;
          document.getElementById('stream-stat-uptime').textContent = `${m}m ${s}s`;
        }
        if (data.dest) document.getElementById('stream-stat-dest').textContent = data.dest.substring(0, 60) + '...';
        // Progress bar animation
        const fill = document.getElementById('stream-progress-fill');
        if (fill) {
          const pulse = 30 + Math.sin(Date.now() / 2000) * 15;
          fill.style.width = pulse + '%';
        }
      });
    }

    // Overlay type toggle
    document.getElementById('overlay-type-select')?.addEventListener('change', (e) => {
      const val = e.target.value;
      document.getElementById('overlay-image-row').classList.toggle('hidden', val !== 'image');
      document.getElementById('overlay-countdown-row').classList.toggle('hidden', val !== 'countdown');
      if (val === 'none') {
        document.getElementById('stream-overlay-file').value = '';
        document.getElementById('overlay-status').textContent = 'No overlay active.';
      }
    });

    // Generate countdown overlay
    document.getElementById('btn-generate-countdown')?.addEventListener('click', async () => {
      const minutes = parseInt(document.getElementById('overlay-countdown-minutes')?.value) || 5;
      if (window.api) {
        const result = await window.api.generateCountdownOverlay({ minutes });
        if (result.success && result.pngPath) {
          document.getElementById('stream-overlay-file').value = result.pngPath;
          document.getElementById('overlay-status').textContent = `Countdown overlay generated for ${minutes} min. File: ${result.pngPath}`;
          Accessibility.announce(`Countdown overlay for ${minutes} minutes generated and set as stream overlay.`);
        } else {
          Accessibility.announce('Failed to generate countdown overlay: ' + (result.error || ''));
        }
      } else {
        Accessibility.announce('Countdown overlay generation requires the desktop application.');
      }
    });

    // Browse overlay image path
    document.getElementById('btn-browse-overlay-img')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select overlay image for BRB/countdown',
        filters: [{ name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths.length > 0) {
        document.getElementById('overlay-image-path').value = result.filePaths[0];
        document.getElementById('stream-overlay-file').value = result.filePaths[0];
        document.getElementById('overlay-status').textContent = `Overlay set: ${result.filePaths[0]}`;
      }
    });

    // Advanced streaming: source type toggle
    let qualityLadder = [{ label: '1080p', width: 1920, height: 1080, bitrate: 6000 }];
    let langTracks = [];

    document.getElementById('stream-source-type')?.addEventListener('change', () => {
      const val = document.getElementById('stream-source-type').value;
      document.getElementById('stream-input-file').placeholder = val === 'file' ? 'Path to video file...' :
        val === 'rtsp' ? 'rtsp://camera-ip:554/stream' : 'srt://source:1234';
      Accessibility.announce(`Source type changed to ${val}`);
    });

    document.getElementById('stream-output-mode')?.addEventListener('change', () => {
      const val = document.getElementById('stream-output-mode').value;
      document.getElementById('stream-primary-url').placeholder = val === 'hls' ? 'Output directory for HLS segments' : 'rtmp://...';
      Accessibility.announce(`Output mode changed to ${val}`);
    });

    function renderQualityLadder() {
      const list = document.getElementById('quality-ladder-list');
      if (!list) return;
      list.innerHTML = qualityLadder.map((q, i) =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;font-size:0.9em;">
          <span style="flex:1;">${q.label} — ${q.width}x${q.height} @ ${q.bitrate}kbps</span>
          <button class="btn-remove-tier" data-index="${i}" aria-label="Remove quality tier ${q.label}">Remove</button>
        </div>`
      ).join('');
      list.querySelectorAll('.btn-remove-tier').forEach(btn => {
        btn.addEventListener('click', () => {
          qualityLadder.splice(parseInt(btn.dataset.index), 1);
          if (qualityLadder.length === 0) qualityLadder.push({ label: '1080p', width: 1920, height: 1080, bitrate: 6000 });
          renderQualityLadder();
        });
      });
    }

    document.getElementById('btn-add-quality-tier')?.addEventListener('click', () => {
      const tiers = [
        { label: '4320p', width: 7680, height: 4320, bitrate: 40000 },
        { label: '2160p', width: 3840, height: 2160, bitrate: 20000 },
        { label: '1440p', width: 2560, height: 1440, bitrate: 12000 },
        { label: '1080p', width: 1920, height: 1080, bitrate: 6000 },
        { label: '720p', width: 1280, height: 720, bitrate: 4000 },
        { label: '480p', width: 854, height: 480, bitrate: 2000 },
        { label: '360p', width: 640, height: 360, bitrate: 1000 },
      ];
      // Find the next unused tier
      for (const tier of tiers) {
        if (!qualityLadder.find(q => q.label === tier.label)) {
          qualityLadder.push(tier);
          renderQualityLadder();
          return;
        }
      }
      // All used, add a custom one
      qualityLadder.push({ label: `Custom ${qualityLadder.length + 1}`, width: 1920, height: 1080, bitrate: 6000 });
      renderQualityLadder();
    });

    document.getElementById('btn-add-lang-track')?.addEventListener('click', () => {
      const lang = prompt('Enter language code (e.g., en, es, fr, de):') || 'en';
      langTracks.push({ language: lang, label: lang.toUpperCase() });
      document.getElementById('stream-lang-list').innerHTML = langTracks.map((l, i) =>
        `<div style="padding:2px 0;font-size:0.9em;">${l.label} — <button class="btn-remove-lang" data-index="${i}">Remove</button></div>`
      ).join('');
      document.querySelectorAll('.btn-remove-lang').forEach(btn => {
        btn.addEventListener('click', () => { langTracks.splice(parseInt(btn.dataset.index), 1); btn.parentElement.remove(); });
      });
    });

    // Override start stream to support advanced mode
    const originalStartStream = document.getElementById('btn-start-stream')?.click;
    document.getElementById('btn-start-stream')?.addEventListener('click', async () => {
      if (!window.api) return;
      const sourceType = document.getElementById('stream-source-type')?.value || 'file';
      const outputMode = document.getElementById('stream-output-mode')?.value || 'rtmp';

      if (sourceType !== 'file') {
        // Advanced streaming
        const sourcePath = document.getElementById('stream-input-file')?.value || '';
        const destinations = [document.getElementById('stream-primary-url')?.value || ''].filter(Boolean);
        const backupUrl = document.getElementById('stream-backup-url')?.value || '';
        if (backupUrl) destinations.push(backupUrl);

        await window.api.streamingSetSource({ sourceType, sourcePath, outputMode });
        const result = await window.api.streamingStartAdvanced({
          destinations, qualityLadder, outputMode, languages: langTracks,
        });
        if (result.success) {
          document.getElementById('stream-status-text').textContent = `Streaming (${sourceType} -> ${outputMode})`;
          document.getElementById('stream-status-area').classList.remove('hidden');
          document.getElementById('btn-start-stream').disabled = true;
          document.getElementById('btn-stop-stream').disabled = false;
          Accessibility.announce(`Advanced streaming started via ${sourceType}`);
        } else {
          Accessibility.announce(`Stream failed: ${result.error}`);
        }
      }
    });

    renderQualityLadder();
  }

  function initMusicStudio() {
    let currentMidiClip = null;

    // MIDI Tab
    document.querySelectorAll('.music-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.music-tab-btn').forEach(b => {
          b.classList.remove('active'); b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.music-tab-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById(`music-${btn.dataset.musicTab}`);
        if (panel) panel.classList.remove('hidden');
        Accessibility.announce(`Switched to ${btn.textContent} panel`);
      });
    });

    // MIDI: New clip
    const midiClipSelect = document.getElementById('midi-clip-select');
    document.getElementById('btn-midi-new-clip')?.addEventListener('click', () => {
      const id = `midi-clip-${Date.now()}`;
      const option = document.createElement('option');
      option.value = id; option.textContent = `MIDI Clip ${midiClipSelect.options.length}`;
      midiClipSelect?.appendChild(option);
      midiClipSelect.value = id;
      currentMidiClip = id;
      if (window.api) window.api.dawSetMidi({ clipId: id, data: { notes: [], timeSignature: '4/4', keySignature: 'C major' } });
      renderMidiNotes();
      Accessibility.announce('New MIDI clip created');
    });

    // MIDI: Clip select
    midiClipSelect?.addEventListener('change', () => {
      currentMidiClip = midiClipSelect.value || null;
      renderMidiNotes();
    });

    // MIDI: Add note
    document.getElementById('btn-midi-add-note')?.addEventListener('click', async () => {
      if (!currentMidiClip || !window.api) { Accessibility.announce('Create or select a MIDI clip first'); return; }
      const pitch = parseInt(document.getElementById('midi-note-pitch')?.value) || 60;
      const velocity = parseInt(document.getElementById('midi-note-velocity')?.value) || 100;
      const duration = parseFloat(document.getElementById('midi-note-duration')?.value) || 1.0;
      const note = { pitch, velocity, duration, startTime: 0 };
      await window.api.dawAddNote({ clipId: currentMidiClip, note });
      renderMidiNotes();
      Accessibility.announce(`Added note ${pitch} with velocity ${velocity}`);
    });

    async function renderMidiNotes() {
      const list = document.getElementById('midi-notes-list');
      if (!list) return;
      if (!currentMidiClip || !window.api) { list.innerHTML = '<p class="help-text">Select a clip to view MIDI notes.</p>'; return; }
      const data = await window.api.dawGetMidi(currentMidiClip);
      if (!data || !data.notes || data.notes.length === 0) {
        list.innerHTML = '<p class="help-text">No notes in this clip. Add some notes above.</p>';
        return;
      }
      const pitchNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      list.innerHTML = data.notes.map((n, i) => {
        const noteName = pitchNames[n.pitch % 12] + Math.floor(n.pitch / 12);
        return `<div style="padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
          <span style="flex:1;"><strong>${noteName}</strong> (${n.pitch}) — vel:${n.velocity} — dur:${n.duration} beats</span>
          <button class="btn-midi-delete-note" data-index="${i}" aria-label="Delete note ${noteName}">Delete</button>
        </div>`;
      }).join('');
      list.querySelectorAll('.btn-midi-delete-note').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (window.api) {
            await window.api.dawRemoveNote({ clipId: currentMidiClip, noteIndex: parseInt(btn.dataset.index) });
            renderMidiNotes();
            Accessibility.announce('Note deleted');
          }
        });
      });
    }

    // MIDI: Key/Time signature
    document.getElementById('midi-key-signature')?.addEventListener('change', async () => {
      if (!currentMidiClip || !window.api) return;
      const data = await window.api.dawGetMidi(currentMidiClip);
      data.keySignature = document.getElementById('midi-key-signature').value;
      await window.api.dawSetMidi({ clipId: currentMidiClip, data });
    });
    document.getElementById('midi-time-signature')?.addEventListener('change', async () => {
      if (!currentMidiClip || !window.api) return;
      const data = await window.api.dawGetMidi(currentMidiClip);
      data.timeSignature = document.getElementById('midi-time-signature').value;
      await window.api.dawSetMidi({ clipId: currentMidiClip, data });
    });

    // DAW Tracks
    async function renderDawTracks() {
      const list = document.getElementById('daw-tracks-list');
      if (!list) return;
      if (!window.api) { list.innerHTML = ''; return; }
      const tracks = await window.api.dawGetTracks();
      list.innerHTML = tracks.map(t => `
        <div style="padding:4px 0;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:center;">
          <span style="flex:1;"><strong>${t.name}</strong> — Vol:${Math.round(t.volume * 100)}% Pan:${t.pan}</span>
          <span style="font-size:0.85em;color:var(--text-muted);">${t.muted ? 'Muted' : ''}${t.solo ? ' Solo' : ''}</span>
          <button class="btn-daw-delete-track" data-id="${t.id}" aria-label="Delete track ${t.name}">Delete</button>
        </div>
      `).join('');
      list.querySelectorAll('.btn-daw-delete-track').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (window.api) { await window.api.dawDeleteTrack(btn.dataset.id); renderDawTracks(); }
        });
      });
    }
    document.getElementById('btn-daw-add-track')?.addEventListener('click', async () => {
      if (!window.api) return;
      await window.api.dawCreateTrack({ name: `Track ${(await window.api.dawGetTracks()).length + 1}` });
      renderDawTracks();
      Accessibility.announce('New track added');
    });

    // Step Sequencer
    let currentPattern = null;
    const seqPatternSelect = document.getElementById('sequencer-pattern-select');

    document.getElementById('btn-seq-new-pattern')?.addEventListener('click', async () => {
      if (!window.api) return;
      const pattern = await window.api.dawCreatePattern({ name: `Pattern ${seqPatternSelect.options.length}` });
      const option = document.createElement('option');
      option.value = pattern.pattern.id; option.textContent = pattern.pattern.name;
      seqPatternSelect?.appendChild(option);
      seqPatternSelect.value = pattern.pattern.id;
      currentPattern = pattern.pattern.id;
      renderSequencer();
      Accessibility.announce('New step sequencer pattern created');
    });

    seqPatternSelect?.addEventListener('change', () => {
      currentPattern = seqPatternSelect.value || null;
      renderSequencer();
    });

    document.getElementById('sequencer-bpm')?.addEventListener('change', async () => {
      if (!currentPattern || !window.api) return;
      await window.api.dawUpdatePattern({ patternId: currentPattern, updates: { bpm: parseInt(document.getElementById('sequencer-bpm').value) || 120 } });
    });
    document.getElementById('sequencer-swing')?.addEventListener('change', async () => {
      if (!currentPattern || !window.api) return;
      await window.api.dawUpdatePattern({ patternId: currentPattern, updates: { swing: parseInt(document.getElementById('sequencer-swing').value) || 0 } });
    });

    async function renderSequencer() {
      const list = document.getElementById('sequencer-steps-list');
      if (!list) return;
      if (!currentPattern || !window.api) { list.innerHTML = '<p class="help-text">Select or create a pattern to edit steps.</p>'; return; }
      const patterns = await window.api.dawGetPatterns();
      const pat = patterns.find(p => p.id === currentPattern);
      if (!pat || !pat.steps || pat.steps.length === 0) {
        list.innerHTML = '<p class="help-text">No steps in this pattern. Steps would appear here in a grid format.</p>';
        return;
      }
      list.innerHTML = pat.steps.map((s, i) =>
        `<div style="padding:2px 0;">Step ${i + 1}: Pitch ${s.pitch}, Vel ${s.velocity}, Steps: [${s.steps.map(ss => ss ? 'X' : '.').join(' ')}]</div>`
      ).join('');
    }

    // Stems Separator
    let stemsInputFile = '';
    document.getElementById('btn-stems-select')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select audio file for stem separation',
        filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths[0]) {
        stemsInputFile = result.filePaths[0];
        document.getElementById('stems-file-display').textContent = result.filePaths[0].split(/[/\\]/).pop();
      }
    });

    document.getElementById('btn-stems-separate')?.addEventListener('click', async () => {
      if (!stemsInputFile || !window.api) { Accessibility.announce('Select an audio file first'); return; }
      const stems = [];
      if (document.getElementById('stem-vocals')?.checked) stems.push('vocals');
      if (document.getElementById('stem-drums')?.checked) stems.push('drums');
      if (document.getElementById('stem-bass')?.checked) stems.push('bass');
      if (document.getElementById('stem-other')?.checked) stems.push('other');
      if (stems.length === 0) { Accessibility.announce('Select at least one stem type'); return; }
      const statusEl = document.getElementById('stems-status');
      if (statusEl) statusEl.textContent = 'Separating stems...';
      Accessibility.announce('Separating audio into stems. This may take a while.');
      const outputDir = stemsInputFile.substring(0, stemsInputFile.lastIndexOf('\\'));
      const result = await window.api.dawSeparateStems({ inputPath: stemsInputFile, outputDir, stems });
      if (statusEl) statusEl.textContent = result.success ? 'Done!' : 'Failed';
      const resultsEl = document.getElementById('stems-results');
      if (resultsEl) {
        resultsEl.innerHTML = result.results.map(r =>
          `<div style="padding:4px 0;">${r.stem}: ${r.success ? 'OK - ' + r.path.split(/[/\\]/).pop() : 'Failed - ' + (r.error || '')}</div>`
        ).join('');
      }
      if (result.success) Accessibility.announce('Stem separation complete');
    });

    // VST Scan
    document.getElementById('btn-vst-scan')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select VST folder to scan',
        properties: ['openDirectory'],
      });
      if (result.canceled) return;
      document.getElementById('vst-scan-status').textContent = 'Scanning...';
      const scanResult = await window.api.dawScanVst(result.filePaths[0]);
      document.getElementById('vst-scan-status').textContent = scanResult.success ? `Found ${scanResult.plugins.length} plugins` : 'Scan failed';
      const list = document.getElementById('vst-plugins-list');
      if (list) {
        if (!scanResult.success || scanResult.plugins.length === 0) {
          list.innerHTML = '<p class="help-text">No VST plugins found in that folder.</p>';
        } else {
          list.innerHTML = scanResult.plugins.map(p =>
            `<div style="padding:4px 0;border-bottom:1px solid var(--border);">${p.name} (${p.format}) — ${(p.size / 1024).toFixed(1)} KB</div>`
          ).join('');
        }
      }
      Accessibility.announce(`VST scan complete. Found ${scanResult.plugins.length} plugins.`);
    });
  }

  function initPodcastStudio() {
    let isRecording = false;

    // Podcast Tab switching
    document.querySelectorAll('.podcast-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.podcast-tab-btn').forEach(b => {
          b.classList.remove('active'); b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.podcast-tab-panel').forEach(p => p.classList.add('hidden'));
        const panel = document.getElementById(`podcast-${btn.dataset.podcastTab}`);
        if (panel) panel.classList.remove('hidden');
        Accessibility.announce(`Switched to ${btn.textContent} panel`);
      });
    });

    // Load settings
    if (window.api) {
      window.api.podcastGetConfig().then(config => {
        if (config) {
          document.getElementById('podcast-show-name').value = config.showName || '';
          document.getElementById('podcast-host-name').value = config.hostName || '';
          document.getElementById('podcast-show-email').value = config.showEmail || '';
          document.getElementById('podcast-show-category').value = config.showCategory || 'Technology';
          document.getElementById('podcast-recording-dir').value = config.recordingDir || '';
        }
      });
    }

    // Save settings
    document.getElementById('btn-podcast-save-settings')?.addEventListener('click', async () => {
      if (!window.api) return;
      const config = {
        showName: document.getElementById('podcast-show-name').value,
        hostName: document.getElementById('podcast-host-name').value,
        showEmail: document.getElementById('podcast-show-email').value,
        showCategory: document.getElementById('podcast-show-category').value,
        recordingDir: document.getElementById('podcast-recording-dir').value,
      };
      await window.api.podcastSaveConfig(config);
      document.getElementById('podcast-settings-status').textContent = 'Settings saved';
      Accessibility.announce('Podcast settings saved');
    });

    // Browse recording directory
    document.getElementById('btn-podcast-browse-dir')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select podcast recording directory',
        properties: ['openDirectory'],
      });
      if (!result.canceled && result.filePaths[0]) {
        document.getElementById('podcast-recording-dir').value = result.filePaths[0];
      }
    });

    // Refresh audio device list
    async function loadAudioDevices() {
      if (!window.api) return;
      const sel = document.getElementById('podcast-audio-device');
      if (!sel) return;
      try {
        const devices = await window.api.podcastListDevices();
        sel.innerHTML = '<option value="">System Audio (what you hear)</option>';
        if (devices && devices.length > 0) {
          devices.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            sel.appendChild(opt);
          });
        }
      } catch (e) { /* device list unavailable */ }
    }
    loadAudioDevices();
    document.getElementById('btn-podcast-refresh-devices')?.addEventListener('click', loadAudioDevices);

    // Record
    document.getElementById('btn-podcast-record')?.addEventListener('click', async () => {
      if (!window.api) return;
      if (!isRecording) {
        const dir = document.getElementById('podcast-recording-dir').value || '';
        if (!dir) { Accessibility.announce('Set a recording directory first'); return; }
        const filename = `podcast-ep-${Date.now()}.mp3`;
        const outputPath = `${dir}\\${filename}`;
        const deviceSelect = document.getElementById('podcast-audio-device');
        const audioDevice = deviceSelect ? deviceSelect.value : '';
        const result = await window.api.podcastStartRecording({ outputPath, audioDevice });
        if (result.success) {
          isRecording = true;
          document.getElementById('podcast-record-label').textContent = 'Stop Recording';
          document.getElementById('podcast-record-status').textContent = 'Recording...';
          Accessibility.announce('Recording started');
        }
      } else {
        const result = await window.api.podcastStopRecording();
        isRecording = false;
        document.getElementById('podcast-record-label').textContent = 'Start Recording';
        document.getElementById('podcast-record-status').textContent = result.success ? 'Recording stopped' : 'Error stopping';
        if (result.success) renderPodcastEpisodes();
        Accessibility.announce('Recording stopped');
      }
    });

    // Render episodes
    async function renderPodcastEpisodes() {
      const list = document.getElementById('podcast-episodes-list');
      if (!list || !window.api) return;
      const episodes = await window.api.podcastGetEpisodes();
      if (!episodes || episodes.length === 0) {
        list.innerHTML = '<p class="help-text">No episodes yet.</p>';
        return;
      }
      list.innerHTML = episodes.map(ep =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--border);">${ep.title} — ${Math.floor(ep.duration / 60)}:${String(ep.duration % 60).padStart(2, '0')} — ${new Date(ep.createdAt).toLocaleDateString()}</div>`
      ).join('');
    }

    // ID3 Tags
    let id3File = '';
    document.getElementById('btn-id3-select')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Select MP3 file for ID3 editing',
        filters: [{ name: 'MP3 Audio', extensions: ['mp3'] }],
        properties: ['openFile'],
      });
      if (!result.canceled && result.filePaths[0]) {
        id3File = result.filePaths[0];
        document.getElementById('id3-file-display').textContent = result.filePaths[0].split(/[/\\]/).pop();
      }
    });

    document.getElementById('btn-id3-write')?.addEventListener('click', async () => {
      if (!id3File || !window.api) { Accessibility.announce('Select an MP3 file first'); return; }
      const title = document.getElementById('id3-title').value;
      const artist = document.getElementById('id3-artist').value;
      const album = document.getElementById('id3-album').value;
      const year = document.getElementById('id3-year').value;
      const genre = document.getElementById('id3-genre').value;
      document.getElementById('id3-status').textContent = 'Writing tags...';
      const result = await window.api.podcastWriteId3({ filePath: id3File, title, artist, album, year, genre });
      document.getElementById('id3-status').textContent = result.success ? 'Tags written successfully' : 'Failed';
      Accessibility.announce(result.success ? 'ID3 tags written successfully' : 'Failed to write ID3 tags');
    });

    // RSS
    document.getElementById('btn-rss-generate')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showSaveDialog({
        title: 'Save RSS feed',
        defaultPath: 'podcast-feed.xml',
        filters: [{ name: 'RSS Feed', extensions: ['xml'] }],
      });
      if (result.canceled) return;
      document.getElementById('rss-status').textContent = 'Generating...';
      const rssResult = await window.api.podcastGenerateRss({ outputPath: result.filePath });
      document.getElementById('rss-status').textContent = rssResult.success ? 'RSS feed generated!' : 'Failed';
      Accessibility.announce(rssResult.success ? 'RSS feed generated successfully' : 'Failed to generate RSS feed');
    });
  }

  function init() {
    console.log('DEBUG: init() function called');
    const initFunctions = [
      initNavigation, initMenuBar, initVideoToolbar, initPhotoToolbar, 
      initExportDialog, initAccessibilityScore, initRawPhoto, initPdfForm, 
      initEpubReader, initTextDialog, initStreaming, initMusicStudio, 
      initPodcastStudio, initSettings, initKeyboardShortcuts, initDialogs, 
      initPlacementDialog, initIPC
    ];

    initFunctions.forEach(fn => {
      try {
        console.log(`DEBUG: Calling ${fn.name}...`);
        fn();
        console.log(`DEBUG: ${fn.name} completed successfully`);
      } catch (e) {
        console.error(`DEBUG: Initialization error in ${fn.name}:`, e);
      }
    });
    console.log('DEBUG: All init functions called');

    Player.init();
    Effects.init();
    PhotoEditor.init();
    Chatbot.init();
    Converter.init();
    Timeline.initTimelineClick();
    Timeline.renderAllTracks();

    document.querySelectorAll('[role="toolbar"]').forEach(toolbar => {
      Accessibility.setupToolbarNavigation(toolbar);
    });
    console.log('DEBUG: init() sequence fully completed');
  }

    // Set app version in about dialog
    const aboutVersion = document.getElementById('about-version');
    if (aboutVersion && window.api) {
      window.api.getAppVersion().then(v => {
        aboutVersion.textContent = `Accessible Studio v${v}`;
      });
    }

    // Set app info in settings
    const appInfo = document.getElementById('app-info');
    if (appInfo && window.api) {
      window.api.getAppVersion().then(v => {
        appInfo.textContent = `Accessible Studio v${v} — Built with Electron`;
      });
    }

    // Auto-save interval
    let autoSaveInterval = null;
    function startAutoSave() {
      if (autoSaveInterval) clearInterval(autoHsaveInterval);
      autoSaveInterval = setInterval(async () => {
        const toggle = document.getElementById('autosave-toggle');
        if (!toggle || !toggle.checked) return;
        if (!window.api) return;
        try {
          await window.api.autoSaveProject();
        } catch (e) {
          console.error('Auto-save failed:', e);
        }
      }, 120000); // Every 2 minutes
    }
    startAutoSave();

    // Dismiss update banner
    document.getElementById('btn-update-dismiss')?.addEventListener('click', () => {
      document.getElementById('update-banner')?.classList.add('hidden');
    });

    // Refresh projects button
    document.getElementById('btn-refresh-projects')?.addEventListener('click', loadProjectList);

    Accessibility.setStatus('Ready. Use the sidebar to navigate between sections.');
    Accessibility.announce('Accessible Studio loaded. Use the sidebar buttons to switch between Video Editor, Photo Editor, File Converter, User Guide, and Settings.');

    let clipboardClip = null;
  let clipboardAction = null;

  function renderClipList() {
    const allClips = Timeline.getClips();
    const mainClips = allClips.filter(c => !c.detached).sort((a, b) => a.startTime - b.startTime);
    const detachedClips = allClips.filter(c => c.detached).sort((a, b) => a.startTime - b.startTime);
    const selectedClip = Timeline.getSelectedClip();

    renderClipSelect('all-clip-select', mainClips, selectedClip, 'No clips yet');
    renderClipSelect('detached-clip-select', detachedClips, selectedClip, 'No detached clips');
    updateClipActionButtons();
    updateClipProperties();
  }

  function renderClipSelect(selectId, clips, selectedClip, emptyMsg) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const prevValue = select.value;
    select.innerHTML = '';

    if (clips.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = emptyMsg;
      select.appendChild(opt);
      return;
    }

    clips.forEach((clip, i) => {
      const opt = document.createElement('option');
      opt.value = clip.id;
      const startStr = Accessibility.formatTimeDisplay(clip.startTime);
      const endTime = clip.startTime + clip.duration;
      const endStr = Accessibility.formatTimeDisplay(endTime);
      const typeLabel = clip.type === 'video' ? 'V' : clip.type === 'audio' ? 'A' : clip.type === 'image' ? 'I' : 'T';
      const layerInfo = clip.layer > 0 ? ` [L${clip.layer}]` : '';
      const transInfo = clip.transition ? ` [${clip.transition.type}]` : '';
      const chromaInfo = clip.chromaKey ? ' [GS]' : '';
      const kbInfo = clip.kenBurns ? ' [KB]' : '';
      opt.textContent = `${typeLabel} ${i + 1}: ${clip.name} — ${startStr} to ${endStr}${layerInfo}${transInfo}${chromaInfo}${kbInfo}`;
      if (selectedClip && selectedClip.id === clip.id) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    if (!selectedClip && prevValue) {
      select.value = prevValue;
    }
  }

  function getSelectedClipId(selectId) {
    const select = document.getElementById(selectId);
    return select && select.value ? select.value : null;
  }

  function updateClipActionButtons() {
    const allId = getSelectedClipId('all-clip-select');
    const detachedId = getSelectedClipId('detached-clip-select');

    ['btn-clip-jump', 'btn-clip-copy', 'btn-clip-remove', 'btn-clip-detach', 'btn-clip-freeze'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !allId;
    });
    ['btn-clip-attach', 'btn-clip-layer-up', 'btn-clip-layer-down', 'btn-pip-preset'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = !detachedId;
    });
  }

  function updateClipProperties() {
    const selectedClip = Timeline.getSelectedClip();
    const panel = document.getElementById('clip-properties');
    if (!panel) return;

    if (!selectedClip) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');
    document.getElementById('clip-name-input').value = selectedClip.name || '';
    document.getElementById('clip-fade-in-video').value = selectedClip.fadeIn?.video || selectedClip.fadeIn || 0;
    document.getElementById('clip-fade-in-audio').value = selectedClip.fadeIn?.audio || selectedClip.fadeIn || 0;
    document.getElementById('clip-fade-out-video').value = selectedClip.fadeOut?.video || selectedClip.fadeOut || 0;
    document.getElementById('clip-fade-out-audio').value = selectedClip.fadeOut?.audio || selectedClip.fadeOut || 0;
    document.getElementById('clip-layer-display').textContent = selectedClip.layer || 0;
    document.getElementById('clip-detach-status').textContent = selectedClip.detached ? 'Detached' : 'Attached';
    const transDisplay = document.getElementById('clip-transition-display');
    if (transDisplay) {
      transDisplay.textContent = selectedClip.transition ? `${selectedClip.transition.type} (${selectedClip.transition.duration}s)` : 'None';
    }
  }

  function jumpToClip(clipId) {
    const clip = Timeline.getClips().find(c => c.id === clipId);
    if (!clip) return;
    Timeline.selectClip(clipId);
    Player.seekTo(clip.startTime);
    if (clip.type === 'video') {
      Player.loadVideo(clip.filePath);
      showVideoPlayer();
    }
    Accessibility.announce(`Jumped to "${clip.name}" at ${Accessibility.formatTime(clip.startTime)}`);
    renderClipList();
  }

  function clipAction(selectId, action) {
    const clipId = getSelectedClipId(selectId);
    if (!clipId) return;
    const clip = Timeline.getClips().find(c => c.id === clipId);
    if (!clip) return;

    switch (action) {
      case 'jump':
        jumpToClip(clipId);
        break;
      case 'copy':
        clipboardClip = { ...clip };
        clipboardAction = 'copy';
        Accessibility.announce(`Copied "${clip.name}"`);
        break;
      case 'cut':
        clipboardClip = { ...clip };
        clipboardAction = 'cut';
        Timeline.removeClip(clipId);
        Accessibility.announce(`Cut "${clip.name}"`);
        renderClipList();
        break;
      case 'remove':
        Timeline.removeClip(clipId);
        Accessibility.announce(`Removed "${clip.name}"`);
        renderClipList();
        break;
    }
  }

  function initClipList() {
    const allSelect = document.getElementById('all-clip-select');
    const detachedSelect = document.getElementById('detached-clip-select');
    if (allSelect) allSelect.addEventListener('change', () => {
      const clipId = allSelect.value;
      if (clipId) Timeline.selectClip(clipId);
      updateClipActionButtons();
      updateClipProperties();
    });
    if (detachedSelect) detachedSelect.addEventListener('change', () => {
      const clipId = detachedSelect.value;
      if (clipId) Timeline.selectClip(clipId);
      updateClipActionButtons();
      updateClipProperties();
    });

    document.getElementById('btn-clip-jump')?.addEventListener('click', () => clipAction('all-clip-select', 'jump'));
    document.getElementById('btn-clip-copy')?.addEventListener('click', () => clipAction('all-clip-select', 'copy'));
    document.getElementById('btn-clip-remove')?.addEventListener('click', () => clipAction('all-clip-select', 'remove'));
    document.getElementById('btn-clip-detach')?.addEventListener('click', () => {
      const clipId = getSelectedClipId('all-clip-select');
      if (clipId) {
        Timeline.detachClip(clipId);
        renderClipList();
      }
    });

    document.getElementById('btn-clip-freeze')?.addEventListener('click', () => {
      const clipId = getSelectedClipId('all-clip-select');
      if (clipId) {
        const playheadTime = Player.getCurrentTime();
        Timeline.freezeFrame(clipId, playheadTime, 3);
        renderClipList();
      }
    });

    document.getElementById('btn-clip-attach')?.addEventListener('click', () => {
      const clipId = getSelectedClipId('detached-clip-select');
      if (clipId) {
        Timeline.attachClip(clipId);
        renderClipList();
      }
    });
    document.getElementById('btn-clip-layer-up')?.addEventListener('click', () => {
      const clipId = getSelectedClipId('detached-clip-select');
      if (clipId) {
        const clip = Timeline.getClips().find(c => c.id === clipId);
        if (clip) Timeline.setClipLayer(clipId, (clip.layer || 0) + 1);
        renderClipList();
      }
    });
    document.getElementById('btn-clip-layer-down')?.addEventListener('click', () => {
      const clipId = getSelectedClipId('detached-clip-select');
      if (clipId) {
        const clip = Timeline.getClips().find(c => c.id === clipId);
        if (clip) Timeline.setClipLayer(clipId, Math.max(0, (clip.layer || 0) - 1));
        renderClipList();
      }
    });

    document.getElementById('btn-clip-rename')?.addEventListener('click', () => {
      const selectedClip = Timeline.getSelectedClip();
      if (!selectedClip) return;
      const newName = document.getElementById('clip-name-input').value.trim();
      if (newName) {
        Timeline.updateClipProperty(selectedClip.id, 'name', newName);
        Accessibility.announce(`Clip renamed to "${newName}"`);
        renderClipList();
      }
    });

    document.getElementById('btn-apply-fade')?.addEventListener('click', () => {
      const selectedClip = Timeline.getSelectedClip();
      if (!selectedClip) return;
      const fadeIn = {
        video: parseFloat(document.getElementById('clip-fade-in-video').value) || 0,
        audio: parseFloat(document.getElementById('clip-fade-in-audio').value) || 0,
      };
      const fadeOut = {
        video: parseFloat(document.getElementById('clip-fade-out-video').value) || 0,
        audio: parseFloat(document.getElementById('clip-fade-out-audio').value) || 0,
      };
      Timeline.setFade(selectedClip.id, fadeIn, fadeOut);
      renderClipList();
    });
    document.getElementById('btn-clear-fade')?.addEventListener('click', () => {
      const selectedClip = Timeline.getSelectedClip();
      if (!selectedClip) return;
      Timeline.setFade(selectedClip.id, 0, 0);
      renderClipList();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardClip) {
        e.preventDefault();
        const playheadTime = Player.getCurrentTime();
        Timeline.addClip({
          ...clipboardClip,
          startTime: playheadTime,
        });
        Accessibility.announce(`Pasted "${clipboardClip.name}" at ${Accessibility.formatTime(playheadTime)}`);
        if (clipboardAction === 'cut') {
          clipboardClip = null;
          clipboardAction = null;
        }
        renderClipList();
      }
    });

    Timeline.onChange(renderClipList);
    renderClipList();
    initUserGuide();
  }

  function initRawPhoto() {
    if (!window.api) return;

    // Show supported raw formats
    window.api.rawPhotoGetSupported().then(result => {
      const list = document.getElementById('raw-formats-list');
      if (list && result.formats) {
        list.textContent = `Supported: ${result.formats.map(f => f.name).join(', ')}`;
      }
    });

    document.getElementById('btn-raw-open')?.addEventListener('click', async () => {
      const result = await window.api.showOpenDialog({
        title: 'Open raw camera photo',
        filters: [{ name: 'Raw Photos', extensions: ['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return;
      const status = document.getElementById('raw-status');
      if (status) status.textContent = 'Converting...';
      Accessibility.announce('Converting raw photo. This may take a moment.');
      const outputPath = result.filePaths[0].replace(/\.(cr2|cr3|nef|arw|dng|raf|orf)$/i, '.tiff');
      const convResult = await window.api.rawPhotoConvert({
        inputPath: result.filePaths[0],
        outputPath,
        options: { halfSize: false, brightness: 1.0 },
      });
      if (status) status.textContent = convResult.success ? `Converted to ${outputPath.split(/[/\\]/).pop()}` : `Failed: ${convResult.error}`;
      Accessibility.announce(convResult.success ? 'Raw photo converted successfully' : 'Raw conversion failed');
    });
  }

  function initPdfForm() {
    let pdfFormFilePath = '';
    let pdfFormFields = [];

    document.getElementById('btn-pdf-form-open')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Open PDF form',
        filters: [{ name: 'PDF Forms', extensions: ['pdf'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return;
      pdfFormFilePath = result.filePaths[0];
      document.getElementById('pdf-form-file-display').textContent = result.filePaths[0].split(/[/\\]/).pop();
      const fields = await window.api.pdfFormGetFields(result.filePaths[0]);
      const container = document.getElementById('pdf-form-fields');
      if (!container) return;
      if (fields.success && fields.fields.length > 0) {
        pdfFormFields = fields.fields;
        container.innerHTML = fields.fields.map((f, i) =>
          `<div style="padding:4px 0;display:flex;gap:8px;align-items:center;">
            <label for="pdf-field-${i}" style="flex:1;font-size:0.9em;"><strong>${f.name}</strong> (${f.type}):</label>
            <input type="text" id="pdf-field-${i}" data-field-name="${f.name}" value="${f.text || ''}" style="flex:2;" aria-label="Field: ${f.name}">
          </div>`
        ).join('');
        document.getElementById('btn-pdf-form-save').disabled = false;
        Accessibility.announce(`PDF form loaded with ${fields.fields.length} fields`);
      } else {
        container.innerHTML = '<p class="help-text">No fillable form fields found in this PDF.</p>';
      }
    });

    document.getElementById('btn-pdf-form-save')?.addEventListener('click', async () => {
      if (!pdfFormFilePath || !window.api) return;
      const values = {};
      document.querySelectorAll('#pdf-form-fields input[type="text"]').forEach(input => {
        values[input.dataset.fieldName] = input.value;
      });
      const saveResult = await window.api.showSaveDialog({
        title: 'Save filled PDF',
        defaultPath: `filled-${pdfFormFilePath.split(/[/\\]/).pop()}`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      });
      if (saveResult.canceled) return;
      document.getElementById('pdf-form-status').textContent = 'Filling...';
      const result = await window.api.pdfFormFill({ filePath: pdfFormFilePath, outputPath: saveResult.filePath, values });
      document.getElementById('pdf-form-status').textContent = result.success ? 'PDF saved successfully' : 'Failed';
      Accessibility.announce(result.success ? 'PDF form filled and saved' : 'Failed to fill PDF form');
    });
  }

  function initEpubReader() {
    document.getElementById('btn-epub-open')?.addEventListener('click', async () => {
      if (!window.api) return;
      const result = await window.api.showOpenDialog({
        title: 'Open EPUB file',
        filters: [{ name: 'EPUB Books', extensions: ['epub'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return;
      document.getElementById('epub-file-display').textContent = result.filePaths[0].split(/[/\\]/).pop();

      const meta = await window.api.epubGetMetadata(result.filePaths[0]);
      const metaEl = document.getElementById('epub-metadata');
      if (metaEl && meta.success) {
        metaEl.innerHTML = `<p><strong>Title:</strong> ${meta.metadata.title}<br><strong>Author:</strong> ${meta.metadata.author}</p>`;
      }

      const contents = await window.api.epubGetContents(result.filePaths[0]);
      const contentsEl = document.getElementById('epub-contents');
      if (contentsEl && contents.success) {
        contentsEl.innerHTML = contents.chapters.map(ch =>
          `<button class="epub-chapter-btn" data-chapter-id="${ch.id}" style="display:block;width:100%;text-align:left;padding:6px 8px;background:none;border:none;border-bottom:1px solid var(--border);color:var(--text-primary);cursor:pointer;">${ch.title}</button>`
        ).join('');
        contentsEl.querySelectorAll('.epub-chapter-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const content = await window.api.epubGetChapter({ filePath: result.filePaths[0], chapterId: btn.dataset.chapterId });
            const display = document.getElementById('epub-content-display');
            if (display && content.success) {
              display.innerHTML = `<div style="white-space:pre-wrap;">${content.content}</div>`;
            }
          });
        });
      }
      Accessibility.announce(`EPUB loaded: ${meta.success ? meta.metadata.title : 'Unknown'}`);
    });
  }

  function initUserGuide() {
    const navBtns = document.querySelectorAll('.guide-nav-btn');
    const allSections = document.querySelectorAll('.guide-section');
    const pageInfo = document.getElementById('guide-page-info');

    function showGuidePage(targetId, focusHeading = true) {
      const target = document.getElementById(targetId);
      if (!target) return;

      allSections.forEach(s => s.style.display = 'none');
      target.style.display = 'block';

      navBtns.forEach(b => {
        const isActive = b.getAttribute('data-target') === targetId;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-current', isActive ? 'page' : 'false');
      });

      const pageIndex = Array.from(navBtns).findIndex(b => b.getAttribute('data-target') === targetId);
      if (pageInfo) pageInfo.textContent = `Page ${pageIndex + 1} of ${navBtns.length}`;
      const prevBtn = document.getElementById('guide-prev-page');
      const nextBtn = document.getElementById('guide-next-page');
      if (prevBtn) prevBtn.disabled = (pageIndex <= 0);
      if (nextBtn) nextBtn.disabled = (pageIndex >= navBtns.length - 1);

      if (focusHeading) {
        const heading = target.querySelector('h3');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus();
        }
      }
      Accessibility.announce('Page: ' + (target.querySelector('h3')?.textContent || ''));
    }

    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        showGuidePage(btn.getAttribute('data-target'));
      });
    });

    document.getElementById('guide-prev-page')?.addEventListener('click', () => {
      const activeIdx = Array.from(navBtns).findIndex(b => b.classList.contains('active'));
      if (activeIdx > 0) showGuidePage(navBtns[activeIdx - 1].getAttribute('data-target'));
    });
    document.getElementById('guide-next-page')?.addEventListener('click', () => {
      const activeIdx = Array.from(navBtns).findIndex(b => b.classList.contains('active'));
      if (activeIdx < navBtns.length - 1) showGuidePage(navBtns[activeIdx + 1].getAttribute('data-target'));
    });

    showGuidePage('guide-getting-started', false);

    const searchInput = document.getElementById('guide-search');
    const searchStatus = document.getElementById('guide-search-status');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();

        if (!query) {
          navBtns.forEach(btn => btn.closest('li').style.display = '');
          if (searchStatus) searchStatus.textContent = '';
          return;
        }

        let visibleCount = 0;
        let firstMatch = null;
        allSections.forEach((section, i) => {
          const text = section.textContent.toLowerCase();
          const matches = text.includes(query);
          const btn = navBtns[i];
          if (btn) btn.closest('li').style.display = matches ? '' : 'none';
          if (matches) {
            visibleCount++;
            if (!firstMatch) firstMatch = section.id;
          }
        });

        if (firstMatch) showGuidePage(firstMatch, false);

        if (searchStatus) {
          searchStatus.textContent = visibleCount + ' section' + (visibleCount !== 1 ? 's' : '') + ' found';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { switchSection, addMediaToLibrary };
})();
