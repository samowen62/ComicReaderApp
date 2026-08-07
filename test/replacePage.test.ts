import { describe, expect, it } from 'vitest';
import { applyActionToProject, revertActionFromProject } from '../src/renderer/src/state/actions';
import { emptyProject, ProjectAction, TextRectangle } from '../src/shared/types';

function rect(id: string, over: Partial<TextRectangle> = {}): TextRectangle {
  return {
    id,
    bounds: { x: 0, y: 0, w: 40, h: 40 },
    originalText: '',
    translatedText: '',
    reviewed: false,
    readingOrderIndex: 0,
    failed: false,
    ...over
  };
}

describe('ReplacePageRectangles', () => {
  it('replaces all rectangles on a page and reverts to the previous set', () => {
    const previous = [rect('old', { originalText: '旧', readingOrderIndex: 1 })];
    const project = {
      ...emptyProject(),
      images: [{ file: 'a.png', rectangles: previous }]
    };
    const action: ProjectAction = {
      type: 'ReplacePageRectangles',
      imageFile: 'a.png',
      previousRectangles: previous,
      newRectangles: [
        rect('n1', { bounds: { x: 200, y: 0, w: 40, h: 40 }, originalText: '右' }),
        rect('n2', { bounds: { x: 0, y: 0, w: 40, h: 40 }, originalText: '左' })
      ]
    };
    const applied = applyActionToProject(project, action);
    const next = applied.images[0].rectangles;
    expect(next).toHaveLength(2);
    // Right column first.
    expect(next.find((r) => r.id === 'n1')!.readingOrderIndex).toBe(1);
    expect(next.find((r) => r.id === 'n2')!.readingOrderIndex).toBe(2);

    const reverted = revertActionFromProject(applied, action);
    expect(reverted.images[0].rectangles.map((r) => r.id)).toEqual(['old']);
  });
});
