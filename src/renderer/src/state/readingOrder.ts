import { TextRectangle } from '../../../shared/types';

/**
 * Standard manga reading order (spec v2 section 6.5): rightmost column first,
 * top-to-bottom within a column. Rectangles whose horizontal centers overlap
 * (within a tolerance) are treated as the same column.
 */
export function computeReadingOrder(rectangles: TextRectangle[]): TextRectangle[] {
  const sorted = [...rectangles].sort((a, b) => {
    const colA = columnKey(a);
    const colB = columnKey(b);
    if (colA !== colB) return colB - colA; // rightmost column first
    return a.bounds.y - b.bounds.y; // then top to bottom
  });
  return sorted.map((rect, i) => ({ ...rect, readingOrderIndex: i + 1 }));
}

/**
 * Buckets rectangles into columns of roughly aligned centers so two stacked
 * bubbles on the right read before a full-height bubble slightly left of them.
 */
function columnKey(rect: TextRectangle): number {
  const centerX = rect.bounds.x + rect.bounds.w / 2;
  const bucketWidth = Math.max(64, rect.bounds.w);
  return Math.round(centerX / bucketWidth);
}

/**
 * Moves a rectangle to a new 1-based reading-order position and renormalizes
 * all indices to a contiguous sequence (spec v2 section 6.5).
 */
export function renumber(
  rectangles: TextRectangle[],
  id: string,
  newIndex: number
): TextRectangle[] {
  const ordered = [...rectangles].sort((a, b) => a.readingOrderIndex - b.readingOrderIndex);
  const from = ordered.findIndex((r) => r.id === id);
  if (from < 0) return rectangles;
  const clamped = Math.min(Math.max(newIndex, 1), ordered.length);
  const [moved] = ordered.splice(from, 1);
  ordered.splice(clamped - 1, 0, moved);
  const indexOf = new Map(ordered.map((r, i) => [r.id, i + 1]));
  return rectangles.map((r) => ({ ...r, readingOrderIndex: indexOf.get(r.id) ?? r.readingOrderIndex }));
}

/**
 * Next rectangle id in reading order with wrap-around (F2/F3 navigation).
 * Empty list → null; no/stale current id → first; last → wraps to first.
 */
export function nextRectangleId(
  rectangles: TextRectangle[],
  currentId: string | null
): string | null {
  if (rectangles.length === 0) return null;
  const ordered = [...rectangles].sort((a, b) => a.readingOrderIndex - b.readingOrderIndex);
  const from = currentId ? ordered.findIndex((r) => r.id === currentId) : -1;
  if (from < 0) return ordered[0].id;
  return ordered[(from + 1) % ordered.length].id;
}
