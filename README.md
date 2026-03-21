# Accessible Studio

An NVDA-accessible video editor, photo editor, and file converter built with Electron.

## Download

Head to the [Releases](https://github.com/demon-of-fire/accessable-studio/releases) page and download the latest `.zip` for Windows. Extract it and run **Accessible Studio.exe** — no install required.

## Features

- **Video Editor** — Timeline-based editing with trim, split, effects, text overlays, undo/redo
- **Photo Editor** — Crop, rotate, flip, resize, and apply filters on a canvas
- **File Converter** — Convert between video, audio, image, and document formats (FFmpeg-powered)
- **Assistant** — Control the editor with natural language commands (no API keys needed)
- **Full Accessibility** — ARIA labels on every control, live announcements, keyboard navigation, focus trapping, high-contrast themes, and a "Where Am I?" button

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Space | Play / Pause |
| Left / Right | Step one frame |
| S | Split clip at playhead |
| Delete | Delete selected clip |
| M | Mute / unmute clip |
| W | "Where Am I?" |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+I | Import media |
| Ctrl+E | Export |
| Ctrl+S | Save project |

## Building from Source

Requires [Node.js](https://nodejs.org/) (v18+).

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
