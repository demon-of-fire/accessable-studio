# Accessible Studio

An NVDA-accessible video editor, photo editor, and file converter built with Electron. Fully keyboard-navigable, screen reader friendly, and controlled via natural language commands. Optionally powered by Google Gemini 2.5 Pro for intelligent image descriptions, context-aware editing, and real-time project control.

## Download

Head to the [Releases](https://github.com/demon-of-fire/accessable-studio/releases) page and download the latest `.zip` for Windows. Extract it and run **Accessible Studio.exe** — no install required.

## Getting Started

### Step 1: Install (if running from source)

Make sure you have [Node.js](https://nodejs.org/) v18 or newer installed, then:

```bash
git clone https://github.com/demon-of-fire/accessable-studio.git
cd accessable-studio
npm install
npm start
```

If you downloaded the release `.zip`, just extract it and double-click **Accessible Studio.exe**.

### Step 2: Install FFmpeg (required for video/audio features)

FFmpeg powers all video and audio conversion, export, and media info features. Install it with:

```bash
winget install ffmpeg
```

Or download it from [ffmpeg.org](https://ffmpeg.org/download.html) and add it to your system PATH. The app will automatically find FFmpeg if it is installed.

### Step 3: Start editing

1. **Open the app** — you land on the Video Editor tab by default.
2. **Import media** — click **Import Media** (or press `Ctrl+I`) to add video or image files. Click **Import Audio** for music and sound effects. Each file will prompt you to choose where on the timeline it goes.
3. **Edit your video** — use the toolbar buttons (Split, Delete, Duplicate, Add Text) or type natural language commands in the assistant bar at the bottom (e.g., "trim the first 5 seconds", "make it cinematic").
4. **Save your project** — click **Save Project**, give it a name, and it appears in the Projects panel on the right. You can reopen it anytime.
5. **Export** — click **Export Video** (or press `Ctrl+E`), pick a format and quality, and save your finished video.

### Step 4: Explore the other tools

- **Photo Editor** — open images, crop, rotate, resize, adjust brightness/contrast, apply filter presets, remove or blur backgrounds, and remove objects from photos.
- **File Converter** — convert between video formats (MP4, AVI, MKV, MOV, WebM), audio formats (MP3, WAV, FLAC, OGG, AAC), image formats (PNG, JPG, WebP, BMP, GIF, TIFF), and document formats (DOCX to TXT, DOCX to HTML, TXT to HTML).
- **User Guide** — searchable in-app documentation covering every button, shortcut, and assistant command.
- **Settings** — switch between dark/light mode, adjust contrast levels, change text size, and connect Gemini AI.

### Step 5: Connect Gemini AI (optional, free)

For the best assistant experience, connect Google Gemini:

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create a free API key.
2. In the app, go to **Settings** and paste your key in the **Gemini API Key** field.
3. Click **Save Key**.

With Gemini connected, the assistant can:
- **Actually edit your project in real time** — split clips, delete clips, trim, move, change speed and volume, apply filters, remove backgrounds, and more
- **See and describe your photos** in detail (colors, subjects, composition, mood)
- **Understand complex multi-step requests** ("select the second clip, trim 3 seconds from the start, and apply a cinematic filter")
- **Chain multiple actions** from a single command — it knows your full timeline state and acts on it

Without Gemini, the assistant still works using built-in keyword matching for all standard commands.

## The Assistant

The assistant bar sits at the very bottom of the screen and works on every tab. Type a command and press Enter — the response appears inline, right above the input box.

**Video editing commands:**
- "trim the first 5 seconds" / "trim the last 3 seconds"
- "split at 10 seconds" / "split here" — the new clip is added to the timeline automatically
- "delete this clip" / "duplicate this clip"
- "move this clip to 5 seconds" / "move it to the start"
- "set volume to 50" / "make it louder" / "turn it down"
- "set speed to 2x" / "slow it down"
- "remove audio from this clip"
- "add text hello world"
- "select clip 2" / "select the intro clip"
- "what clips do I have"

**Filters and color:**
- "make it cinematic" / "apply vintage" / "black and white"
- "set brightness to 120" / "darken it"
- "increase contrast" / "boost saturation"

**Photo editing commands:**
- "describe the image" — with Gemini, gives a real description of what's in the photo
- "remove background" / "blur background"
- "remove the person in the middle" / "remove the object on the left"
- "make it grayscale" / "apply sepia" / "vintage look"
- "rotate left" / "flip horizontal" / "resize to 1920 by 1080"
- "auto enhance"

**Playback:**
- "play" / "pause" / "stop"
- "go to 30 seconds" / "where am I"
- "mute" / "unmute"

**Smart tools:**
- "auto color correct" / "close gaps"
- "undo" / "redo"
- "zoom in" / "zoom out"
- "export as mp4" / "import media"

Type **help** in the assistant for the full command list.

## Projects

Your projects are saved to the app's data folder and listed in the **Projects** panel on the right side of the screen. Each project shows its name and the date it was last saved. Click **Open** to load a project, or **Delete** to remove it.

## Features

- **Video Editor** — timeline-based editing with trim, split, effects, text overlays, undo/redo, drag-to-move clips, and multi-track support (video, audio, text)
- **Photo Editor** — canvas-based editing with crop, rotate, flip, resize, brightness/contrast/saturation/sharpness sliders, filter presets, background removal, background blur, and region removal
- **File Converter** — convert between video, audio, image, and document formats powered by FFmpeg and Mammoth
- **AI Assistant** — natural language control powered by Google Gemini 2.5 Pro (free), with inline responses, image vision, and real-time project editing. Gemini has full access to your timeline and photos — it can split, delete, trim, move clips, apply filters, remove backgrounds, and more. Automatically falls back to Gemini 3 Flash or 2.5 Flash if rate limited. Works with built-in keyword matching when no API key is set
- **Full Accessibility** — ARIA labels on every control, live announcements, keyboard navigation, focus trapping, high-contrast themes, and a "Where Am I?" button

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space | Play / Pause |
| Left / Right Arrow | Skip 5 seconds back / forward |
| Comma / Period | Step one frame back / forward |
| S | Split clip at playhead |
| Delete | Delete selected clip |
| M | Mute / unmute |
| W | "Where Am I?" |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+I | Import media |
| Ctrl+Shift+I | Import audio |
| Ctrl+E | Export video |
| Ctrl+B | Focus assistant input |
| Ctrl+S | Save project |
| Ctrl+V | Paste copied/cut clip at playhead |
| F1 | Show keyboard shortcuts |
| Tab / Shift+Tab | Navigate between controls |
| Escape | Close any dialog |

## Building from Source

Requires [Node.js](https://nodejs.org/) v18 or newer.

```bash
npm install
npm start
```

To package a distributable build:

```bash
npx electron-packager . "Accessible Studio" --platform=win32 --arch=x64 --out=build --overwrite
```

## License

MIT
