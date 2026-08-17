/**
 * File Converter Module
 * Handles video, audio, image, and document conversion via FFmpeg
 */

const Converter = (() => {
  let mediaInputPath = '';
  let imageInputPath = '';
  let docInputPath = '';

  /** Quality to FFmpeg args mapping */
  const qualityMap = {
    high: ['-crf', '18', '-preset', 'slow'],
    medium: ['-crf', '23', '-preset', 'medium'],
    low: ['-crf', '28', '-preset', 'fast'],
  };

  /** Format to FFmpeg args */
  function getFormatArgs(format, quality = 'medium') {
    const qArgs = qualityMap[quality] || qualityMap.medium;
    const formatArgs = {
      mp4: ['-c:v', 'libx264', '-c:a', 'aac', ...qArgs],
      avi: ['-c:v', 'mpeg4', '-c:a', 'mp3', '-q:v', '5'],
      mkv: ['-c:v', 'libx264', '-c:a', 'aac', ...qArgs],
      mov: ['-c:v', 'libx264', '-c:a', 'aac', ...qArgs],
      webm: ['-c:v', 'libvpx-vp9', '-c:a', 'libopus', '-b:v', '2M'],
      wmv: ['-c:v', 'wmv2', '-c:a', 'wmav2'],
      flv: ['-c:v', 'flv1', '-c:a', 'mp3'],
      mpeg: ['-c:v', 'mpeg2video', '-c:a', 'mp2'],
      m4v: ['-c:v', 'libx264', '-c:a', 'aac', ...qArgs],
      ts: ['-c:v', 'libx264', '-c:a', 'aac', '-f', 'mpegts'],
      gif: ['-vf', 'fps=10,scale=480:-1:flags=lanczos', '-loop', '0'],
      mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
      wav: ['-vn', '-c:a', 'pcm_s16le'],
      ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
      flac: ['-vn', '-c:a', 'flac'],
      aac: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
      wma: ['-vn', '-c:a', 'wmav2'],
      m4a: ['-vn', '-c:a', 'aac', '-f', 'ipod'],
      opus: ['-vn', '-c:a', 'libopus', '-b:a', '128k'],
    };
    return formatArgs[format] || [];
  }

  /** Convert media file */
  async function convertMedia(inputPath, outputFormat, quality = 'medium') {
    if (!inputPath) {
      Accessibility.announce('No file selected for conversion');
      return;
    }
    if (!window.api) {
      Accessibility.announce('File conversion requires the desktop application.');
      const statusEl = document.getElementById('conv-media-status');
      if (statusEl) statusEl.textContent = 'Error: Conversion requires the desktop application with FFmpeg installed.';
      return;
    }

    const outputPath = inputPath.replace(/\.[^.]+$/, `.${outputFormat}`);
    const args = getFormatArgs(outputFormat, quality);

    // Show progress
    const progressEl = document.getElementById('conv-media-progress');
    const statusEl = document.getElementById('conv-media-status');
    if (progressEl) {
      progressEl.classList.remove('hidden');
      progressEl.setAttribute('aria-valuenow', '50');
    }
    if (statusEl) statusEl.textContent = 'Converting... Please wait.';

    Accessibility.announce('Conversion started. Please wait.');

    try {
      // Try to ask for save location
      let savePath = outputPath;
      if (window.api && window.api.showSaveDialog) {
        const result = await window.api.showSaveDialog({
          title: 'Save Converted File',
          defaultPath: outputPath,
          filters: [{ name: `${outputFormat.toUpperCase()} File`, extensions: [outputFormat] }],
        });
        if (result.canceled) {
          if (statusEl) statusEl.textContent = 'Conversion cancelled.';
          if (progressEl) progressEl.classList.add('hidden');
          return;
        }
        savePath = result.filePath;
      }

      await window.api.convertFile({
        inputPath,
        outputPath: savePath,
        args,
      });

      if (progressEl) {
        progressEl.setAttribute('aria-valuenow', '100');
        const fill = progressEl.querySelector('div');
        if (fill) fill.style.width = '100%';
      }
      if (statusEl) statusEl.textContent = `Conversion complete! Saved to: ${savePath}`;
      Accessibility.announce(`Conversion complete. File saved as ${outputFormat.toUpperCase()}`);
    } catch (err) {
      if (statusEl) statusEl.textContent = `Error: ${err}`;
      Accessibility.announce('Conversion failed. ' + err);
    }
  }

  /** Init */
  function init() {
    // Media file selection
    const selectMediaBtn = document.getElementById('btn-conv-select-media');
    const mediaDisplay = document.getElementById('conv-media-file-display');
    const convertMediaBtn = document.getElementById('btn-conv-media-start');

    if (selectMediaBtn) {
      selectMediaBtn.addEventListener('click', async () => {
        if (!window.api) return;
        const result = await window.api.showOpenDialog({
          title: 'Select Video or Audio File',
          filters: [
            { name: 'Media Files', extensions: ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          mediaInputPath = result.filePaths[0];
          const fileName = mediaInputPath.split(/[\\/]/).pop();
          if (mediaDisplay) mediaDisplay.textContent = `Selected: ${fileName}`;
          if (convertMediaBtn) convertMediaBtn.disabled = false;
          Accessibility.announce(`Selected file: ${fileName}`);
        }
      });
    }

    if (convertMediaBtn) {
      convertMediaBtn.addEventListener('click', () => {
        const format = document.getElementById('conv-media-format')?.value || 'mp4';
        const quality = document.getElementById('conv-media-quality')?.value || 'medium';
        convertMedia(mediaInputPath, format, quality);
      });
    }

    // Image file selection
    const selectImageBtn = document.getElementById('btn-conv-select-image');
    const imageDisplay = document.getElementById('conv-image-file-display');
    const convertImageBtn = document.getElementById('btn-conv-image-start');

    if (selectImageBtn) {
      selectImageBtn.addEventListener('click', async () => {
        if (!window.api) return;
        const result = await window.api.showOpenDialog({
          title: 'Select Image File',
          filters: [
            { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tiff', 'svg'] },
          ],
          properties: ['openFile'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          imageInputPath = result.filePaths[0];
          const fileName = imageInputPath.split(/[\\/]/).pop();
          if (imageDisplay) imageDisplay.textContent = `Selected: ${fileName}`;
          if (convertImageBtn) convertImageBtn.disabled = false;
          Accessibility.announce(`Selected image: ${fileName}`);
        }
      });
    }

    if (convertImageBtn) {
      convertImageBtn.addEventListener('click', async () => {
        const format = document.getElementById('conv-image-format')?.value || 'png';
        const statusEl = document.getElementById('conv-image-status');
        if (!imageInputPath) return;

        if (statusEl) statusEl.textContent = 'Converting image...';
        Accessibility.announce('Converting image. Please wait.');

        try {
          let savePath = imageInputPath.replace(/\.[^.]+$/, `.${format}`);
          if (window.api && window.api.showSaveDialog) {
            const result = await window.api.showSaveDialog({
              title: 'Save Converted Image',
              defaultPath: savePath,
              filters: [{ name: `${format.toUpperCase()} File`, extensions: [format] }],
            });
            if (result.canceled) {
              if (statusEl) statusEl.textContent = 'Cancelled.';
              return;
            }
            savePath = result.filePath;
          }

          // Use FFmpeg for image conversion too
          await window.api.convertFile({
            inputPath: imageInputPath,
            outputPath: savePath,
            args: [],
          });

          if (statusEl) statusEl.textContent = `Image converted! Saved to: ${savePath}`;
          Accessibility.announce(`Image converted to ${format.toUpperCase()}`);
        } catch (err) {
          if (statusEl) statusEl.textContent = `Error: ${err}`;
          Accessibility.announce('Image conversion failed');
        }
      });
    }

    // Document file selection
    const selectDocBtn = document.getElementById('btn-conv-select-doc');
    const docDisplay = document.getElementById('conv-doc-file-display');
    const convertDocBtn = document.getElementById('btn-conv-doc-start');

    if (selectDocBtn) {
      selectDocBtn.addEventListener('click', async () => {
        if (!window.api) return;
        const result = await window.api.showOpenDialog({
          title: 'Select Document',
          filters: [
            { name: 'Documents', extensions: ['pdf', 'docx', 'doc', 'txt', 'html', 'htm', 'rtf'] },
            { name: 'All Files', extensions: ['*'] },
          ],
          properties: ['openFile'],
        });
        if (!result.canceled && result.filePaths.length > 0) {
          docInputPath = result.filePaths[0];
          const fileName = docInputPath.split(/[\\/]/).pop();
          if (docDisplay) docDisplay.textContent = `Selected: ${fileName}`;
          if (convertDocBtn) convertDocBtn.disabled = false;
          Accessibility.announce(`Selected document: ${fileName}`);
        }
      });
    }

    if (convertDocBtn) {
      convertDocBtn.addEventListener('click', async () => {
        const format = document.getElementById('conv-doc-format')?.value || 'pdf';
        const statusEl = document.getElementById('conv-doc-status');
        if (!docInputPath) return;
        if (!window.api) {
          if (statusEl) statusEl.textContent = 'Error: Document conversion requires the desktop application.';
          Accessibility.announce('Document conversion requires the desktop application.');
          return;
        }

        const inputExt = docInputPath.split('.').pop().toLowerCase();

        if (statusEl) statusEl.textContent = `Converting ${inputExt.toUpperCase()} to ${format.toUpperCase()}... Please wait.`;
        Accessibility.announce('Converting document. Please wait.');

        try {
          let savePath = docInputPath.replace(/\.[^.]+$/, `.${format}`);
          const result = await window.api.showSaveDialog({
            title: 'Save Converted Document',
            defaultPath: savePath,
            filters: [{ name: `${format.toUpperCase()} File`, extensions: [format] }],
          });
          if (result.canceled) {
            if (statusEl) statusEl.textContent = 'Cancelled.';
            return;
          }
          savePath = result.filePath;

          await window.api.convertDocument({
            inputPath: docInputPath,
            outputPath: savePath,
            inputExt,
            outputFormat: format,
          });

          if (statusEl) statusEl.textContent = `Document converted! Saved to: ${savePath}`;
          Accessibility.announce(`Document converted to ${format.toUpperCase()}`);
        } catch (err) {
          if (statusEl) statusEl.textContent = `Error: ${err.message || err}`;
          Accessibility.announce('Document conversion failed. ' + (err.message || err));
        }
      });
    }
  }

  return { convertMedia, init };
})();
