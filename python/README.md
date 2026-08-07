# Comic Reader Python Sidecar (Phase 3)

Local Python process that performs bubble detection (YOLOv8 comic-speech-bubble
detector) and Japanese OCR (manga-ocr). The Electron main process talks to it
over stdin/stdout using JSON lines.

## Setup

Requires Python 3.10–3.12. From this directory:

```powershell
# Prefer a project venv; fall back to a system/portable Python
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\pip.exe install -r requirements.txt
```

For CPU-only torch on Windows (recommended):

```powershell
.\.venv\Scripts\pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\pip.exe install -r requirements.txt
```

First OCR / detect call downloads model weights into `models/` and the
HuggingFace cache (~500MB total).

## Protocol

See `sidecar/__main__.py`. Commands: `ping`, `ocr_region`, `detect_and_ocr`,
`cancel`, `shutdown`.

## Manual smoke test

```powershell
.\.venv\Scripts\python.exe -m sidecar
# then type: {"id":"1","cmd":"ping"}
```
