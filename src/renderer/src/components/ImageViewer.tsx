import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rect, TextRectangle } from '../../../shared/types';
import { mediaUrl } from '../media';
import { useAppStore } from '../state/store';

const MIN_SIZE_PX = 4;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
type Handle = 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  kind: 'move' | 'draw' | 'pan';
  id?: string;
  handle?: Handle;
  startX: number;
  startY: number;
  origin: Rect;
  current: Rect;
  panOrigin?: { x: number; y: number };
}

/**
 * Displays the selected image with text rectangles overlaid. Coordinates are
 * stored in image pixels. Fit-to-container × user zoom + pan are applied as a
 * CSS transform; pointer events are mapped back through the inverse.
 */
export function ImageViewer(): React.JSX.Element {
  const store = useAppStore();
  const {
    settings,
    projectName,
    project,
    selectedImage,
    selectedRectangleId,
    drawMode,
    viewerZoom,
    viewerPan
  } = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const image = project?.images.find((i) => i.file === selectedImage) ?? null;

  // Reset per-image ephemeral UI only — zoom/pan persist across images.
  useEffect(() => {
    setNatural(null);
    setDrag(null);
    setEditingBadgeId(null);
  }, [selectedImage]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const fitScale =
    natural && containerSize.w > 0 && containerSize.h > 0
      ? Math.min(containerSize.w / natural.w, containerSize.h / natural.h)
      : 1;
  const totalScale = fitScale * viewerZoom;

  const toImagePoint = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || totalScale === 0) return { x: 0, y: 0 };
      return {
        x: (e.clientX - box.left - viewerPan.x) / totalScale,
        y: (e.clientY - box.top - viewerPan.y) / totalScale
      };
    },
    [totalScale, viewerPan.x, viewerPan.y]
  );

  const clampRect = useCallback(
    (r: Rect): Rect => {
      if (!natural) return r;
      const w = Math.min(Math.max(MIN_SIZE_PX, r.w), natural.w);
      const h = Math.min(Math.max(MIN_SIZE_PX, r.h), natural.h);
      return {
        x: Math.min(Math.max(0, r.x), natural.w - w),
        y: Math.min(Math.max(0, r.y), natural.h - h),
        w,
        h
      };
    },
    [natural]
  );

  /** Overlap rule: the rectangle whose center is closest to the click wins. */
  const hitTest = useCallback(
    (px: { x: number; y: number }): TextRectangle | null => {
      if (!image) return null;
      let best: TextRectangle | null = null;
      let bestDist = Infinity;
      for (const rect of image.rectangles) {
        const { x, y, w, h } = rect.bounds;
        if (px.x < x || px.x > x + w || px.y < y || px.y > y + h) continue;
        const dist = Math.hypot(px.x - (x + w / 2), px.y - (y + h / 2));
        if (dist < bestDist) {
          bestDist = dist;
          best = rect;
        }
      }
      return best;
    },
    [image]
  );

  const onWheel = (e: React.WheelEvent) => {
    if (!natural || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    const cx = e.clientX - box.left;
    const cy = e.clientY - box.top;
    const oldTotal = totalScale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewerZoom * factor));
    const newTotal = fitScale * newZoom;
    if (newTotal === 0 || oldTotal === 0) return;
    const imgX = (cx - viewerPan.x) / oldTotal;
    const imgY = (cy - viewerPan.y) / oldTotal;
    store.setViewerZoom(newZoom);
    store.setViewerPan({
      x: cx - imgX * newTotal,
      y: cy - imgY * newTotal
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image || !natural) return;
    const panGesture = e.button === 1 || (e.button === 0 && spaceHeld);
    if (panGesture) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origin: { x: 0, y: 0, w: 0, h: 0 },
        current: { x: 0, y: 0, w: 0, h: 0 },
        panOrigin: { ...viewerPan }
      });
      return;
    }
    if (e.button !== 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImagePoint(e);

    if (drawMode) {
      setDrag({
        kind: 'draw',
        startX: p.x,
        startY: p.y,
        origin: { x: p.x, y: p.y, w: 0, h: 0 },
        current: { x: p.x, y: p.y, w: 0, h: 0 }
      });
      return;
    }

    const hit = hitTest(p);
    if (!hit) {
      store.selectRectangle(null);
      return;
    }
    store.selectRectangle(hit.id);
    setDrag({
      kind: 'move',
      id: hit.id,
      startX: p.x,
      startY: p.y,
      origin: hit.bounds,
      current: hit.bounds
    });
  };

  const onHandleDown = (e: React.PointerEvent, rect: TextRectangle, handle: Handle) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImagePoint(e);
    setDrag({
      kind: 'move',
      id: rect.id,
      handle,
      startX: p.x,
      startY: p.y,
      origin: rect.bounds,
      current: rect.bounds
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'pan' && drag.panOrigin) {
      store.setViewerPan({
        x: drag.panOrigin.x + (e.clientX - drag.startX),
        y: drag.panOrigin.y + (e.clientY - drag.startY)
      });
      return;
    }

    const p = toImagePoint(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;

    if (drag.kind === 'draw') {
      setDrag({
        ...drag,
        current: {
          x: Math.min(drag.startX, p.x),
          y: Math.min(drag.startY, p.y),
          w: Math.abs(dx),
          h: Math.abs(dy)
        }
      });
      return;
    }

    const o = drag.origin;
    let next: Rect;
    if (!drag.handle) {
      next = { x: o.x + dx, y: o.y + dy, w: o.w, h: o.h };
    } else {
      next = resizeFromHandle(o, drag.handle, dx, dy);
    }
    setDrag({ ...drag, current: clampRect(next) });
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.kind === 'draw') {
      const r = drag.current;
      if (r.w >= MIN_SIZE_PX && r.h >= MIN_SIZE_PX) {
        void store.addRectangleWithOcr(clampRect(r));
      }
    } else if (drag.kind === 'move' && drag.id) {
      store.moveResizeRectangle(drag.id, clampRect(drag.current));
    }
    setDrag(null);
  };

  if (!projectName || !settings || !image) {
    return (
      <div className="viewer" ref={containerRef}>
        <p className="muted">No image selected. Capture pages with Add Pages.</p>
      </div>
    );
  }

  const boundsFor = (rect: TextRectangle): Rect =>
    drag && drag.kind === 'move' && drag.id === rect.id ? drag.current : rect.bounds;

  const stageClass =
    'viewer-stage' +
    (drawMode ? ' viewer-stage-draw' : '') +
    (spaceHeld || drag?.kind === 'pan' ? ' viewer-stage-pan' : '');

  return (
    <div
      className="viewer"
      ref={containerRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {natural && totalScale > 0 && (
        <div
          ref={wrapperRef}
          className={stageClass}
          style={{
            width: natural.w,
            height: natural.h,
            transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${totalScale})`,
            transformOrigin: '0 0'
          }}
        >
          <img
            className="viewer-image"
            src={mediaUrl(settings.mainProjectDir ?? '', projectName, image.file)}
            alt={image.file}
            draggable={false}
            onLoad={(e) =>
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
          />
          <div className="rect-layer">
            {image.rectangles.map((rect) => {
              const b = boundsFor(rect);
              const selected = rect.id === selectedRectangleId;
              const cls =
                'text-rect' +
                (selected ? ' text-rect-selected' : '') +
                (rect.failed ? ' text-rect-failed' : '');
              return (
                <div
                  key={rect.id}
                  className={cls}
                  style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
                  title={rect.failed ? 'Last operation failed — retry or enter text manually' : undefined}
                >
                  {editingBadgeId === rect.id ? (
                    <input
                      className="rect-badge-input"
                      type="number"
                      min={1}
                      max={image.rectangles.length}
                      defaultValue={rect.readingOrderIndex}
                      autoFocus
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const value = parseInt(e.currentTarget.value, 10);
                          if (!Number.isNaN(value)) store.renumberRectangle(rect.id, value);
                          setEditingBadgeId(null);
                        } else if (e.key === 'Escape') {
                          setEditingBadgeId(null);
                        }
                      }}
                      onBlur={() => setEditingBadgeId(null)}
                    />
                  ) : (
                    <span
                      className="rect-badge"
                      title="Reading order — click to renumber"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingBadgeId(rect.id);
                      }}
                    >
                      {rect.readingOrderIndex}
                    </span>
                  )}
                  {rect.reviewed && <span className="rect-reviewed">✓</span>}
                  {selected &&
                    (['nw', 'ne', 'sw', 'se'] as Handle[]).map((handle) => (
                      <span
                        key={handle}
                        className={`rect-handle rect-handle-${handle}`}
                        onPointerDown={(e) => onHandleDown(e, rect, handle)}
                      />
                    ))}
                </div>
              );
            })}
            {drag?.kind === 'draw' && (
              <div className="text-rect text-rect-draw" style={rectStyle(drag.current)} />
            )}
          </div>
        </div>
      )}
      {!natural && (
        <img
          className="viewer-image-probe"
          src={mediaUrl(settings.mainProjectDir ?? '', projectName, image.file)}
          alt=""
          onLoad={(e) =>
            setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }
        />
      )}
      {!natural && <p className="muted">Loading…</p>}
    </div>
  );
}

function rectStyle(r: Rect): React.CSSProperties {
  return { left: r.x, top: r.y, width: r.w, height: r.h };
}

function resizeFromHandle(origin: Rect, handle: Handle, dx: number, dy: number): Rect {
  let { x, y, w, h } = origin;
  if (handle === 'nw' || handle === 'sw') {
    x = origin.x + dx;
    w = origin.w - dx;
  } else {
    w = origin.w + dx;
  }
  if (handle === 'nw' || handle === 'ne') {
    y = origin.y + dy;
    h = origin.h - dy;
  } else {
    h = origin.h + dy;
  }
  if (w < MIN_SIZE_PX) {
    if (handle === 'nw' || handle === 'sw') x = origin.x + origin.w - MIN_SIZE_PX;
    w = MIN_SIZE_PX;
  }
  if (h < MIN_SIZE_PX) {
    if (handle === 'nw' || handle === 'ne') y = origin.y + origin.h - MIN_SIZE_PX;
    h = MIN_SIZE_PX;
  }
  return { x, y, w, h };
}
