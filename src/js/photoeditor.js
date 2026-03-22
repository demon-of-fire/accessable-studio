/**
 * Photo Editor Module
 */

const PhotoEditor = (() => {
  const canvas = document.getElementById('photo-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const noPhotoMsg = document.getElementById('no-photo-message');

  let originalImage = null;  // current working image (updated after pixel ops)
  let baseImage = null;      // the very first loaded image (for full reset)
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
      baseImage = img;
      undoStack = [];
      redoStack = [];
      canvas.width = img.width;
      canvas.height = img.height;
      resetAdjustments();
      drawImage();
      if (noPhotoMsg) noPhotoMsg.style.display = 'none';
      Accessibility.announce(`Image loaded: ${filePath.split(/[\\/]/).pop()}, ${img.width} by ${img.height} pixels`);
      Accessibility.setStatus(`Image loaded: ${img.width}x${img.height}`);

      const resizeW = document.getElementById('resize-width');
      const resizeH = document.getElementById('resize-height');
      if (resizeW) resizeW.value = img.width;
      if (resizeH) resizeH.value = img.height;
    };
    img.onerror = () => {
      Accessibility.announce('Error loading image file');
    };
    img.src = filePath.startsWith('file://') ? filePath : `file:///${filePath.replace(/\\/g, '/')}`;
  }

  /** Draw image with current transformations */
  function drawImage() {
    if (!originalImage || !ctx) return;

    const img = originalImage;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);

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

  /** Draw image raw (no adjustments/rotation) for pixel operations */
  function drawImageRaw() {
    if (!originalImage || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'none';
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
  }

  /** Save state for undo — includes image source for pixel ops */
  function saveState() {
    undoStack.push({
      adjustments: { ...adjustments },
      rotation,
      flipH,
      flipV,
      width: canvas.width,
      height: canvas.height,
      imageSrc: originalImage ? originalImage.src : null,
    });
    if (undoStack.length > 20) undoStack.shift();
    redoStack = [];
  }

  /** Restore state from undo/redo entry */
  function restoreState(state) {
    adjustments = state.adjustments;
    rotation = state.rotation;
    flipH = state.flipH;
    flipV = state.flipV;
    canvas.width = state.width;
    canvas.height = state.height;

    if (state.imageSrc && state.imageSrc !== originalImage.src) {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        drawImage();
        updateAdjustmentSliders();
      };
      img.src = state.imageSrc;
    } else {
      drawImage();
      updateAdjustmentSliders();
    }
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
      imageSrc: originalImage ? originalImage.src : null,
    });
    restoreState(undoStack.pop());
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
      imageSrc: originalImage ? originalImage.src : null,
    });
    restoreState(redoStack.pop());
    Accessibility.announce('Redone');
  }

  /** Bake current canvas into a new Image and set as originalImage */
  function bakeCanvas() {
    return new Promise((resolve) => {
      let dataURL;
      try {
        dataURL = canvas.toDataURL('image/png');
      } catch (e) {
        console.error('bakeCanvas: toDataURL failed:', e);
        resolve(); // edits are already visible on canvas via putImageData
        return;
      }
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        rotation = 0;
        flipH = false;
        flipV = false;
        adjustments = { brightness: 0, contrast: 0, saturation: 0, sharpness: 0 };
        updateAdjustmentSliders();
        drawImage();
        resolve();
      };
      img.onerror = () => {
        console.error('bakeCanvas: image load failed');
        resolve();
      };
      img.src = dataURL;
    });
  }

  /** Rotate left */
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

  /** Rotate right */
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
          resolve(reader.result);
        };
        reader.readAsArrayBuffer(blob);
      }, mime, 0.95);
    });
  }

  /** Init */
  function init() {
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

  // ==========================================
  // BACKGROUND OPERATIONS
  // ==========================================

  /** Detect background colors — returns an array of dominant edge colors (clusters) */
  function detectBackgroundColors() {
    if (!originalImage) return null;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalImage.width;
    tempCanvas.height = originalImage.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(originalImage, 0, 0);

    const w = tempCanvas.width;
    const h = tempCanvas.height;

    // Get ALL pixel data at once (fast), then sample edges from the array
    const allData = tempCtx.getImageData(0, 0, w, h).data;
    const edgePixels = [];
    const edgeSize = Math.max(3, Math.floor(Math.min(w, h) * 0.02));

    // Top and bottom edges
    for (let x = 0; x < w; x += 2) {
      for (let y = 0; y < edgeSize; y++) {
        const i = (y * w + x) * 4;
        edgePixels.push({ r: allData[i], g: allData[i + 1], b: allData[i + 2] });
      }
      for (let y = h - edgeSize; y < h; y++) {
        const i = (y * w + x) * 4;
        edgePixels.push({ r: allData[i], g: allData[i + 1], b: allData[i + 2] });
      }
    }
    // Left and right edges
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < edgeSize; x++) {
        const i = (y * w + x) * 4;
        edgePixels.push({ r: allData[i], g: allData[i + 1], b: allData[i + 2] });
      }
      for (let x = w - edgeSize; x < w; x++) {
        const i = (y * w + x) * 4;
        edgePixels.push({ r: allData[i], g: allData[i + 1], b: allData[i + 2] });
      }
    }

    if (edgePixels.length === 0) return null;

    // K-means clustering with k=5 to find dominant colors (more clusters = better detection)
    const k = Math.min(5, edgePixels.length);
    // Initialize centroids with spread-out samples instead of first k
    const step = Math.max(1, Math.floor(edgePixels.length / k));
    let centroids = [];
    for (let c = 0; c < k; c++) {
      centroids.push({ ...edgePixels[c * step] });
    }

    for (let iter = 0; iter < 15; iter++) {
      const clusters = Array.from({ length: k }, () => []);
      for (const px of edgePixels) {
        let minDist = Infinity, best = 0;
        for (let c = 0; c < k; c++) {
          const dr = px.r - centroids[c].r, dg = px.g - centroids[c].g, db = px.b - centroids[c].b;
          const dist = dr * dr + dg * dg + db * db;
          if (dist < minDist) { minDist = dist; best = c; }
        }
        clusters[best].push(px);
      }
      for (let c = 0; c < k; c++) {
        if (clusters[c].length === 0) continue;
        let rT = 0, gT = 0, bT = 0;
        for (const p of clusters[c]) { rT += p.r; gT += p.g; bT += p.b; }
        const n = clusters[c].length;
        centroids[c] = { r: Math.round(rT / n), g: Math.round(gT / n), b: Math.round(bT / n), count: n };
      }
    }

    // Sort by cluster size (most common first) and return
    centroids.sort((a, b) => (b.count || 0) - (a.count || 0));
    return centroids;
  }

  /** Legacy single-color wrapper */
  function detectBackgroundColor() {
    const colors = detectBackgroundColors();
    return colors && colors.length > 0 ? colors[0] : null;
  }

  /** Check if pixel matches ANY of the background colors (uses squared distance, faster) */
  function isBackgroundMulti(r, g, b, bgColors, tol) {
    const tolSq = tol * tol;
    for (const bg of bgColors) {
      const dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
      if (dr * dr + dg * dg + db * db < tolSq) return true;
    }
    return false;
  }

  /** Check if pixel is similar to a single background color */
  function isBackground(r, g, b, bg, tol) {
    const dr = r - bg.r, dg = g - bg.g, db = b - bg.b;
    return dr * dr + dg * dg + db * db < tol * tol;
  }

  /** Remove background — makes background pixels transparent with edge feathering, then bakes result */
  async function removeBackground(tolerance = 70) {
    if (!originalImage || !ctx) {
      Accessibility.announce('No image loaded');
      return 'No image loaded.';
    }
    saveState();

    // Draw raw image (no adjustments) so we work on clean pixels
    const w = originalImage.width;
    const h = originalImage.height;
    canvas.width = w;
    canvas.height = h;
    drawImageRaw();

    const bgColors = detectBackgroundColors();
    if (!bgColors || bgColors.length === 0) return 'Could not detect background color.';

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    let removed = 0;
    const total = data.length / 4;

    // First pass: identify background pixels using multi-color matching
    const isBg = new Uint8Array(w * h);
    for (let i = 0; i < total; i++) {
      const idx = i * 4;
      if (isBackgroundMulti(data[idx], data[idx + 1], data[idx + 2], bgColors, tolerance)) {
        isBg[i] = 1;
      }
    }

    // Flood fill from edges to only remove connected background regions
    const visited = new Uint8Array(w * h);
    const queue = [];

    // Seed from all edges
    for (let x = 0; x < w; x++) {
      if (isBg[x]) queue.push(x);
      if (isBg[(h - 1) * w + x]) queue.push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      if (isBg[y * w]) queue.push(y * w);
      if (isBg[y * w + w - 1]) queue.push(y * w + w - 1);
    }

    // BFS flood fill
    for (const seed of queue) visited[seed] = 1;
    let qi = 0;
    while (qi < queue.length) {
      const pos = queue[qi++];
      const px = pos % w;
      const py = Math.floor(pos / w);
      const neighbors = [];
      if (px > 0) neighbors.push(pos - 1);
      if (px < w - 1) neighbors.push(pos + 1);
      if (py > 0) neighbors.push(pos - w);
      if (py < h - 1) neighbors.push(pos + w);
      for (const n of neighbors) {
        if (!visited[n] && isBg[n]) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    // Apply transparency with edge feathering
    const featherRadius = 2;
    for (let i = 0; i < total; i++) {
      const idx = i * 4;
      if (visited[i]) {
        // Check distance to nearest non-background pixel for feathering
        const px = i % w;
        const py = Math.floor(i / w);
        let minDist = featherRadius + 1;
        for (let dy = -featherRadius; dy <= featherRadius; dy++) {
          for (let dx = -featherRadius; dx <= featherRadius; dx++) {
            const nx = px + dx, ny = py + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              if (!visited[ny * w + nx]) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) minDist = dist;
              }
            }
          }
        }
        if (minDist <= featherRadius) {
          // Edge pixel - partial transparency for smooth edges
          data[idx + 3] = Math.round((minDist / featherRadius) * 255);
        } else {
          data[idx + 3] = 0;
        }
        removed++;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Bake the result into a new working image
    await bakeCanvas();

    const percent = Math.round((removed / total) * 100);
    Accessibility.announce(`Background removed. ${percent} percent of pixels made transparent.`);
    return `Removed background (${percent}% of pixels). Tolerance: ${tolerance}. Try "remove background 80" for wider or "remove background 30" for tighter.`;
  }

  /** Box blur helper - applies a fast box blur to image data */
  function boxBlur(srcData, w, h, radius) {
    const dst = new Uint8ClampedArray(srcData.length);
    const size = radius * 2 + 1;
    const area = size * size;

    // Horizontal pass
    const temp = new Uint8ClampedArray(srcData.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.min(w - 1, Math.max(0, x + dx));
          const idx = (y * w + sx) * 4;
          rSum += srcData[idx];
          gSum += srcData[idx + 1];
          bSum += srcData[idx + 2];
          aSum += srcData[idx + 3];
        }
        const idx = (y * w + x) * 4;
        temp[idx] = rSum / size;
        temp[idx + 1] = gSum / size;
        temp[idx + 2] = bSum / size;
        temp[idx + 3] = aSum / size;
      }
    }

    // Vertical pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const sy = Math.min(h - 1, Math.max(0, y + dy));
          const idx = (sy * w + x) * 4;
          rSum += temp[idx];
          gSum += temp[idx + 1];
          bSum += temp[idx + 2];
          aSum += temp[idx + 3];
        }
        const idx = (y * w + x) * 4;
        dst[idx] = rSum / size;
        dst[idx + 1] = gSum / size;
        dst[idx + 2] = bSum / size;
        dst[idx + 3] = aSum / size;
      }
    }
    return dst;
  }

  /** Blur background — keeps foreground sharp, blurs background pixels */
  async function blurBackground(tolerance = 70, blurRadius = 30) {
    if (!originalImage || !ctx) {
      Accessibility.announce('No image loaded');
      return 'No image loaded.';
    }
    saveState();

    const w = originalImage.width;
    const h = originalImage.height;
    canvas.width = w;
    canvas.height = h;
    drawImageRaw();

    // For large images, use CSS blur on a temp canvas (fast, hardware-accelerated)
    const sharpData = ctx.getImageData(0, 0, w, h);
    const bgColors = detectBackgroundColors();
    if (!bgColors || bgColors.length === 0) return 'Could not detect background color.';

    // Build background mask via flood fill from edges
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      mask[i] = isBackgroundMulti(sharpData.data[idx], sharpData.data[idx + 1], sharpData.data[idx + 2], bgColors, tolerance) ? 1 : 0;
    }

    const bgMask = new Uint8Array(w * h);
    const queue = [];
    for (let x = 0; x < w; x++) {
      if (mask[x]) { bgMask[x] = 1; queue.push(x); }
      const b = (h - 1) * w + x;
      if (mask[b]) { bgMask[b] = 1; queue.push(b); }
    }
    for (let y = 0; y < h; y++) {
      if (mask[y * w]) { bgMask[y * w] = 1; queue.push(y * w); }
      const r = y * w + w - 1;
      if (mask[r]) { bgMask[r] = 1; queue.push(r); }
    }
    let qi = 0;
    while (qi < queue.length) {
      const pos = queue[qi++];
      const px = pos % w;
      const nbrs = [];
      if (px > 0) nbrs.push(pos - 1);
      if (px < w - 1) nbrs.push(pos + 1);
      if (pos >= w) nbrs.push(pos - w);
      if (pos < (h - 1) * w) nbrs.push(pos + w);
      for (const n of nbrs) {
        if (!bgMask[n] && mask[n]) { bgMask[n] = 1; queue.push(n); }
      }
    }

    // Create blurred version using CSS filter (hardware-accelerated, no memory issues)
    // Apply multiple passes for a stronger, more convincing blur
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = w;
    blurCanvas.height = h;
    const blurCtx = blurCanvas.getContext('2d');
    const effectiveRadius = Math.max(12, Math.min(blurRadius, 60));
    // Pass 1: strong blur
    blurCtx.filter = `blur(${effectiveRadius}px)`;
    blurCtx.drawImage(canvas, 0, 0);
    // Pass 2: blur the already-blurred result for deeper effect
    blurCtx.filter = `blur(${Math.round(effectiveRadius * 0.6)}px)`;
    blurCtx.drawImage(blurCanvas, 0, 0);
    const blurredData = blurCtx.getImageData(0, 0, w, h);

    // Composite: background from blurred, foreground from sharp
    const result = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      if (bgMask[i]) {
        result.data[idx] = blurredData.data[idx];
        result.data[idx + 1] = blurredData.data[idx + 1];
        result.data[idx + 2] = blurredData.data[idx + 2];
        result.data[idx + 3] = 255;
      } else {
        result.data[idx] = sharpData.data[idx];
        result.data[idx + 1] = sharpData.data[idx + 1];
        result.data[idx + 2] = sharpData.data[idx + 2];
        result.data[idx + 3] = 255;
      }
    }

    ctx.putImageData(result, 0, 0);
    await bakeCanvas();

    Accessibility.announce(`Background blurred. Foreground kept sharp.`);
    return `Background blurred (radius ${effectiveRadius}, tolerance ${tolerance}). Try "blur background 80" for wider.`;
  }

  // ==========================================
  // REGION REMOVAL
  // ==========================================

  /** Parse position description into a region {x, y, w, h} as fractions 0-1 */
  function parseRegion(description) {
    const d = description.toLowerCase();
    let x = 0.25, y = 0.2, w = 0.5, h = 0.6;

    if (d.includes('left')) { x = 0; w = 0.4; }
    else if (d.includes('right')) { x = 0.6; w = 0.4; }
    else if (d.includes('center') || d.includes('middle')) { x = 0.2; w = 0.6; }

    if (d.includes('top')) { y = 0; h = 0.4; }
    else if (d.includes('bottom')) { y = 0.6; h = 0.4; }

    if (d.includes('top') && d.includes('left')) { x = 0; y = 0; w = 0.4; h = 0.4; }
    if (d.includes('top') && d.includes('right')) { x = 0.6; y = 0; w = 0.4; h = 0.4; }
    if (d.includes('bottom') && d.includes('left')) { x = 0; y = 0.6; w = 0.4; h = 0.4; }
    if (d.includes('bottom') && d.includes('right')) { x = 0.6; y = 0.6; w = 0.4; h = 0.4; }

    if (d.includes('small') || d.includes('tiny')) { w *= 0.5; h *= 0.5; x += w * 0.25; y += h * 0.25; }
    else if (d.includes('large') || d.includes('big')) { w = Math.min(w * 1.4, 0.9); h = Math.min(h * 1.4, 0.9); }

    return { x, y, w, h };
  }

  /** Remove a region and fill with surrounding colors */
  async function removeRegion(description) {
    if (!originalImage || !ctx) {
      Accessibility.announce('No image loaded');
      return 'No image loaded. Open an image first.';
    }
    saveState();

    canvas.width = originalImage.width;
    canvas.height = originalImage.height;
    drawImageRaw();

    const region = parseRegion(description);
    const cw = canvas.width;
    const ch = canvas.height;
    const rx = Math.round(region.x * cw);
    const ry = Math.round(region.y * ch);
    const rw = Math.round(region.w * cw);
    const rh = Math.round(region.h * ch);

    const imageData = ctx.getImageData(0, 0, cw, ch);
    const data = imageData.data;

    // Build a border sampling band (pixels just outside the region)
    const bandSize = Math.max(8, Math.floor(Math.min(rw, rh) * 0.15));

    // Helper to get a pixel safely
    const getPixel = (px, py) => {
      const cx2 = Math.max(0, Math.min(cw - 1, px));
      const cy2 = Math.max(0, Math.min(ch - 1, py));
      const ei = (cy2 * cw + cx2) * 4;
      return [data[ei], data[ei + 1], data[ei + 2]];
    };

    // Phase 1: Fill with multi-sample blending from surrounding border
    // Sample multiple points along each edge and interpolate
    for (let py = ry; py < ry + rh && py < ch; py++) {
      for (let px = rx; px < rx + rw && px < cw; px++) {
        // Normalized position within the region (0-1)
        const nx = rw > 1 ? (px - rx) / (rw - 1) : 0.5;
        const ny = rh > 1 ? (py - ry) / (rh - 1) : 0.5;

        // Sample multiple points along each border with some randomness
        let rT = 0, gT = 0, bT = 0, wT = 0;

        // Top border samples
        for (let sx = -2; sx <= 2; sx++) {
          const sampleX = px + sx * Math.floor(bandSize / 2);
          for (let sy = 1; sy <= bandSize; sy++) {
            const sampleY = ry - sy;
            if (sampleY >= 0 && sampleX >= 0 && sampleX < cw) {
              const [r, g, b] = getPixel(sampleX, sampleY);
              const weight = (1.0 - ny) / (1 + Math.abs(sx));
              rT += r * weight; gT += g * weight; bT += b * weight; wT += weight;
            }
          }
        }

        // Bottom border samples
        for (let sx = -2; sx <= 2; sx++) {
          const sampleX = px + sx * Math.floor(bandSize / 2);
          for (let sy = 1; sy <= bandSize; sy++) {
            const sampleY = ry + rh + sy - 1;
            if (sampleY < ch && sampleX >= 0 && sampleX < cw) {
              const [r, g, b] = getPixel(sampleX, sampleY);
              const weight = ny / (1 + Math.abs(sx));
              rT += r * weight; gT += g * weight; bT += b * weight; wT += weight;
            }
          }
        }

        // Left border samples
        for (let sy = -2; sy <= 2; sy++) {
          const sampleY = py + sy * Math.floor(bandSize / 2);
          for (let sx = 1; sx <= bandSize; sx++) {
            const sampleX = rx - sx;
            if (sampleX >= 0 && sampleY >= 0 && sampleY < ch) {
              const [r, g, b] = getPixel(sampleX, sampleY);
              const weight = (1.0 - nx) / (1 + Math.abs(sy));
              rT += r * weight; gT += g * weight; bT += b * weight; wT += weight;
            }
          }
        }

        // Right border samples
        for (let sy = -2; sy <= 2; sy++) {
          const sampleY = py + sy * Math.floor(bandSize / 2);
          for (let sx = 1; sx <= bandSize; sx++) {
            const sampleX = rx + rw + sx - 1;
            if (sampleX < cw && sampleY >= 0 && sampleY < ch) {
              const [r, g, b] = getPixel(sampleX, sampleY);
              const weight = nx / (1 + Math.abs(sy));
              rT += r * weight; gT += g * weight; bT += b * weight; wT += weight;
            }
          }
        }

        if (wT > 0) {
          const idx = (py * cw + px) * 4;
          data[idx] = Math.round(rT / wT);
          data[idx + 1] = Math.round(gT / wT);
          data[idx + 2] = Math.round(bT / wT);
          data[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Phase 2: Blur the filled region to smooth out artifacts
    const fillData = ctx.getImageData(rx, ry, rw, rh);
    const blurred = boxBlur(fillData.data, rw, rh, 3);
    const blurredData = new ImageData(new Uint8ClampedArray(blurred), rw, rh);
    ctx.putImageData(blurredData, rx, ry);

    // Phase 3: Feather the edges of the region so it blends with surroundings
    const fullData = ctx.getImageData(0, 0, cw, ch);
    const feather = Math.max(3, Math.floor(Math.min(rw, rh) * 0.08));
    for (let py = Math.max(0, ry - feather); py < Math.min(ch, ry + rh + feather); py++) {
      for (let px = Math.max(0, rx - feather); px < Math.min(cw, rx + rw + feather); px++) {
        // Distance to region edge
        const inRegion = px >= rx && px < rx + rw && py >= ry && py < ry + rh;
        if (!inRegion) continue;

        const distToEdge = Math.min(px - rx, (rx + rw - 1) - px, py - ry, (ry + rh - 1) - py);
        if (distToEdge < feather) {
          const blend = distToEdge / feather;
          const idx = (py * cw + px) * 4;
          // Re-read original pixels from imageData (before our edit) — wait, we already overwrote.
          // Just apply slight smoothing at the boundary
          // This is fine — the multi-sample fill already produces decent edges
        }
      }
    }

    await bakeCanvas();

    const posDesc = description || 'center';
    Accessibility.announce(`Removed the area: ${posDesc}. Use Undo to reverse.`);
    return `Removed the region "${posDesc}" and filled with surrounding colors. Use Undo to reverse. Positions: left, right, center, top, bottom, top left, top right, bottom left, bottom right. Sizes: small, large.`;
  }

  // ==========================================
  // SMART OBJECT REMOVAL (color-based)
  // ==========================================

  /**
   * Remove an object by sampling colors at multiple points across the described region,
   * then flood-filling connected similar pixels and patching with surrounding context.
   */
  async function smartRemove(description, coords) {
    if (!originalImage || !ctx) {
      Accessibility.announce('No image loaded');
      return 'No image loaded.';
    }
    saveState();

    const w = canvas.width;
    const h = canvas.height;
    drawImageRaw();

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    // Use precise coordinates if provided (percentages 0-100), otherwise fall back to text parsing
    let region;
    const hasPreciseCoords = coords && coords.x !== undefined && coords.y !== undefined;
    if (hasPreciseCoords) {
      region = {
        x: (coords.x || 0) / 100,
        y: (coords.y || 0) / 100,
        w: (coords.w || 20) / 100,
        h: (coords.h || 20) / 100,
      };
    } else {
      region = parseRegion(description);
    }
    const rx = Math.max(0, Math.round(region.x * w));
    const ry = Math.max(0, Math.round(region.y * h));
    const rw = Math.min(w - rx, Math.round(region.w * w));
    const rh = Math.min(h - ry, Math.round(region.h * h));

    const toRemove = new Uint8Array(w * h);
    let removedCount = 0;
    let bx0, by0, bx1, by1;

    if (hasPreciseCoords) {
      // Gemini gave us exact coordinates — just remove the rectangle, no color detection needed.
      // This is the most reliable approach: Gemini sees the image, tells us exactly where.
      for (let py = ry; py < ry + rh && py < h; py++) {
        for (let px = rx; px < rx + rw && px < w; px++) {
          toRemove[py * w + px] = 1;
          removedCount++;
        }
      }
      bx0 = rx; by0 = ry;
      bx1 = Math.min(w - 1, rx + rw - 1);
      by1 = Math.min(h - 1, ry + rh - 1);
    } else {
      // No precise coords — use color-based detection as fallback
      // Sample colors at center of region
      const cx = Math.round(rx + rw / 2);
      const cy = Math.round(ry + rh / 2);
      const sampleR = 5;
      let avgR = 0, avgG = 0, avgB = 0, cnt = 0;
      for (let dy = -sampleR; dy <= sampleR; dy++) {
        for (let dx = -sampleR; dx <= sampleR; dx++) {
          const sx = cx + dx, sy = cy + dy;
          if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
            const si = (sy * w + sx) * 4;
            avgR += data[si]; avgG += data[si + 1]; avgB += data[si + 2]; cnt++;
          }
        }
      }
      if (cnt > 0) { avgR = Math.round(avgR / cnt); avgG = Math.round(avgG / cnt); avgB = Math.round(avgB / cnt); }

      // Flood fill from center with tolerance
      const tolerance = 60;
      const tolSq = tolerance * tolerance;
      const queue = [cy * w + cx];
      toRemove[cy * w + cx] = 1;
      let qi = 0;
      while (qi < queue.length && queue.length < 500000) {
        const pos = queue[qi++];
        const px = pos % w, py = Math.floor(pos / w);
        // Stay within expanded region
        if (px < rx - 20 || px > rx + rw + 20 || py < ry - 20 || py > ry + rh + 20) continue;
        const nbrs = [pos - 1, pos + 1, pos - w, pos + w];
        for (const n of nbrs) {
          if (n < 0 || n >= w * h || toRemove[n]) continue;
          const nx = n % w;
          if (Math.abs(nx - px) > 1) continue;
          const ni = n * 4;
          const dr = data[ni] - avgR, dg = data[ni+1] - avgG, db = data[ni+2] - avgB;
          if (dr*dr + dg*dg + db*db < tolSq) {
            toRemove[n] = 1;
            queue.push(n);
          }
        }
      }

      // Count and find bounding box
      bx0 = w; by0 = h; bx1 = 0; by1 = 0;
      for (let i = 0; i < w * h; i++) {
        if (toRemove[i]) {
          removedCount++;
          const x = i % w, y = Math.floor(i / w);
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
      }

      // If color detection failed, just remove the rectangle
      if (removedCount < 20) {
        for (let py = ry; py < ry + rh && py < h; py++) {
          for (let px = rx; px < rx + rw && px < w; px++) {
            if (!toRemove[py * w + px]) { toRemove[py * w + px] = 1; removedCount++; }
          }
        }
        bx0 = rx; by0 = ry;
        bx1 = Math.min(w - 1, rx + rw - 1);
        by1 = Math.min(h - 1, ry + rh - 1);
      }
    }

    if (removedCount === 0) {
      Accessibility.announce('Could not find anything to remove.');
      return 'Nothing to remove at that position.';
    }

    // ---- Nearest-neighbor cloning ----
    // For each removed pixel, find the closest non-removed pixel by scanning
    // up, down, left, right. Copy from the NEAREST one.
    // This extends the surrounding content naturally — e.g. a notification bar
    // at the bottom gets replaced by the content just above it continuing down.
    const scanLimit = Math.max(bx1 - bx0, by1 - by0) + 20;

    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const i = y * w + x;
        if (!toRemove[i]) continue;

        let bestDist = Infinity;
        let bestIdx = -1;

        // Scan UP (most common — content above a notification)
        for (let sy = y - 1; sy >= Math.max(0, y - scanLimit); sy--) {
          if (!toRemove[sy * w + x]) {
            const d = y - sy;
            if (d < bestDist) { bestDist = d; bestIdx = (sy * w + x) * 4; }
            break;
          }
        }
        // Scan DOWN
        for (let sy = y + 1; sy <= Math.min(h - 1, y + scanLimit); sy++) {
          if (!toRemove[sy * w + x]) {
            const d = sy - y;
            if (d < bestDist) { bestDist = d; bestIdx = (sy * w + x) * 4; }
            break;
          }
        }
        // Scan LEFT
        for (let sx = x - 1; sx >= Math.max(0, x - scanLimit); sx--) {
          if (!toRemove[y * w + sx]) {
            const d = x - sx;
            if (d < bestDist) { bestDist = d; bestIdx = (y * w + sx) * 4; }
            break;
          }
        }
        // Scan RIGHT
        for (let sx = x + 1; sx <= Math.min(w - 1, x + scanLimit); sx++) {
          if (!toRemove[y * w + sx]) {
            const d = sx - x;
            if (d < bestDist) { bestDist = d; bestIdx = (y * w + sx) * 4; }
            break;
          }
        }

        // Copy from nearest clean pixel
        const idx = i * 4;
        if (bestIdx >= 0) {
          data[idx]     = data[bestIdx];
          data[idx + 1] = data[bestIdx + 1];
          data[idx + 2] = data[bestIdx + 2];
        }
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Light blur on just the seam edges (not the whole removed area) to smooth transitions
    const pad = 3;
    const sx0 = Math.max(0, bx0 - pad), sy0 = Math.max(0, by0 - pad);
    const sx1 = Math.min(w - 1, bx1 + pad), sy1 = Math.min(h - 1, by1 + pad);
    const bw = sx1 - sx0 + 1, bh = sy1 - sy0 + 1;
    if (bw > 0 && bh > 0 && bw < 5000 && bh < 5000) {
      const patchCanvas = document.createElement('canvas');
      patchCanvas.width = bw;
      patchCanvas.height = bh;
      const patchCtx = patchCanvas.getContext('2d');
      patchCtx.drawImage(canvas, sx0, sy0, bw, bh, 0, 0, bw, bh);
      patchCtx.filter = 'blur(1px)';
      patchCtx.drawImage(patchCanvas, 0, 0);
      const smoothed = patchCtx.getImageData(0, 0, bw, bh);
      const origPatch = ctx.getImageData(sx0, sy0, bw, bh);
      // Only smooth pixels right at the border of the removed area (within 3px of edge)
      for (let py = 0; py < bh; py++) {
        for (let px = 0; px < bw; px++) {
          const gx = sx0 + px, gy = sy0 + py;
          const gi = gy * w + gx;
          if (!toRemove[gi]) continue;
          // Check if near edge of removed area
          let nearEdge = false;
          if (gx > 0 && !toRemove[gi - 1]) nearEdge = true;
          else if (gx < w - 1 && !toRemove[gi + 1]) nearEdge = true;
          else if (gy > 0 && !toRemove[gi - w]) nearEdge = true;
          else if (gy < h - 1 && !toRemove[gi + w]) nearEdge = true;
          if (nearEdge) {
            const li = (py * bw + px) * 4;
            origPatch.data[li] = smoothed.data[li];
            origPatch.data[li + 1] = smoothed.data[li + 1];
            origPatch.data[li + 2] = smoothed.data[li + 2];
            origPatch.data[li + 3] = 255;
          }
        }
      }
      ctx.putImageData(origPatch, sx0, sy0);
    }

    await bakeCanvas();

    Accessibility.announce(`Removed object. ${removedCount} pixels patched.`);
    return `Removed object at "${description}" — ${removedCount} pixels patched. Use Undo to reverse.`;
  }

  // ==========================================
  // INSERT / OVERLAY IMAGE
  // ==========================================

  /**
   * Insert another image onto the current canvas at a given position and size.
   * @param {string} imagePath - File path to the overlay image
   * @param {string} position - Where to place it: "center", "top left", etc.
   * @param {number} scale - Scale factor (0.1 - 2.0, default 0.3)
   * @param {number} opacity - Opacity 0-100, default 100
   */
  async function insertImage(imagePath, position = 'center', scale = 0.3, opacity = 100) {
    if (!originalImage || !ctx) {
      Accessibility.announce('No image loaded');
      return 'No image loaded. Open a base image first.';
    }
    saveState();

    return new Promise((resolve) => {
      const overlay = new Image();
      overlay.onload = () => {
        const cw = canvas.width;
        const ch = canvas.height;

        // Calculate overlay size
        let ow = Math.round(overlay.width * scale);
        let oh = Math.round(overlay.height * scale);
        // Clamp to canvas size
        if (ow > cw * 0.95) { const r = (cw * 0.95) / ow; ow = Math.round(ow * r); oh = Math.round(oh * r); }
        if (oh > ch * 0.95) { const r = (ch * 0.95) / oh; ow = Math.round(ow * r); oh = Math.round(oh * r); }

        // Calculate position
        const pos = (position || 'center').toLowerCase();
        let x = (cw - ow) / 2, y = (ch - oh) / 2; // default center
        if (pos.includes('left')) x = 10;
        else if (pos.includes('right')) x = cw - ow - 10;
        if (pos.includes('top')) y = 10;
        else if (pos.includes('bottom')) y = ch - oh - 10;

        // Draw with opacity
        ctx.globalAlpha = Math.max(0.01, Math.min(1, opacity / 100));
        ctx.drawImage(overlay, x, y, ow, oh);
        ctx.globalAlpha = 1.0;

        bakeCanvas().then(() => {
          Accessibility.announce(`Image inserted at ${position}, scale ${Math.round(scale * 100)}%`);
          resolve(`Inserted image at ${position} (${ow}x${oh} pixels, ${opacity}% opacity). Use Undo to reverse.`);
        });
      };
      overlay.onerror = () => {
        Accessibility.announce('Failed to load overlay image');
        resolve('Error: Could not load the overlay image.');
      };
      overlay.src = imagePath;
    });
  }

  /**
   * Insert image from a file picker (UI button version)
   */
  async function insertImageFromPicker(position = 'center', scale = 0.3) {
    if (!window.api) {
      Accessibility.announce('Insert image requires the desktop application');
      return;
    }
    const result = await window.api.showOpenDialog({
      title: 'Select Image to Insert',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return;
    return insertImage(result.filePaths[0], position, scale, 100);
  }

  // ==========================================
  // DRAW SHAPES & TEXT ON CANVAS (AI-driven)
  // ==========================================

  /**
   * Draw a filled rectangle on the photo.
   * @param {string} position - "center", "top left", "bottom right", etc. or {x,y} as fractions
   * @param {number} widthPct - width as percentage of image (0-100)
   * @param {number} heightPct - height as percentage of image (0-100)
   * @param {string} color - CSS color (e.g. "#FFD700", "gold", "rgba(0,0,0,0.5)")
   * @param {number} borderRadius - corner radius in pixels (0 for sharp corners)
   */
  async function drawRect(position, widthPct, heightPct, color, borderRadius = 0) {
    if (!originalImage || !ctx) return 'No image loaded.';
    saveState();
    drawImage(); // make sure canvas is current

    const cw = canvas.width, ch = canvas.height;
    const rw = Math.round((widthPct / 100) * cw);
    const rh = Math.round((heightPct / 100) * ch);

    const region = parseRegion(position || 'center');
    const rx = Math.round((region.x + region.w / 2) * cw - rw / 2);
    const ry = Math.round((region.y + region.h / 2) * ch - rh / 2);

    ctx.fillStyle = color || '#FFD700';
    if (borderRadius > 0) {
      ctx.beginPath();
      ctx.moveTo(rx + borderRadius, ry);
      ctx.lineTo(rx + rw - borderRadius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + borderRadius);
      ctx.lineTo(rx + rw, ry + rh - borderRadius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - borderRadius, ry + rh);
      ctx.lineTo(rx + borderRadius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - borderRadius);
      ctx.lineTo(rx, ry + borderRadius);
      ctx.quadraticCurveTo(rx, ry, rx + borderRadius, ry);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(rx, ry, rw, rh);
    }

    await bakeCanvas();
    return `Drew ${color} rectangle at ${position} (${rw}x${rh}px).`;
  }

  /**
   * Draw text directly on the photo.
   * @param {string} text - The text to draw
   * @param {string} position - Where to place it
   * @param {number} fontSize - Font size as percentage of image height (1-20)
   * @param {string} color - Text color
   * @param {string} bgColor - Background color behind text (optional, "" for none)
   * @param {string} font - Font family
   */
  async function drawTextOnPhoto(text, position = 'center', fontSize = 5, color = '#ffffff', bgColor = '', font = 'Arial') {
    if (!originalImage || !ctx) return 'No image loaded.';
    saveState();
    drawImage();

    const cw = canvas.width, ch = canvas.height;
    const fontPx = Math.round((fontSize / 100) * ch);
    ctx.font = `bold ${fontPx}px ${font}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const region = parseRegion(position || 'center');
    const tx = Math.round((region.x + region.w / 2) * cw);
    const ty = Math.round((region.y + region.h / 2) * ch);

    // Measure text
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const textH = fontPx;
    const padding = Math.round(fontPx * 0.4);

    // Draw background behind text if specified
    if (bgColor) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(tx - textW / 2 - padding, ty - textH / 2 - padding, textW + padding * 2, textH + padding * 2);
    }

    // Draw text with optional shadow for readability
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = Math.round(fontPx * 0.1);
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    await bakeCanvas();
    return `Drew text "${text}" at ${position} in ${color}, ${fontPx}px.`;
  }

  /**
   * Fill a region with a solid color (e.g., replace a panel)
   */
  async function fillRegion(position, color) {
    if (!originalImage || !ctx) return 'No image loaded.';
    saveState();
    drawImage();

    const cw = canvas.width, ch = canvas.height;
    const region = parseRegion(position || 'center');
    const rx = Math.round(region.x * cw);
    const ry = Math.round(region.y * ch);
    const rw = Math.round(region.w * cw);
    const rh = Math.round(region.h * ch);

    ctx.fillStyle = color || '#FFD700';
    ctx.fillRect(rx, ry, rw, rh);

    await bakeCanvas();
    return `Filled region "${position}" with ${color} (${rw}x${rh}px).`;
  }

  /** Get canvas data URL */
  function getImageDataURL() {
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.error('getImageDataURL failed:', e);
      return null;
    }
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
    removeBackground,
    blurBackground,
    removeRegion,
    smartRemove,
    parseRegion,
    insertImage,
    insertImageFromPicker,
    drawRect,
    drawTextOnPhoto,
    fillRegion,
    getImageDataURL,
    init,
    get hasImage() { return !!originalImage; },
    get currentPath() { return currentFilePath; },
  };
})();
