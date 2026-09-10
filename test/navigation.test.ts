import { beforeAll, describe, expect, it } from 'vitest';
import { computeReadingOrder } from '../src/renderer/src/state/readingOrder';
import { useAppStore } from '../src/renderer/src/state/store';
import { emptyProject, Rect, TextRectangle } from '../src/shared/types';

let seq = 0;
function rect(id: string, bounds: Rect, over: Partial<TextRectangle> = {}): TextRectangle {
  return {
    id,
    bounds,
    originalText: '',
    translatedText: '',
    reviewed: false,
    readingOrderIndex: ++seq,
    failed: false,
    ...over
  };
}

function setupThreeRects(selectedId: string | null): void {
  const rects = computeReadingOrder([
    rect('a', { x: 300, y: 0, w: 50, h: 50 }),
    rect('b', { x: 100, y: 0, w: 50, h: 50 }),
    rect('c', { x: 0, y: 0, w: 50, h: 50 })
  ]);
  // Reading order: a=1, b=2, c=3.
  useAppStore.setState({
    projectName: 'proj',
    project: { ...emptyProject(), images: [{ file: 'a.png', rectangles: rects }] },
    selectedImage: 'a.png',
    selectedRectangleId: selectedId
  });
}

function currentRect(id: string): TextRectangle {
  return useAppStore
    .getState()
    .project!.images[0].rectangles.find((r) => r.id === id)!;
}

beforeAll(() => {
  // persistAutosave fires fire-and-forget; stub the bridge.
  (globalThis as { window?: unknown }).window = {
    api: { autosaveProject: async () => undefined }
  };
});

describe('store selectNextRectangle / reviewAndAdvance', () => {
  it('selects the first rectangle when nothing is selected', () => {
    setupThreeRects(null);
    useAppStore.getState().selectNextRectangle();
    expect(useAppStore.getState().selectedRectangleId).toBe('a');
  });

  it('advances and wraps in reading order', () => {
    setupThreeRects('b');
    useAppStore.getState().selectNextRectangle();
    expect(useAppStore.getState().selectedRectangleId).toBe('c');
    useAppStore.getState().selectNextRectangle();
    expect(useAppStore.getState().selectedRectangleId).toBe('a');
  });

  it('reviewAndAdvance marks reviewed and moves to the next rectangle', () => {
    setupThreeRects('a');
    useAppStore.getState().reviewAndAdvance();
    expect(currentRect('a').reviewed).toBe(true);
    expect(useAppStore.getState().selectedRectangleId).toBe('b');
  });

  it('reviewAndAdvance never un-reviews an already reviewed rectangle', () => {
    setupThreeRects('a');
    useAppStore.getState().reviewAndAdvance(); // a reviewed, selection -> b
    useAppStore.getState().reviewAndAdvance(); // b reviewed, selection -> c
    useAppStore.getState().reviewAndAdvance(); // c reviewed, selection wraps -> a
    expect(useAppStore.getState().selectedRectangleId).toBe('a');
    useAppStore.getState().reviewAndAdvance(); // a already reviewed: stays reviewed, advances
    expect(currentRect('a').reviewed).toBe(true);
    expect(useAppStore.getState().selectedRectangleId).toBe('b');
  });

  it('reviewAndAdvance with no selection just selects the first rectangle', () => {
    setupThreeRects(null);
    useAppStore.getState().reviewAndAdvance();
    expect(useAppStore.getState().selectedRectangleId).toBe('a');
    expect(currentRect('a').reviewed).toBe(false);
  });
});
