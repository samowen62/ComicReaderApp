# Comic Reader (Comic Translator)

Desktop app for capturing manga pages from the screen, translating the Japanese
text to English, and exporting the translated pages. See
`../ComicTranslatorSoftwareDescription_v2.md` for the full specification.

**Current state: Phase 1** — project management, screenshot capture, and raw
page export. OCR (Phase 3), translation (Phase 4), and text-rectangle editing
(Phase 2) are not implemented yet.

## Stack

- Electron + React 18 + TypeScript (electron-vite)
- zustand for renderer state
- archiver for .zip/.cbz export
- Vitest for unit tests
- electron-builder for packaging

## Setup

```bash
npm install
npm run dev      # launch in dev mode with hot reload
npm test         # run unit tests
npm run build    # type-check-free bundle into out/
npm run dist     # build + package (Windows NSIS/portable, Linux AppImage)
```

## Usage (Phase 1)

1. On the Main Screen, create a project or open an existing one. Projects live
   as child directories of the main project directory (default
   `Documents/ComicReaderProjects`, configurable in Settings).
2. New projects land in Capture Mode: drag a capture region on any monitor,
   confirm it, then press **Capture Screen** or the global hotkey (default F8,
   configurable in Settings). The hotkey is registered only while Capture Mode
   is open.
3. **End Capture Mode** commits the session and opens the Project Screen:
   reorder/delete pages in the sidebar, **Add Pages** to capture more,
   **Export Image** / **Export Project** (numbered directory, `.zip`, or
   `.cbz`) to write pages to disk.
4. Ctrl+Z / Ctrl+Y undo and redo project actions (reorder, delete, capture
   commits, page navigation).

## On-disk layout

```
<main project directory>/
  <project name>/
    project.json       # project data file (autosaved atomically on every action)
    journal.jsonl      # per-action journal, deleted on clean app exit
    capture_001.png    # captured pages
    capture_001_export.png
    exports/           # Export Project output (directories and archives)
```

If the app is killed, the orphaned journal triggers a recovery prompt the next
time the project is opened (Model A per spec section 9.2: `project.json` is
always current, so the prompt just offers to discard the journal).

## Architecture

- **Renderer** (React) is the source of truth for project state and the
  session-only undo stack. Every user action is applied locally, pushed to the
  undo stack, and sent over IPC.
- **Main process** is a persistence/capture service: atomic `project.json`
  writes, journal appends, screenshot capture, hotkey registration, export.
- Capture uses one transparent overlay window per display for region
  selection, then `desktopCapturer` full-resolution screenshots cropped in
  physical pixels (DPI-aware).
- Renderer loads project images through a `media://` protocol confined to the
  main project directory.

## Platform notes / limitations

- Windows 10/11 is the primary target. On Ubuntu, capture and the global
  hotkey require an X11 session (Wayland restricts both; spec section 12).
- The app window is not hidden during capture — keep the capture region clear
  of it.
- Phase 1 Export Image copies the raw capture; compositing translated text
  arrives in Phase 2 through the same entry point.
- Deleted pages' image files stay on disk until the app closes cleanly so undo
  can restore them within the session.
