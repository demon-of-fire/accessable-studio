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
    none: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    vintage: { brightness: 110, contrast: 85, saturation: 70, blur: 0.3, grayscale: 0, sepia: 40, hue: 0, invert: 0 },
    cinematic: { brightness: 95, contrast: 130, saturation: 80, blur: 0, grayscale: 0, sepia: 10, hue: 0, invert: 0 },
    noir: { brightness: 100, contrast: 140, saturation: 0, blur: 0, grayscale: 100, sepia: 0, hue: 0, invert: 0 },
    warm: { brightness: 105, contrast: 105, saturation: 110, blur: 0, grayscale: 0, sepia: 20, hue: 15, invert: 0 },
    cool: { brightness: 100, contrast: 105, saturation: 90, blur: 0, grayscale: 0, sepia: 0, hue: 200, invert: 0 },
    dramatic: { brightness: 90, contrast: 160, saturation: 120, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
    faded: { brightness: 115, contrast: 80, saturation: 60, blur: 0, grayscale: 10, sepia: 15, hue: 0, invert: 0 },
    vivid: { brightness: 105, contrast: 120, saturation: 160, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 },
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
    Player.applyFilter(getFilterString());
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

  /** Get preset names */
  function getPresetNames() {
    return Object.keys(presets);
  }

  /** Init filter slider listeners */
  function init() {
    const filterNames = ['brightness', 'contrast', 'saturation', 'blur', 'grayscale', 'sepia', 'hue', 'invert'];
    filterNames.forEach(name => {
      const slider = document.getElementById(`filter-${name}`);
      if (slider) {
        slider.addEventListener('input', () => {
          setFilter(name, parseFloat(slider.value));
        });
      }
    });
  }

  return {
    setFilter,
    applyPreset,
    resetAll,
    getFilters,
    getFilterString,
    getFFmpegFilters,
    getPresetNames,
    init,
  };
})();
