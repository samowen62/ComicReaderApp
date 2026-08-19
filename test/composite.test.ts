import { describe, expect, it } from 'vitest';
import { scaleRectAboutCenter } from '../src/renderer/src/export/rectScale';

describe('scaleRectAboutCenter', () => {
  it('shrinks width and height about the center at 0.7', () => {
    const result = scaleRectAboutCenter({ x: 10, y: 20, w: 100, h: 50 }, 0.7);
    expect(result.w).toBeCloseTo(70);
    expect(result.h).toBeCloseTo(35);
    expect(result.x).toBeCloseTo(25);
    expect(result.y).toBeCloseTo(27.5);
  });

  it('leaves the rect unchanged at scale 1', () => {
    const rect = { x: 5, y: 8, w: 40, h: 30 };
    expect(scaleRectAboutCenter(rect, 1)).toEqual(rect);
  });

  it('falls back to scale 1 for non-finite or non-positive values', () => {
    const rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(scaleRectAboutCenter(rect, 0)).toEqual(rect);
    expect(scaleRectAboutCenter(rect, -1)).toEqual(rect);
    expect(scaleRectAboutCenter(rect, Number.NaN)).toEqual(rect);
  });
});
