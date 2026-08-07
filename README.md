# Comic Reader (Comic Translator)

Desktop app for capturing manga pages from the screen, translating the Japanese
text to English, and exporting the translated pages. See
`../ComicTranslatorSoftwareDescription_v2.md` for the full specification.

**Current state: Phase 3** — project management, capture, text-rectangle editing,
export compositing, bubble detection, and manga-ocr. Translation (Phase 4) is
not implemented yet; **Auto Find Text** fills original Japanese text only.

## Stack

- Electron + React 18 + TypeScript (electron-vite)
- zustand for renderer state
- Python sidecar: manga-ocr + Ultralytics YOLOv8 comic-speech-bubble detector
- archiver for .zip/.cbz export
- Vitest for unit tests
- electron-builder for packaging

## Setup

```bash
npm install

# Python sidecar (once)
# Prefer Python 3.10–3.12. A project venv is expected at python/.venv
cd python
python -m venv .venv
.\.venv\Scripts\pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\pip.exe install -r requirements.txt
cd ..

npm run dev      # launch in dev mode with hot reload
npm test         # run unit tests
npm run build
npm run dist
```

Override the interpreter with `COMIC_READER_PYTHON` if the venv is elsewhere.
See [python/README.md](python/README.md).

First OCR / detect call downloads model weights (~500MB) into `python/models/`
and the HuggingFace cache.

## Usage

1. Main Screen: create/open/delete projects (default dir
   `Documents/ComicReaderProjects`).
2. Capture Mode: select a multi-monitor region, **Capture Screen** or hotkey
   (default F8, Capture Mode only), then **End Capture Mode**.
3. Project Screen:
   - **Find Text** — draw a rectangle; manga-ocr fills **Original text**.
   - **Auto Find Text** — detect bubbles + OCR the whole page (one undoable
     action). Confirms before replacing existing rectangles. Translation is
     Phase 4.
   - Edit / move / resize / delete rectangles; Mark Reviewed; reading-order
     badges (click to renumber).
   - **Export Image** / **Export Project** — white box + auto-shrunk English
     over rectangles that have translated text.
4. Ctrl+Z / Ctrl+Y undo and redo.

## On-disk layout

```
<main project directory>/
  <project name>/
    project.json
    journal.jsonl
    capture_001.png
    capture_001_export.png
    exports/
```

## Architecture

- **Renderer** — project state + session-only undo stack (source of truth).
- **Main process** — persistence, capture, export writers, Python sidecar IPC.
- **Python sidecar** — JSON-lines over stdin/stdout; lazy-loads YOLO + manga-ocr.

## Platform notes / limitations

- Windows 10/11 primary. Ubuntu capture/hotkey need X11 (not Wayland).
- Keep the app window clear of the capture region.
- Deleted page files stay on disk until clean quit so undo can restore them.
- Auto Translate (per-rectangle and page-level English fill) is Phase 4.
