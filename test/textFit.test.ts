import { describe, expect, it } from 'vitest';
import { chooseFontSize, MIN_FONT_PX, wrapText } from '../src/renderer/src/export/textFit';

/** Unit-width measurer: every character is 1 unit wide. */
const unit = (s: string) => s.length;

describe('wrapText', () => {
  it('wraps on word boundaries', () => {
    expect(wrapText('hello world', 5, unit)).toEqual(['hello', 'world']);
  });

  it('keeps text on one line when it fits', () => {
    expect(wrapText('hello world', 11, unit)).toEqual(['hello world']);
  });

  it('breaks over-long words by character', () => {
    expect(wrapText('abcdefghij', 4, unit)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('preserves paragraph breaks', () => {
    expect(wrapText('ab\ncd', 10, unit)).toEqual(['ab', 'cd']);
  });
});

describe('chooseFontSize', () => {
  // Width scales linearly with font size for this fake measurer.
  const measureAt = (size: number) => (s: string) => s.length * size;

  it('returns the start size when the text already fits', () => {
    expect(chooseFontSize('ab', 100, 100, 40, measureAt)).toBe(40);
  });

  it('shrinks until the wrapped text fits', () => {
    // 'abcdef' in a 30-wide box: sizes >= 16 wrap to six 1-char lines
    // (6 * size * 1.15 > 100 height), size 15 wraps to three 2-char lines
    // (3 * 15 * 1.15 = 51.75 <= 100, each 30 wide) — fits.
    expect(chooseFontSize('abcdef', 30, 100, 40, measureAt)).toBe(15);
  });

  it('respects box height when choosing a size', () => {
    // 'aaaa' in a 40x40 box: sizes 20..18 wrap to two 2-char lines whose
    // height (2 * size * 1.15) exceeds 40; size 17 gives 39.1 — fits.
    expect(chooseFontSize('aaaa', 40, 40, 20, measureAt)).toBe(17);
  });

  it('returns MIN_FONT_PX when nothing fits', () => {
    const long = 'a'.repeat(200);
    expect(chooseFontSize(long, 10, 10, 40, measureAt)).toBe(MIN_FONT_PX);
  });
});
