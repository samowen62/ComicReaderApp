import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rect, TextRectangle } from '../../../shared/types';
import { mediaUrl } from '../media';
import { useAppStore } from '../state/store';

const MIN_SIZE_PX = 4;
type Handle = 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  kind: 'move' | 'draw';
  id?: string;
  handle?: Handle;
  startX: number;
  startY: number;
  origin: Rect;
  current: Rect;
}

/**
 * Displays the selected image with its text rectangles overlaid (spec 6.3):
 * blue dashed outlines, red for the selection, badges for reading order and
 * reviewed state, click/drag/handle interactions, and Find Text draw mode.
 * Coordinates are stored in image pixels; the overlay maps them through the
 * current display scale.
 */
export function ImageViewer(): React.JSX.Element {
  const store = useAppStore();
  const { settings, projectName, project, selectedImage, selectedRectangleId, drawMode } = store;

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);

  const image = project?.images.find((i) => i.file === selectedImage) ?? null;

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

  const scale =
    natural && containerSize.w > 0 && containerSize.h > 0
      ? Math.min(containerSize.w / natural.w, containerSize.h / natural.h)
      : 0;

  const toImagePoint = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const box = wrapperRef.current?.getBoundingClientRect();
      if (!box || scale === 0) return { x: 0, y: 0 };
      return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
    },
    [scale]
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

  /** Overlap rule: the rectangle whose center is closest to the click wins (spec 6.3). */
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (!image || !natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImagePoint(e);

    if (drawMode) {
      setDrag({ kind: 'draw', startX: p.x, startY: p.y, origin: { x: p.x, y: p.y, w: 0, h: 0 }, current: { x: p.x, y: p.y, w: 0, h: 0 } });
      return;
    }

    const hit = hitTest(p);
    if (!hit) {
      // Click outside any rectangle deselects and clears the text boxes (spec 6.3).
      store.selectRectangle(null);
      return;
    }
    store.selectRectangle(hit.id);
    setDrag({ kind: 'move', id: hit.id, startX: p.x, startY: p.y, origin: hit.bounds, current: hit.bounds });
  };

  const onHandleDown = (e: React.PointerEvent, rect: TextRectangle, handle: Handle) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toImagePoint(e);
    setDrag({ kind: 'move', id: rect.id, handle, startX: p.x, startY: p.y, origin: rect.bounds, current: rect.bounds });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toImagePoint(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;

    if (drag.kind === 'draw') {
      const current = {
        x: Math.min(drag.startX, p.x),
        y: Math.min(drag.startY, p.y),
        w: Math.abs(dx),
        h: Math.abs(dy)
      };
      setDrag({ ...drag, current });
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
        store.addRectangle(clampRect(r));
      }
    } else if (drag.id) {
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

  const displayRect = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale });
  const boundsFor = (rect: TextRectangle): Rect =>
    drag && drag.kind === 'move' && drag.id === rect.id ? drag.current : rect.bounds;

  return (
    <div className="viewer" ref={containerRef}>
      {scale > 0 && natural && (
        <div
          ref={wrapperRef}
          className={'viewer-stage' + (drawMode ? ' viewer-stage-draw' : '')}
          style={{ width: natural.w * scale, height: natural.h * scale }}
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
          <div
            className="rect-layer"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {image.rectangles.map((rect) => {
              const b = displayRect(boundsFor(rect));
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
              <div className="text-rect text-rect-draw" style={rectStyle(displayRect(drag.current))} />
            )}
          </div>
        </div>
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
