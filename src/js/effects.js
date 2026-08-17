/**
 * Effects Module - Video filters and presets
 */

const Effects = (() => {
  const filters = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: 0,
    sepia: 0,
    hue: 0,
    invert: 0,
  };

  const presets = {
    // === BASIC ===
    none: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    // === CLASSIC FILM ===
    vintage: { brightness: 110, contrast: 85, saturation: 70, blur: 0.3, grayscale: 0, sepia: 40, hue: 0, invert: 0 },
    cinematic: { brightness: 95, contrast: 130, saturation: 80, blur: 0, grayscale: 0, sepia: 10, hue: 0, invert: 0 },
    noir: { brightness: 100, contrast: 140, saturation: 0, blur: 0, grayscale: 100, sepia: 0, hue: 0, invert: 0 },
    faded: { brightness: 115, contrast: 80, saturation: 60, blur: 0, grayscale: 10, sepia: 15, hue: 0, invert: 0 },
    'old-film': { brightness: 105, contrast: 90, saturation: 50, blur: 0.5, grayscale: 20, sepia: 50, hue: 0, invert: 0 },
    'silent-movie': { brightness: 95, contrast: 150, saturation: 0, blur: 0, grayscale: 100, sepia: 10, hue: 0, invert: 0 },
    // === COLOR TONES ===
    warm: { brightness: 105, contrast: 105, saturation: 110, blur: 0, grayscale: 0, sepia: 20, hue: 15, invert: 0 },
    cool: { brightness: 100, contrast: 105, saturation: 90, blur: 0, grayscale: 0, sepia: 0, hue: 200, invert: 0 },
    golden: { brightness: 110, contrast: 100, saturation: 120, blur: 0, grayscale: 0, sepia: 35, hue: 10, invert: 0 },
    teal: { brightness: 100, contrast: 110, saturation: 90, blur: 0, grayscale: 0, sepia: 0, hue: 170, invert: 0 },
    'orange-teal': { brightness: 100, contrast: 120, saturation: 130, blur: 0, grayscale: 0, sepia: 15, hue: 180, invert: 0 },
    sunset: { brightness: 110, contrast: 110, saturation: 140, blur: 0, grayscale: 0, sepia: 25, hue: 345, invert: 0 },
    winter: { brightness: 95, contrast: 110, saturation: 70, blur: 0, grayscale: 0, sepia: 0, hue: 210, invert: 0 },
    autumn: { brightness: 105, contrast: 105, saturation: 130, blur: 0, grayscale: 0, sepia: 30, hue: 20, invert: 0 },
    spring: { brightness: 110, contrast: 100, saturation: 120, blur: 0, grayscale: 0, sepia: 0, hue: 90, invert: 0 },
    // === MOOD / STYLE ===
    dramatic: { brightness: 90, contrast: 160, saturation: 120, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    vivid: { brightness: 105, contrast: 120, saturation: 160, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    dreamy: { brightness: 115, contrast: 85, saturation: 90, blur: 1, grayscale: 0, sepia: 10, hue: 0, invert: 0 },
    'soft-glow': { brightness: 120, contrast: 80, saturation: 95, blur: 0.8, grayscale: 0, sepia: 5, hue: 0, invert: 0 },
    moody: { brightness: 85, contrast: 130, saturation: 80, blur: 0, grayscale: 10, sepia: 5, hue: 0, invert: 0 },
    dark: { brightness: 70, contrast: 130, saturation: 90, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    bright: { brightness: 130, contrast: 100, saturation: 110, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    muted: { brightness: 100, contrast: 90, saturation: 50, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    pastel: { brightness: 120, contrast: 80, saturation: 70, blur: 0, grayscale: 0, sepia: 10, hue: 0, invert: 0 },
    // === CREATIVE ===
    negative: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 100 },
    'psychedelic': { brightness: 110, contrast: 130, saturation: 200, blur: 0, grayscale: 0, sepia: 0, hue: 90, invert: 0 },
    'x-ray': { brightness: 110, contrast: 150, saturation: 0, blur: 0, grayscale: 100, sepia: 0, hue: 0, invert: 100 },
    'blueprint': { brightness: 100, contrast: 120, saturation: 50, blur: 0, grayscale: 50, sepia: 0, hue: 220, invert: 0 },
    // === SOCIAL MEDIA ===
    'instagram': { brightness: 110, contrast: 110, saturation: 130, blur: 0, grayscale: 0, sepia: 10, hue: 0, invert: 0 },
    'tiktok': { brightness: 105, contrast: 115, saturation: 140, blur: 0, grayscale: 0, sepia: 0, hue: 350, invert: 0 },
    'retro-80s': { brightness: 110, contrast: 105, saturation: 150, blur: 0, grayscale: 0, sepia: 0, hue: 300, invert: 0 },
    'vhs': { brightness: 105, contrast: 90, saturation: 80, blur: 0.5, grayscale: 0, sepia: 20, hue: 0, invert: 0 },
    // === PORTRAIT ===
    'skin-smooth': { brightness: 105, contrast: 95, saturation: 95, blur: 0.3, grayscale: 0, sepia: 5, hue: 0, invert: 0 },
    'beauty': { brightness: 110, contrast: 95, saturation: 105, blur: 0.5, grayscale: 0, sepia: 8, hue: 5, invert: 0 },
  };

  /** Generate CSS filter string */
  function getFilterString() {
    return `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) blur(${filters.blur}px) grayscale(${filters.grayscale}%) sepia(${filters.sepia}%) hue-rotate(${filters.hue}deg) invert(${filters.invert}%)`;
  }

  /** Set a single filter value */
  function setFilter(name, value) {
    if (name in filters) {
      filters[name] = parseFloat(value);
      applyFilters();
      updateSlider(name, value);
    }
  }

  /** Apply a preset */
  function applyPreset(presetName) {
    const preset = presets[presetName];
    if (!preset) {
      Accessibility.announce(`Unknown preset: ${presetName}`);
      return false;
    }
    Object.assign(filters, preset);
    applyFilters();
    updateAllSliders();
    Accessibility.announce(`Applied ${presetName} filter preset`);
    return true;
  }

  /** Reset all filters */
  function resetAll() {
    Object.assign(filters, presets.none);
    applyFilters();
    updateAllSliders();
    Accessibility.announce('All filters reset to default');
  }

  /** Apply filters to video preview */
  function applyFilters() {
    Player.applyFilter(getFullFilterString());
  }

  /** Update a single slider UI */
  function updateSlider(name, value) {
    // Try both ID patterns: filter-{name} and filter-{name}-slider
    const slider = document.getElementById(`filter-${name}`) || document.getElementById(`filter-${name}-slider`);
    const display = document.getElementById(`${name}-value`) || document.getElementById(`filter-${name}-val`);
    if (slider) {
      slider.value = value;
      let unit = '%';
      if (name === 'blur') unit = 'px';
      else if (name === 'hue') unit = '\u00B0';
      const displayText = `${value}${unit}`;
      slider.setAttribute('aria-valuetext', displayText);
      slider.setAttribute('aria-label', `${name.charAt(0).toUpperCase() + name.slice(1)}, currently ${displayText}`);
      if (display) display.textContent = displayText;
    }
  }

  /** Update all slider UIs */
  function updateAllSliders() {
    for (const [name, value] of Object.entries(filters)) {
      updateSlider(name, value);
    }
  }

  /** Get filter values */
  function getFilters() {
    return { ...filters };
  }

  /** Get FFmpeg filter string for export */
  function getFFmpegFilters() {
    const ffFilters = [];
    if (filters.brightness !== 100) {
      ffFilters.push(`eq=brightness=${(filters.brightness - 100) / 100}`);
    }
    if (filters.contrast !== 100) {
      ffFilters.push(`eq=contrast=${filters.contrast / 100}`);
    }
    if (filters.saturation !== 100) {
      ffFilters.push(`eq=saturation=${filters.saturation / 100}`);
    }
    if (filters.blur > 0) {
      const sigma = Math.max(1, Math.round(filters.blur * 2));
      ffFilters.push(`boxblur=${sigma}:${sigma}`);
    }
    if (filters.grayscale > 0) {
      ffFilters.push(`hue=s=${1 - filters.grayscale / 100}`);
    }
    if (filters.hue !== 0) {
      ffFilters.push(`hue=h=${filters.hue}`);
    }
    return ffFilters.join(',') || 'null';
  }

  /** Preset descriptions for UI */
  const presetDescriptions = {
    none: 'Remove all filters — original look',
    vintage: 'Warm faded look like old film from the 70s',
    cinematic: 'High contrast, slightly desaturated — Hollywood look',
    noir: 'Classic black and white with dramatic contrast',
    faded: 'Soft washed-out look like a sun-bleached photograph',
    'old-film': 'Aged film stock with grain and warm tones',
    'silent-movie': 'High contrast black and white silent era look',
    warm: 'Golden, sunny warmth with a slight sepia tint',
    cool: 'Blue-shifted for a calm, winter atmosphere',
    golden: 'Rich golden tones like golden hour sunlight',
    teal: 'Teal/cyan color shift for a stylized look',
    'orange-teal': 'Popular cinematic orange and teal color grade',
    sunset: 'Warm saturated sunset colors',
    winter: 'Cold desaturated winter atmosphere',
    autumn: 'Rich warm autumn/fall colors',
    spring: 'Fresh green-shifted spring colors',
    dramatic: 'Very high contrast with vivid colors',
    vivid: 'Boosted saturation and contrast — eye-catching',
    dreamy: 'Soft, slightly blurred ethereal look',
    'soft-glow': 'Gentle glow with lifted shadows',
    moody: 'Dark, desaturated, atmospheric',
    dark: 'Darkened with enhanced contrast',
    bright: 'Lightened with boosted saturation',
    muted: 'Desaturated, subtle, understated colors',
    pastel: 'Light, soft, low-saturation pastel tones',
    negative: 'Inverted colors — photo negative effect',
    psychedelic: 'Extreme saturation with color shift',
    'x-ray': 'Inverted grayscale — x-ray simulation',
    blueprint: 'Blue-tinted technical/blueprint look',
    instagram: 'Bright, saturated social media ready',
    tiktok: 'High saturation with slight pink/red shift',
    'retro-80s': 'Neon-saturated 80s retro vibes',
    vhs: 'VHS tape look with slight blur and warmth',
    'skin-smooth': 'Gentle portrait softening',
    beauty: 'Portrait enhancement with warm glow',
  };

  /** Get preset names */
  function getPresetNames() {
    return Object.keys(presets);
  }

  /** Get description for a preset */
  function getPresetDescription(name) {
    return presetDescriptions[name] || name;
  }

  // ==========================================
  // COLOR CORRECTION (RGB balance, temperature, tint)
  // ==========================================
  const colorCorrection = {
    redBalance: 100,    // 0-200
    greenBalance: 100,
    blueBalance: 100,
    temperature: 0,     // -100 (cool) to +100 (warm)
    tint: 0,            // -100 (green) to +100 (magenta)
    shadows: 0,         // -50 to +50
    highlights: 0,      // -50 to +50
  };

  function setColorCorrection(name, value) {
    if (name in colorCorrection) {
      colorCorrection[name] = parseFloat(value);
      applyFilters();
      // Update slider UI
      const slider = document.getElementById(`cc-${name}`) || document.getElementById(`cc-${name}-slider`);
      const display = document.getElementById(`cc-${name}-val`);
      if (slider) slider.value = value;
      if (display) display.textContent = value + (name === 'temperature' || name === 'tint' ? '' : '%');
    }
  }

  function getColorCorrection() { return { ...colorCorrection }; }

  function resetColorCorrection() {
    Object.keys(colorCorrection).forEach(k => {
      colorCorrection[k] = k.endsWith('Balance') ? 100 : 0;
    });
    applyFilters();
    // Update all CC sliders
    Object.entries(colorCorrection).forEach(([k, v]) => {
      const slider = document.getElementById(`cc-${k}`) || document.getElementById(`cc-${k}-slider`);
      const display = document.getElementById(`cc-${k}-val`);
      if (slider) slider.value = v;
      if (display) display.textContent = v + (k === 'temperature' || k === 'tint' ? '' : '%');
    });
    Accessibility.announce('Color correction reset');
  }

  /** Get combined filter string including color correction */
  function getFullFilterString() {
    let base = getFilterString();
    // Apply temperature as hue shift + saturation
    if (colorCorrection.temperature !== 0) {
      const tempHue = colorCorrection.temperature > 0 ? 15 : 200;
      const tempAmount = Math.abs(colorCorrection.temperature) / 100;
      base += ` hue-rotate(${tempHue * tempAmount}deg)`;
    }
    return base;
  }

  // ==========================================
  // AUDIO DUCKING
  // ==========================================
  let duckingEnabled = false;
  let duckAmount = 30; // reduce music volume by this percentage

  function setAudioDucking(enabled, amount) {
    duckingEnabled = enabled !== undefined ? enabled : !duckingEnabled;
    if (amount !== undefined) duckAmount = Math.max(0, Math.min(100, amount));
    Accessibility.announce(`Audio ducking ${duckingEnabled ? 'enabled' : 'disabled'}${duckingEnabled ? `, reducing by ${duckAmount}%` : ''}`);
  }

  function isAudioDuckingEnabled() { return duckingEnabled; }
  function getDuckAmount() { return duckAmount; }

  /** Init filter slider listeners */
  function init() {
    const filterNames = ['brightness', 'contrast', 'saturation', 'blur', 'grayscale', 'sepia', 'hue', 'invert'];
    filterNames.forEach(name => {
      const slider = document.getElementById(`filter-${name}`) || document.getElementById(`filter-${name}-slider`);
      if (slider) {
        slider.addEventListener('input', () => {
          setFilter(name, parseFloat(slider.value));
        });
      }
    });

    // Color correction sliders
    Object.keys(colorCorrection).forEach(name => {
      const slider = document.getElementById(`cc-${name}`) || document.getElementById(`cc-${name}-slider`);
      if (slider) {
        slider.addEventListener('input', () => {
          setColorCorrection(name, parseFloat(slider.value));
        });
      }
    });
  }

  return {
    setFilter, applyPreset, resetAll, getFilters, getFilterString,
    getFFmpegFilters, getPresetNames, getPresetDescription, init,
    // Color correction
    setColorCorrection, getColorCorrection, resetColorCorrection, getFullFilterString,
    // Audio ducking
    setAudioDucking, isAudioDuckingEnabled, getDuckAmount,
  };
})();
