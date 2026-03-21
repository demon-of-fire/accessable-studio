/**
 * Photo Editor Module
 */

const PhotoEditor = (() => {
  const canvas = document.getElementById('photo-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const noPhotoMsg = document.getElementById('no-photo-message');

  let originalImage = null;
  let currentImage = null;
  let undoStack = [];
  let redoStack = [];
  let adjustments = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0 };
  let rotation = 0;
  let flipH = false;
  let flipV = false;
  let currentFilePath = '';

  /** Load an image file */
  function loadImage(filePath) {
    currentFilePath = filePath;
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      canvas.width = img.width;
      canvas.height = img.height;
      resetAdjustments();
      drawImage();
      if (noPhotoMsg) noPhotoMsg.style.display = 'none';
      Accessibility.announce(`Image loaded: ${filePath.split(/[\\/]/).pop()}, ${img.width} by ${img.height} pixels`);
      Accessibility.setStatus(`Image loaded: ${img.width}x${img.height}`);

      // Set resize defaults
      const resizeW = document.getElementById('resize-width');
      const resizeH = document.getElementById('resize-height');
      if (resizeW) resizeW.value = img.width;
      if (resizeH) resizeH.value = img.height;
    };
    img.onerror = () => {
      Accessibility.announce('Error loading image file');
    };
    // For Electron, use file:// protocol
    img.src = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
  }

  /** Draw image with current transformations */
  function drawImage() {
    if (!originalImage || !ctx) return;

    const img = originalImage;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // Apply transformations
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

    // Apply CSS-like filters
    let filterStr = '';
    filterStr += `brightness(${100 + adjustments.brightness}%) `;
    filterStr += `contrast(${100 + adjustments.contrast}%) `;
    filterStr += `saturate(${100 + adjustments.saturation}%) `;
    ctx.filter = filterStr.trim();

    const drawW = rotation % 180 === 0 ? canvas.width : canvas.height;
    const drawH = rotation % 180 === 0 ? canvas.height : canvas.width;
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();
  }

  /** Save state for undo */
  function saveState() {
    undoStack.push({
      adjustments: { ...adjustments },
      rotation,
      flipH,
      flipV,
      width: canvas.width,
      height: canvas.height,
    });
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
  }

  /** Undo */
  function undo() {
    if (undoStack.length === 0) {
      Accessibility.announce('Nothing to undo');
      return;
    }
    redoStack.push({
      adjustments: { ...adjustments },
      rotation, flipH, flipV,
      width: canvas.width, height: canvas.height,
    });
    const state = undoStack.pop();
    adjustments = state.adjustments;
    rotation = state.rotation;
    flipH = state.flipH;
    flipV = state.flipV;
    canvas.width = state.width;
    canvas.height = state.height;
    drawImage();
    updateAdjustmentSliders();
    Accessibility.announce('Undone');
  }

  /** Redo */
  function redo() {
    if (redoStack.length === 0) {
      Accessibility.announce('Nothing to redo');
      return;
    }
    undoStack.push({
      adjustments: { ...adjustments },
      rotation, flipH, flipV,
      width: canvas.width, height: canvas.height,
    });
    const state = redoStack.pop();
    adjustments = state.adjustments;
    rotation = state.rotation;
    flipH = state.flipH;
    flipV = state.flipV;
    canvas.width = state.width;
    canvas.height = state.height;
    drawImage();
    updateAdjustmentSliders();
    Accessibility.announce('Redone');
  }

  /** Rotate left (counter-clockwise) */
  function rotateLeft() {
    if (!originalImage) return;
    saveState();
    rotation = (rotation - 90 + 360) % 360;
    if (rotation % 180 !== 0) {
      canvas.width = originalImage.height;
      canvas.height = originalImage.width;
    } else {
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
    }
    drawImage();
    Accessibility.announce(`Rotated left. Rotation: ${rotation} degrees`);
  }

  /** Rotate right (clockwise) */
  function rotateRight() {
    if (!originalImage) return;
    saveState();
    rotation = (rotation + 90) % 360;
    if (rotation % 180 !== 0) {
      canvas.width = originalImage.height;
      canvas.height = originalImage.width;
    } else {
      canvas.width = originalImage.width;
      canvas.height = originalImage.height;
    }
    drawImage();
    Accessibility.announce(`Rotated right. Rotation: ${rotation} degrees`);
  }

  /** Flip horizontal */
  function flipHorizontal() {
    if (!originalImage) return;
    saveState();
    flipH = !flipH;
    drawImage();
    Accessibility.announce(flipH ? 'Flipped horizontally' : 'Horizontal flip removed');
  }

  /** Flip vertical */
  function flipVertical() {
    if (!originalImage) return;
    saveState();
    flipV = !flipV;
    drawImage();
    Accessibility.announce(flipV ? 'Flipped vertically' : 'Vertical flip removed');
  }

  /** Resize image */
  function resize(newWidth, newHeight) {
    if (!originalImage) return;
    saveState();
    canvas.width = newWidth;
    canvas.height = newHeight;
    drawImage();
    Accessibility.announce(`Image resized to ${newWidth} by ${newHeight} pixels`);
  }

  /** Set adjustment */
  function setAdjustment(name, value) {
    if (name in adjustments) {
      adjustments[name] = parseInt(value);
      drawImage();
    }
  }

  /** Apply preset */
  function applyPreset(presetName) {
    saveState();
    switch (presetName) {
      case 'none':
        resetAdjustments();
        break;
      case 'grayscale':
        adjustments = { brightness: 0, contrast: 10, saturation: -100, sharpness: 0 };
        break;
      case 'sepia':
        adjustments = { brightness: 10, contrast: -10, saturation: -60, sharpness: 0 };
        break;
      case 'vintage':
        adjustments = { brightness: 15, contrast: -15, saturation: -30, sharpness: 0 };
        break;
      case 'warm':
        adjustments = { brightness: 10, contrast: 5, saturation: 15, sharpness: 0 };
        break;
      case 'cool':
        adjustments = { brightness: 0, contrast: 5, saturation: -10, sharpness: 0 };
        break;
      case 'vivid':
        adjustments = { brightness: 5, contrast: 20, saturation: 50, sharpness: 10 };
        break;
      case 'noir':
        adjustments = { brightness: -5, contrast: 40, saturation: -100, sharpness: 5 };
        break;
    }
    drawImage();
    updateAdjustmentSliders();
    Accessibility.announce(`Applied ${presetName} preset`);
  }

  /** Reset adjustments */
  function resetAdjustments() {
    adjustments = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0 };
    rotation = 0;
    flipH = false;
    flipV = false;
    updateAdjustmentSliders();
  }

  /** Update slider UIs */
  function updateAdjustmentSliders() {
    for (const [name, value] of Object.entries(adjustments)) {
      const slider = document.getElementById(`photo-${name}`);
      const display = document.getElementById(`photo-${name}-val`);
      if (slider) {
        slider.value = value;
        slider.setAttribute('aria-valuetext', String(value));
      }
      if (display) display.textContent = value;
    }
  }

  /** Save image */
  async function saveImage(filePath, format = 'png') {
    if (!canvas) return;
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      bmp: 'image/bmp',
    };
    const mime = mimeTypes[format] || 'image/png';

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          // In Electron, we'd write this via IPC
          resolve(reader.result);
        };
        reader.readAsArrayBuffer(blob);
      }, mime, 0.95);
    });
  }

  /** Init */
  function init() {
    // Adjustment sliders
    ['brightness', 'contrast', 'saturation', 'sharpness'].forEach(name => {
      const slider = document.getElementById(`photo-${name}`);
      if (slider) {
        slider.addEventListener('input', () => {
          setAdjustment(name, slider.value);
          const display = document.getElementById(`photo-${name}-val`);
          if (display) display.textContent = slider.value;
          slider.setAttribute('aria-valuetext', slider.value);
        });
      }
    });
  }

  return {
    loadImage,
    undo,
    redo,
    rotateLeft,
    rotateRight,
    flipHorizontal,
    flipVertical,
    resize,
    setAdjustment,
    applyPreset,
    resetAdjustments,
    saveImage,
    init,
    get hasImage() { return !!originalImage; },
    get currentPath() { return currentFilePath; },
  };
})();
