/**
 * Gemini AI Module
 * Integrates Google Gemini 2.5 Flash — the assistant has full access to your
 * project: it can see your photo, knows every clip on the timeline, and can
 * make any edit in real time.
 */

const Gemini = (() => {
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
  const MODEL_CHAIN = ['gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-2.5-flash'];

  function getModel() { return MODEL_CHAIN[0]; }
  function setModel() { /* model is auto-selected from chain */ }
  let apiKey = '';

  function setApiKey(key) {
    apiKey = key.trim();
    localStorage.setItem('as-gemini-key', apiKey);
  }

  function getApiKey() {
    if (!apiKey) apiKey = localStorage.getItem('as-gemini-key') || '';
    return apiKey;
  }

  function isAvailable() {
    return !!getApiKey();
  }

  // ==========================================
  // SYSTEM PROMPT — full project access
  // ==========================================
  function buildSystemPrompt() {
    const clips = typeof Timeline !== 'undefined' ? Timeline.getClips() : [];
    const selectedClip = typeof Timeline !== 'undefined' ? Timeline.getSelectedClip() : null;
    const currentTime = typeof Player !== 'undefined' && Player.getCurrentTime ? Player.getCurrentTime() : 0;
    const totalDuration = typeof Timeline !== 'undefined' ? Timeline.getTotalDuration() : 0;
    const hasPhoto = typeof PhotoEditor !== 'undefined' && PhotoEditor.hasImage;

    let clipInfo = 'Timeline is empty.';
    if (clips.length > 0) {
      clipInfo = clips.map((c, i) => {
        let line = `  ${i}: "${c.name}" (${c.type}) ${c.startTime.toFixed(1)}s–${(c.startTime + c.duration).toFixed(1)}s`;
        if (c.volume !== undefined && c.volume !== 100) line += ` vol=${c.volume}%`;
        if (c.speed !== undefined && c.speed !== 1) line += ` speed=${c.speed}x`;
        if (c.text) line += ` text="${c.text}"`;
        return line;
      }).join('\n');
    }

    let selectedInfo = 'None selected.';
    if (selectedClip) {
      selectedInfo = `index ${clips.indexOf(selectedClip)}: "${selectedClip.name}" (${selectedClip.type}) ${selectedClip.startTime.toFixed(1)}s–${(selectedClip.startTime + selectedClip.duration).toFixed(1)}s`;
    }

    return `You are the built-in AI assistant for Accessible Studio — a video editor, photo editor, and file converter.

YOU HAVE FULL ACCESS TO THE PROJECT. You can see the user's photo (attached as an image when one is loaded) and you know the full state of the video timeline. You make real edits — you don't just describe what to do.

=== CURRENT PROJECT STATE ===
Playhead: ${currentTime.toFixed(1)}s / ${totalDuration.toFixed(1)}s total
Selected clip: ${selectedInfo}
Photo loaded: ${hasPhoto}${hasPhoto ? ' (the image is attached — you can see it)' : ''}
Clips (${clips.length}):
${clipInfo}

=== HOW TO MAKE EDITS ===
Respond with a SHORT explanation (1-2 sentences max) and then an actions block:

\`\`\`actions
[{"action": "name", "params": {}}]
\`\`\`

You MUST include the actions block whenever the user wants something changed. Multiple actions run in sequence.

=== ALL AVAILABLE ACTIONS ===

CLIP SELECTION (do this first if you need to target a specific clip):
  selectClip          {index: 0}              — select by 0-based index from the list above
  selectClipByName    {name: "clip name"}     — select by name (partial match)

TIMELINE EDITING (operates on selected clip unless noted):
  trim                {trimStart: s, trimEnd: s}  — trim seconds from start/end
  split               {time: seconds}              — split N seconds into the selected clip (relative to clip start, NOT absolute timeline position)
  splitAtPlayhead                                  — split at current playhead
  delete                                           — delete selected clip
  duplicate                                        — duplicate selected clip
  moveClip            {time: seconds}              — move selected clip to new start time
  setVolume           {volume: 0-200}              — clip volume %
  setSpeed            {speed: 0.25-4}              — playback speed
  removeClipAudio                                  — strip audio from selected video clip
  addText             {text: "str", duration: s, position: "top|center|bottom"}
  clearTimeline                                    — remove all clips

VIDEO FILTERS (applied to preview / selected clip):
  setBrightness       {value: 0-200}    — 100 = normal
  setContrast         {value: 0-200}
  setSaturation       {value: 0-200}
  setBlur             {value: 0-20}     — pixels
  applyPreset         {preset: "vintage|cinematic|noir|warm|cool|dramatic|faded|vivid|none"}

PHOTO EDITING (operates on the loaded photo):
  removeBackground    {tolerance: 30-100}   — ONLY for removing the ENTIRE background (making it transparent). Flood-fills from edges. Use tolerance 70-90. Default 70.
  blurBackground      {tolerance: 30-100, radius: 15-60}  — ONLY for portrait-mode blur effect (keeps subject sharp, blurs background). NOT for removing anything. Default tolerance 70, radius 35.
  removeObject        {description: "what to remove", x: 0-100, y: 0-100, w: 0-100, h: 0-100}  — USE THIS when user wants to REMOVE/DELETE a specific object, thing, person, or area from the photo. This REMOVES it and fills with surrounding colors. ALWAYS pass x, y, w, h as PERCENTAGE coordinates (0-100) of where the object is in the image. x/y = top-left corner, w/h = size. LOOK AT THE IMAGE and estimate precisely where the object is. Example: a notification bar at the very bottom = {x: 0, y: 92, w: 100, h: 8}. A face in the center = {x: 35, y: 20, w: 30, h: 35}. ALWAYS use this for "remove the X", "delete the X", "get rid of the X".
  removeRegion        {description: "position description"}  — Rectangle-based removal. Use removeObject instead for better results.
  insertImage         {position: "center|top left|bottom right|etc", scale: 0.1-2.0, opacity: 0-100}  — Opens file picker to insert another image as overlay. Default scale 0.3 (30%), opacity 100.
  photoAdjust         {brightness: -100..100, contrast: -100..100, saturation: -100..100, sharpness: 0..100}
  photoPreset         {preset: "none|grayscale|sepia|vintage|warm|cool|vivid|noir"}
  photoRotateLeft / photoRotateRight
  photoFlipH / photoFlipV
  photoResize         {width: px, height: px}
  autoEnhancePhoto    — auto-improve brightness, contrast, saturation
  drawRect            {position: "center", widthPct: 30, heightPct: 20, color: "#FFD700", borderRadius: 10}  — draw a colored rectangle on the photo
  drawText            {text: "Hello", position: "center", fontSize: 5, color: "#ffffff", bgColor: "#000000", font: "Arial"}  — draw text on the photo. fontSize is % of image height (1-20). bgColor is optional background behind text.
  fillRegion          {position: "center", color: "#FFD700"}  — fill a described region with a solid color (e.g. replace a panel with gold)

PLAYBACK:
  play / pause / stop
  seek                {time: seconds}
  mute / unmute

UNDO / REDO:
  undo / redo

ZOOM:
  zoomIn / zoomOut

SMART TOOLS:
  autoColorCorrect
  closeGaps           — snap all clips together removing gaps
  autoEnhancePhoto    — auto-enhance the loaded photo

APP:
  import              — open import media dialog
  export              — open export dialog

=== RULES ===
1. You CAN SEE the photo when one is loaded. Describe what you actually see — people, objects, colors, scenery, mood, lighting.
2. ALWAYS output the actions block when the user wants a change. Never just describe what they should do.
3. You can chain multiple actions. Example: select clip 2, then trim it, then apply a filter.
4. Keep text responses SHORT. The user sees the results live.
5. If the user is vague, make a reasonable choice and tell them what you did.
6. For removeObject/removeRegion, describe the position: "left", "right", "center", "top left", etc.
7. If something can't be done (e.g. no clips, no photo), explain briefly.

=== CRITICAL: CHOOSING THE RIGHT PHOTO ACTION ===
- "remove the X" / "delete the X" / "get rid of the X" / "erase the X" → ALWAYS use removeObject. NEVER use blurBackground for removal requests.
- "blur the background" / "make background blurry" / "portrait mode" → use blurBackground.
- "remove background" / "transparent background" / "cut out the subject" → use removeBackground.
- blurBackground is ONLY for making background blurry. It does NOT remove anything.
- removeObject is for REMOVING specific things from the image and patching the hole.
- removeBackground is for making the entire background transparent.
- For removeObject, ALWAYS pass x, y, w, h percentage coordinates. LOOK at the image carefully and estimate where the object is. Be PRECISE — a small notification popup needs small w/h (like 5-10%), not a huge region.

=== COLORS ===
You can use ANY valid CSS color for drawRect, drawText, fillRegion. This includes:
- Hex codes: #ff0000, #00ff00, #0000ff, #FFD700, #FF69B4, #8B4513, #000000, #ffffff, #333333, #808080, etc.
- Named colors: red, blue, green, yellow, orange, purple, pink, cyan, magenta, lime, teal, navy, maroon, olive, coral, salmon, gold, silver, indigo, violet, turquoise, crimson, tomato, chocolate, sienna, peru, tan, wheat, ivory, beige, lavender, plum, orchid, hotpink, deeppink, fuchsia, aqua, aquamarine, springgreen, limegreen, forestgreen, darkgreen, seagreen, mediumseagreen, lightgreen, palegreen, darkslategray, slategray, lightslategray, steelblue, royalblue, dodgerblue, deepskyblue, lightskyblue, cornflowerblue, midnightblue, darkblue, mediumblue, darkviolet, darkorchid, mediumpurple, blueviolet, rebeccapurple, slateblue, darkslateblue, firebrick, darkred, orangered, darkorange, sandybrown, goldenrod, darkgoldenrod, khaki, darkkhaki, rosybrown, mistyrose, lemonchiffon, lightyellow, honeydew, mintcream, azure, aliceblue, ghostwhite, whitesmoke, gainsboro, lightgray, darkgray, dimgray, black, white
- RGB: rgb(255, 0, 0), rgba(0, 0, 0, 0.5)
- HSL: hsl(210, 100%, 50%)
Always pick the BEST matching color for what the user asks. If they say "make it red", use #ff0000. If they say "dark blue", use #00008B. Be creative with color choices.`;
  }

  // ==========================================
  // SINGLE SEND METHOD — always includes project context + photo
  // ==========================================
  async function send(userMessage) {
    const key = getApiKey();
    if (!key) throw new Error('No Gemini API key set');

    const systemPrompt = buildSystemPrompt();
    const parts = [{ text: userMessage }];

    // Always attach the photo if one is loaded — Gemini can see it
    // Downscale to max 1024px so Gemini sees the FULL image without hitting size limits
    const hasPhoto = typeof PhotoEditor !== 'undefined' && PhotoEditor.hasImage;
    if (hasPhoto) {
      try {
        const dataURL = PhotoEditor.getImageDataURL();
        if (dataURL) {
          // Downscale large images so Gemini can see the entire thing
          const tempImg = new Image();
          const scaled = await new Promise((resolve) => {
            tempImg.onload = () => {
              const maxDim = 1024;
              let sw = tempImg.width, sh = tempImg.height;
              if (sw > maxDim || sh > maxDim) {
                const ratio = Math.min(maxDim / sw, maxDim / sh);
                sw = Math.round(sw * ratio);
                sh = Math.round(sh * ratio);
              }
              const tc = document.createElement('canvas');
              tc.width = sw; tc.height = sh;
              const tctx = tc.getContext('2d');
              tctx.drawImage(tempImg, 0, 0, sw, sh);
              resolve(tc.toDataURL('image/jpeg', 0.85));
            };
            tempImg.onerror = () => resolve(null);
            tempImg.src = dataURL;
          });
          if (scaled) {
            const match = scaled.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
              parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
            }
          }
        }
      } catch (e) {
        console.warn('Could not attach photo to Gemini request:', e);
      }
    }

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1500,
      },
    });

    // Try each model in order: 2.5 Pro → 3 Flash → 2.5 Flash
    let lastError = null;
    for (const m of MODEL_CHAIN) {
      try {
        const response = await fetch(`${API_BASE}/${m}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (response.status === 400 || response.status === 403) {
          throw new Error('Invalid API key. Check your Gemini API key in Settings.');
        }

        if (response.status === 429) {
          // Rate limited — try next model
          console.warn(`${m} rate limited, trying next model...`);
          lastError = new Error(`${m} rate limited`);
          continue;
        }

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          const msg = err.error?.message || `API error (${response.status})`;
          // Model not found or unavailable — try next
          if (response.status === 404 || response.status === 503) {
            console.warn(`${m} unavailable: ${msg}, trying next model...`);
            lastError = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        console.log(`Gemini response from ${m}`);
        return extractText(data);
      } catch (e) {
        // Auth errors should not fall through
        if (e.message && e.message.includes('API key')) throw e;
        console.warn(`${m} failed:`, e.message);
        lastError = e;
      }
    }

    throw lastError || new Error('All Gemini models failed.');
  }

  // ==========================================
  // RESPONSE PARSING
  // ==========================================
  function extractText(data) {
    if (!data.candidates || data.candidates.length === 0) return 'No response from Gemini.';
    const parts = data.candidates[0].content?.parts;
    if (!parts || parts.length === 0) return 'Empty response.';
    return parts.map(p => p.text || '').join('');
  }

  function parseActions(responseText) {
    const actionsMatch = responseText.match(/```actions\s*\n?([\s\S]*?)```/);
    if (!actionsMatch) return { text: responseText, actions: [] };
    try {
      const actions = JSON.parse(actionsMatch[1].trim());
      const text = responseText.replace(/```actions\s*\n?[\s\S]*?```/, '').trim();
      return { text, actions: Array.isArray(actions) ? actions : [actions] };
    } catch (e) {
      return { text: responseText, actions: [] };
    }
  }

  // ==========================================
  // ACTION EXECUTION
  // ==========================================
  /** Ensure a clip is selected — auto-select first clip if none */
  function ensureClipSelected() {
    let clip = Timeline.getSelectedClip();
    if (!clip) {
      const clips = Timeline.getClips();
      if (clips.length > 0) {
        Timeline.selectClip(clips[0].id);
        clip = clips[0];
      }
    }
    return clip;
  }

  async function executeAction(action) {
    const p = action.params || {};

    switch (action.action) {
      // --- Clip selection ---
      case 'selectClip': {
        const clips = Timeline.getClips();
        if (p.index >= 0 && p.index < clips.length) Timeline.selectClip(clips[p.index].id);
        break;
      }
      case 'selectClipByName': {
        const clips = Timeline.getClips();
        const target = (p.name || '').toLowerCase();
        const match = clips.find(c => c.name.toLowerCase().includes(target));
        if (match) Timeline.selectClip(match.id);
        break;
      }

      // --- Timeline editing ---
      case 'trim': {
        const clip = ensureClipSelected();
        if (clip) Timeline.trimClip(clip.id, p.trimStart, p.trimEnd);
        break;
      }
      case 'split': {
        if (p.time === 'playhead') { Timeline.splitAtPlayhead(); break; }
        const clip = ensureClipSelected();
        if (clip) {
          // p.time is relative to clip start (e.g. "3 seconds into the clip")
          // Convert to absolute timeline position for splitClip()
          const absoluteTime = clip.startTime + Number(p.time);
          Timeline.splitClip(clip.id, absoluteTime);
        }
        break;
      }
      case 'splitAtPlayhead': {
        ensureClipSelected();
        Timeline.splitAtPlayhead();
        break;
      }
      case 'delete': {
        const clip = ensureClipSelected();
        if (clip) Timeline.removeClip(clip.id);
        break;
      }
      case 'duplicate': {
        const clip = ensureClipSelected();
        if (clip) Timeline.duplicateClip(clip.id);
        break;
      }
      case 'moveClip': {
        const clip = ensureClipSelected();
        if (clip && p.time !== undefined) Timeline.updateClipProperty(clip.id, 'startTime', p.time);
        break;
      }
      case 'setVolume': {
        const clip = ensureClipSelected();
        if (clip) Timeline.updateClipProperty(clip.id, 'volume', p.volume);
        break;
      }
      case 'setSpeed': {
        const clip = ensureClipSelected();
        if (clip) Timeline.updateClipProperty(clip.id, 'speed', p.speed);
        break;
      }
      case 'removeClipAudio': {
        const clip = ensureClipSelected();
        if (clip) Timeline.removeAudio(clip.id);
        break;
      }
      case 'addText': {
        const playheadTime = Player.getCurrentTime();
        const trackEnd = Timeline.getTrackEndTime('text');
        Timeline.addClip({
          name: 'Text: ' + (p.text || 'Text').substring(0, 20),
          type: 'text',
          text: p.text || 'Text',
          duration: p.duration || 5,
          startTime: playheadTime > 0 ? playheadTime : trackEnd,
          textPosition: p.position || 'center',
        });
        break;
      }
      case 'clearTimeline': Timeline.clearAll(); break;

      // --- Video filters ---
      case 'setBrightness': Effects.setFilter('brightness', p.value); break;
      case 'setContrast': Effects.setFilter('contrast', p.value); break;
      case 'setSaturation': Effects.setFilter('saturation', p.value); break;
      case 'setBlur': Effects.setFilter('blur', p.value); break;
      case 'applyPreset': Effects.applyPreset(p.preset); break;

      // --- Photo editing (auto-switch to photo tab so user sees changes) ---
      case 'removeBackground':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.removeBackground(p.tolerance || 70);
        break;
      case 'blurBackground':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.blurBackground(p.tolerance || 70, p.radius || 35);
        break;
      case 'removeObject':
      case 'eraseObject':
      case 'deleteObject':
      case 'remove':
      case 'erase':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        {
          const coords = (p.x !== undefined && p.y !== undefined) ? { x: p.x, y: p.y, w: p.w, h: p.h } : null;
          await PhotoEditor.smartRemove(p.description || p.position || p.target || 'center', coords);
        }
        break;
      case 'removeRegion':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.removeRegion(p.description || p.position || 'center');
        break;
      case 'insertImage':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.insertImageFromPicker(p.position || 'center', p.scale || 0.3);
        break;
      case 'photoAdjust':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        if (p.brightness !== undefined) PhotoEditor.setAdjustment('brightness', p.brightness);
        if (p.contrast !== undefined) PhotoEditor.setAdjustment('contrast', p.contrast);
        if (p.saturation !== undefined) PhotoEditor.setAdjustment('saturation', p.saturation);
        if (p.sharpness !== undefined) PhotoEditor.setAdjustment('sharpness', p.sharpness);
        break;
      case 'photoPreset': PhotoEditor.applyPreset(p.preset); break;
      case 'drawRect':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.drawRect(p.position || 'center', p.widthPct || 30, p.heightPct || 20, p.color || '#FFD700', p.borderRadius || 0);
        break;
      case 'drawText':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.drawTextOnPhoto(p.text || 'Text', p.position || 'center', p.fontSize || 5, p.color || '#ffffff', p.bgColor || '', p.font || 'Arial');
        break;
      case 'fillRegion':
        if (typeof App !== 'undefined' && App.switchSection) App.switchSection('section-photo-editor');
        await PhotoEditor.fillRegion(p.position || 'center', p.color || '#FFD700');
        break;
      case 'photoRotateLeft': PhotoEditor.rotateLeft(); break;
      case 'photoRotateRight': PhotoEditor.rotateRight(); break;
      case 'photoFlipH': PhotoEditor.flipHorizontal(); break;
      case 'photoFlipV': PhotoEditor.flipVertical(); break;
      case 'photoResize':
        if (p.width && p.height) PhotoEditor.resize(p.width, p.height);
        break;

      // --- Playback ---
      case 'play': Player.play(); break;
      case 'pause': Player.pause(); break;
      case 'stop': Player.stop(); break;
      case 'seek': Player.seekTo(p.time); break;
      case 'mute': case 'unmute': Player.toggleMute(); break;

      // --- Undo/Redo ---
      case 'undo': Timeline.undo(); break;
      case 'redo': Timeline.redo(); break;

      // --- Zoom ---
      case 'zoomIn': Timeline.zoomIn(); break;
      case 'zoomOut': Timeline.zoomOut(); break;

      // --- Smart tools ---
      case 'autoColorCorrect':
        if (typeof AIAssistant !== 'undefined') AIAssistant.autoColorCorrect();
        break;
      case 'closeGaps':
        if (typeof AIAssistant !== 'undefined') AIAssistant.closeGaps();
        break;
      case 'autoEnhancePhoto':
        if (typeof AIAssistant !== 'undefined') AIAssistant.autoEnhancePhoto();
        break;

      // --- App ---
      case 'import': if (window.api) window.api.importMedia(); break;
      case 'export': {
        const dialog = document.getElementById('export-dialog');
        if (dialog) Accessibility.showModal(dialog);
        break;
      }

      default:
        console.warn('Unknown Gemini action:', action.action);
    }
  }

  // ==========================================
  // PROCESS — parse response, execute all actions, return HTML
  // ==========================================
  async function processResponse(responseText) {
    const { text, actions } = parseActions(responseText);

    for (const action of actions) {
      try {
        await executeAction(action);
        // Small yield so the UI updates between chained actions (e.g. select then trim)
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        console.error('Error executing action:', action, e);
      }
    }

    // Markdown-ish → HTML
    let html = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');

    return { html, actionsExecuted: actions.length };
  }

  return { setApiKey, getApiKey, setModel, getModel, isAvailable, send, processResponse };
})();
