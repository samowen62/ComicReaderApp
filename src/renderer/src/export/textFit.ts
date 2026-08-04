/**
 * Pure text-layout logic for export compositing (spec 10.1). Kept free of DOM
 * references so it is unit-testable under Node; the canvas code injects real
 * measurers.
 */

export type Measurer = (text: string) => number;

export const LINE_HEIGHT = 1.15;
export const MIN_FONT_PX = 8;

/** Greedy word wrap; over-long words are broken by character. */
export function wrapText(text: string, maxWidth: number, measure: Measurer): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      // Word alone is too wide: break it by character.
      let chunk = '';
      for (const ch of word) {
        if (measure(chunk + ch) <= maxWidth) {
          chunk += ch;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Largest font size (<= startPx) whose wrapped text fits the box, or
 * MIN_FONT_PX if nothing fits. measureAt(size) yields a Measurer for that size.
 */
export function chooseFontSize(
  text: string,
  boxW: number,
  boxH: number,
  startPx: number,
  measureAt: (sizePx: number) => Measurer
): number {
  for (let size = Math.floor(startPx); size >= MIN_FONT_PX; size--) {
    const measure = measureAt(size);
    const lines = wrapText(text, boxW, measure);
    const fitsHeight = lines.length * size * LINE_HEIGHT <= boxH;
    const fitsWidth = lines.every((l) => measure(l) <= boxW);
    if (fitsHeight && fitsWidth) return size;
  }
  return MIN_FONT_PX;
}
