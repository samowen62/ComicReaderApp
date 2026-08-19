import { Rect } from '../../../shared/types';

/** Shrink (or grow) a rectangle about its center by `scale` (e.g. 0.7). */
export function scaleRectAboutCenter(rect: Rect, scale: number): Rect {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const nw = Math.max(1, rect.w * s);
  const nh = Math.max(1, rect.h * s);
  return {
    x: rect.x + (rect.w - nw) / 2,
    y: rect.y + (rect.h - nh) / 2,
    w: nw,
    h: nh
  };
}
