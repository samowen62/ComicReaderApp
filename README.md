# Comic Reader (Comic Translator)

Desktop app for capturing manga pages from the screen, translating the Japanese
text to English, and exporting the translated pages. See
`../ComicTranslatorSoftwareDescription_v2.md` for the full specification.

**Current state: Phase 4** — full capture → detect → OCR → translate → export
loop. Translation providers are pluggable (DeepL, Google Cloud, OpenAI-compatible
LLM with page context, LibreTranslate).

## Stack

- Electron + React 18 + TypeScript (electron-vite)
- zustand for renderer state
- Python sidecar: manga-ocr + Ultralytics YOLOv8 comic-speech-bubble detector
- Translation providers in the Electron main process (HTTP APIs)
- archiver for .zip/.cbz export
- Vitest for unit tests

## Setup

```bash
npm install

# Python sidecar (once) — see python/README.md
cd python
python -m venv .venv
.\.venv\Scripts\pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\pip.exe install -r requirements.txt
cd ..

npm run dev
npm test
npm run build
```

Configure a translation provider under **Settings** (API key required for
DeepL / Google / OpenAI-compatible). On Windows, install a Japanese IME so the
Original-text field can switch to Hiragana on focus. **Export text box scale**
(default 70%) shrinks composited white boxes about their center.

## Usage

1. Capture pages (Capture Mode + hotkey).
2. **Auto Translate Page** — detect bubbles, OCR Japanese, translate with page
   context in one undoable action.
3. Or **Find Text** to draw a region (auto OCR), then **Auto Translate** on the
   selected rectangle (sends full page context; applies only that bubble).
4. Edit / Mark Reviewed / Export Image or Export Project (.zip / .cbz).
   F2 selects the next textbox (reading order, wraps); F3 marks the current
   textbox reviewed and advances — both work even while typing.
5. Zoom/pan the page viewer with Ctrl+wheel, middle-drag or Space+drag, or the
   Zoom − / Zoom + / Reset view toolbar buttons (view persists across pages).

## Providers

| Provider | Notes |
| --- | --- |
| DeepL | Default. Free keys (`:fx`) use api-free.deepl.com. |
| Google Cloud Translation | API key from Google Cloud. |
| OpenAI-compatible | Best page-context awareness via LLM. Set model + optional base URL. |
| LibreTranslate | Optional key; quality varies; per-segment failures continue. |

## Architecture

- Renderer = project state + undo stack
- Main = persistence, capture, export, translation HTTP, Python sidecar IPC
- Python sidecar = detect + manga-ocr over JSON lines
