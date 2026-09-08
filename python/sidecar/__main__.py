"""
JSON-lines sidecar for Comic Reader Phase 3.

Protocol (one JSON object per line on stdin / stdout):
  Request:  {"id": "...", "cmd": "ping"|"ocr_region"|"detect_and_ocr"|"cancel"|"shutdown", ...}
  Response: {"id": "...", "ok": true|false, "result": {...} | "error": "..."}
  Progress: {"type": "progress", "id": "...", "stage": "...", "current": N, "total": M, "message": "..."}

Models load lazily on first use so the process starts quickly.
"""

from __future__ import annotations

import json
import sys
import threading
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

YOLO_MODEL_URL = (
    "https://huggingface.co/ogkalu/comic-speech-bubble-detector-yolov8m/"
    "resolve/main/comic-speech-bubble-detector.pt"
)
YOLO_MODEL_PATH = MODELS_DIR / "comic-speech-bubble-detector.pt"

_cancel = threading.Event()
_mocr = None
_detector = None
_lock = threading.Lock()


def log(msg: str) -> None:
    print(json.dumps({"type": "log", "message": msg}), flush=True)


def respond(req_id: str, ok: bool, result: Any = None, error: str | None = None) -> None:
    payload: dict[str, Any] = {"id": req_id, "ok": ok}
    if ok:
        payload["result"] = result
    else:
        payload["error"] = error or "unknown error"
    print(json.dumps(payload), flush=True)


def progress(req_id: str, stage: str, current: int, total: int, message: str) -> None:
    print(
        json.dumps(
            {
                "type": "progress",
                "id": req_id,
                "stage": stage,
                "current": current,
                "total": total,
                "message": message,
            }
        ),
        flush=True,
    )


def ensure_yolo_weights() -> Path:
    if YOLO_MODEL_PATH.exists() and YOLO_MODEL_PATH.stat().st_size > 1_000_000:
        return YOLO_MODEL_PATH
    log(f"Downloading bubble detector to {YOLO_MODEL_PATH}")
    import urllib.request

    tmp = YOLO_MODEL_PATH.with_suffix(".pt.partial")
    urllib.request.urlretrieve(YOLO_MODEL_URL, tmp)
    tmp.replace(YOLO_MODEL_PATH)
    return YOLO_MODEL_PATH


def get_ocr():
    global _mocr
    with _lock:
        if _mocr is None:
            log("Loading manga-ocr model (first run downloads weights)…")
            from manga_ocr import MangaOcr

            _mocr = MangaOcr()
            log("manga-ocr ready")
        return _mocr


def get_detector():
    global _detector
    with _lock:
        if _detector is None:
            from ultralytics import YOLO

            path = ensure_yolo_weights()
            log(f"Loading YOLO detector from {path}")
            _detector = YOLO(str(path))
            log("detector ready")
        return _detector

def cmd_ping(req: dict[str, Any]) -> dict[str, Any]:
    return {"status": "ready"}

def cmd_init(req: dict[str, Any]) -> dict[str, Any]:
    get_ocr()
    get_detector()
    return {"status": "ready"}

def cmd_ocr_region(req: dict[str, Any]) -> dict[str, Any]:
    from PIL import Image

    image_path = Path(req["imagePath"])
    b = req["bounds"]
    x, y, w, h = int(b["x"]), int(b["y"]), int(b["w"]), int(b["h"])
    if w < 2 or h < 2:
        return {"text": "", "failed": True, "error": "region too small"}

    img = Image.open(image_path).convert("RGB")
    crop = img.crop((x, y, x + w, y + h))
    try:
        text = get_ocr()(crop)
        return {"text": text or "", "failed": False}
    except Exception as exc:  # noqa: BLE001 — surface as failed region
        return {"text": "", "failed": True, "error": str(exc)}


def detect_boxes(image_path: Path) -> list[dict[str, int]]:
    """Return bubble bounding boxes in image pixel coords as {x,y,w,h}."""
    import numpy as np
    from PIL import Image

    detector = get_detector()
    img = Image.open(image_path).convert("RGB")
    results = detector.predict(source=np.array(img), verbose=False)
    boxes: list[dict[str, int]] = []
    if not results:
        return boxes
    result = results[0]
    if result.boxes is None:
        return boxes
    xyxy = result.boxes.xyxy.cpu().numpy()
    for row in xyxy:
        x1, y1, x2, y2 = [float(v) for v in row]
        x = max(0, int(round(x1)))
        y = max(0, int(round(y1)))
        w = max(1, int(round(x2 - x1)))
        h = max(1, int(round(y2 - y1)))
        boxes.append({"x": x, "y": y, "w": w, "h": h})
    return boxes


def cmd_detect_and_ocr(req: dict[str, Any]) -> dict[str, Any]:
    req_id = req["id"]
    image_path = Path(req["imagePath"])
    _cancel.clear()

    progress(req_id, "detect", 0, 1, "Detecting text bubbles…")
    if _cancel.is_set():
        return {"cancelled": True, "regions": []}

    boxes = detect_boxes(image_path)
    progress(req_id, "detect", 1, 1, f"Found {len(boxes)} region(s)")

    regions: list[dict[str, Any]] = []
    total = max(len(boxes), 1)
    for i, bounds in enumerate(boxes):
        if _cancel.is_set():
            return {"cancelled": True, "regions": regions}
        progress(req_id, "ocr", i + 1, total, f"Reading region {i + 1}/{len(boxes)}")
        ocr_result = cmd_ocr_region({"imagePath": str(image_path), "bounds": bounds})
        regions.append(
            {
                "bounds": bounds,
                "text": ocr_result.get("text", ""),
                "failed": bool(ocr_result.get("failed")),
                "error": ocr_result.get("error"),
            }
        )

    return {"cancelled": False, "regions": regions}


def cmd_cancel(_req: dict[str, Any]) -> dict[str, Any]:
    _cancel.set()
    return {"cancelled": True}


def handle(req: dict[str, Any]) -> None:
    req_id = str(req.get("id", ""))
    cmd = req.get("cmd")
    try:
        if cmd == "ping":
            respond(req_id, True, cmd_ping(req))
        elif cmd == "init":
            respond(req_id, True, cmd_init(req))
        elif cmd == "ocr_region":
            respond(req_id, True, cmd_ocr_region(req))
        elif cmd == "detect_and_ocr":
            respond(req_id, True, cmd_detect_and_ocr(req))
        elif cmd == "cancel":
            respond(req_id, True, cmd_cancel(req))
        elif cmd == "shutdown":
            respond(req_id, True, {"bye": True})
            raise SystemExit(0)
        else:
            respond(req_id, False, error=f"unknown cmd: {cmd}")
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        respond(req_id, False, error=f"{exc}\n{traceback.format_exc()}")


def main() -> None:
    log("sidecar starting")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            respond("", False, error=f"invalid json: {exc}")
            continue
        handle(req)


if __name__ == "__main__":
    main()
