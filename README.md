# Accessible Studio

A fully NVDA-accessible video editor, photo editor, and file converter desktop application built with Electron.

## How to Run

1. Make sure Node.js is installed
2. Open a terminal in this folder
3. Run `npm install` (first time only)
4. Run `npm start`

Or double-click `Launch Accessible Studio.bat` if the app has been built.

## Project Structure

```
video editer/
├── main.js              - Electron main process (window, menus, file dialogs, FFmpeg)
├── preload.js           - Secure bridge between Electron and the renderer
├── package.json         - Dependencies and scripts
├── Launch Accessible Studio.bat - Shortcut to launch the built app
├── README.md            - This file
│
├── src/                 - All frontend code
│   ├── index.html       - Full app UI (all sections, dialogs, buttons)
│   │
│   ├── styles/
│   │   └── main.css     - Theming (dark/light, contrast levels, font sizes, filmstrip)
│   │
│   └── js/
│       ├── app.js           - Main controller: sidebar navigation, settings, placement
│       │                      dialog, keyboard shortcuts, import workflow
│       ├── accessibility.js - Screen reader announcements, focus trapping, modal
│       │                      management, toolbar/listbox keyboard navigation
│       ├── timeline.js      - Timeline engine: clips, tracks, undo/redo, drag-to-move,
│       │                      trim handles, zoom, split, duplicate, serialize/deserialize
│       ├── player.js        - Video playback, frame stepping with audio, filmstrip
│       │                      scrubber, "Where Am I?" announcements, FPS detection
│       ├── effects.js       - Video filters and presets (vintage, cinematic, noir, etc.),
│       │                      individual controls (brightness, contrast, blur, etc.)
│       ├── photoeditor.js   - Canvas-based photo editing: crop, rotate, flip, resize,
│       │                      filters and presets, undo/redo
│       ├── chatbot.js       - Local command parser (no API keys): trim, split, delete,
│       │                      volume, speed, filters, text, and more via natural language
│       ├── ai-assistant.js  - AI features: sound effect search (opens free libraries),
│       │                      auto color correct, montage creation, speed ramp, auto trim
│       └── converter.js     - File format conversion using FFmpeg (video, audio, image,
│                              document formats like PDF to Word)
│
├── build/               - Built/packaged app (created by electron-packager)
└── node_modules/        - Dependencies (created by npm install)
```

## App Sections (Sidebar)

1. **Video Editor** - Timeline-based editing with clips, trim, split, effects, text overlays
2. **Photo Editor** - Canvas-based editing with rotate, flip, resize, filters
3. **File Converter** - Convert between video, audio, image, and document formats
4. **Assistant** - Chatbot that controls the editor via natural language commands
5. **User Guide** - Full list of all commands and keyboard shortcuts
6. **Settings** - Theme (dark/light), contrast levels, font size, login/account

## Keyboard Shortcuts

- **Space** - Play/Pause
- **Left/Right Arrow** - Step backward/forward one frame
- **S** - Split clip at playhead
- **Delete** - Delete selected clip
- **M** - Mute/unmute selected clip
- **W** - "Where Am I?" (announces playhead position)
- **Ctrl+Z** - Undo
- **Ctrl+Y** - Redo
- **Ctrl+E** - Export
- **Ctrl+I** - Import media
- **Ctrl+S** - Save project

## Accessibility

- Every button and control has a descriptive aria-label
- Live announcements via aria-live regions for all actions
- Full keyboard navigation (arrow keys in toolbars, Tab between sections)
- Focus trapping in dialogs
- "Where Am I?" button for playhead position context
- Placement dialog when importing files (choose where on timeline)
- High contrast and font size options in Settings
- Reduced motion support via CSS media query

## Dependencies

- **Electron** - Desktop app framework
- **fluent-ffmpeg** - Video/audio processing
- **sharp** - Image processing
- **pdf-lib** - PDF manipulation
- **mammoth** - Word document conversion
