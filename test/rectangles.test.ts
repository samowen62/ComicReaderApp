import { describe, expect, it } from 'vitest';
import { applyActionToProject, revertActionFromProject } from '../src/renderer/src/state/actions';
import { computeReadingOrder, renumber } from '../src/renderer/src/state/readingOrder';
import { emptyProject, Project, ProjectAction, Rect, TextRectangle } from '../src/shared/types';

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

function projectWith(rects: TextRectangle[]): Project {
  return { ...emptyProject(), images: [{ file: 'a.png', rectangles: rects }] };
}

function rectsOf(project: Project): TextRectangle[] {
  return project.images[0].rectangles;
}

describe('computeReadingOrder', () => {
  it('orders right column first, top-to-bottom within a column', () => {
    const right = rect('right', { x: 900, y: 0, w: 100, h: 100 });
    const leftTop = rect('leftTop', { x: 100, y: 0, w: 100, h: 100 });
    const leftBottom = rect('leftBottom', { x: 100, y: 200, w: 100, h: 100 });
    const ordered = computeReadingOrder([leftBottom, right, leftTop]);
    const indexOf = (id: string) => ordered.find((r) => r.id === id)!.readingOrderIndex;
    expect(indexOf('right')).toBe(1);
    expect(indexOf('leftTop')).toBe(2);
    expect(indexOf('leftBottom')).toBe(3);
  });
});

describe('renumber', () => {
  it('moves a rectangle to a new position and renormalizes', () => {
    const ordered = computeReadingOrder([
      rect('a', { x: 300, y: 0, w: 50, h: 50 }),
      rect('b', { x: 100, y: 0, w: 50, h: 50 }),
      rect('c', { x: 0, y: 0, w: 50, h: 50 })
    ]);
    const result = renumber(ordered, 'c', 1);
    const indexOf = (id: string) => result.find((r) => r.id === id)!.readingOrderIndex;
    expect(indexOf('c')).toBe(1);
    expect(indexOf('a')).toBe(2);
    expect(indexOf('b')).toBe(3);
  });

  it('clamps out-of-range positions', () => {
    const ordered = computeReadingOrder([
      rect('a', { x: 300, y: 0, w: 50, h: 50 }),
      rect('b', { x: 100, y: 0, w: 50, h: 50 })
    ]);
    const result = renumber(ordered, 'a', 99);
    expect(result.find((r) => r.id === 'a')!.readingOrderIndex).toBe(2);
  });
});

describe('rectangle user actions', () => {
  it('AddRectangle assigns a reading order and reverts cleanly', () => {
    const project = projectWith([rect('r1', { x: 100, y: 0, w: 50, h: 50 }, { readingOrderIndex: 1 })]);
    const added = rect('r2', { x: 900, y: 0, w: 50, h: 50 }, { readingOrderIndex: 0 });
    const action: ProjectAction = { type: 'AddRectangle', imageFile: 'a.png', rectangle: added };
    const applied = applyActionToProject(project, action);
    // r2 is rightmost, so it becomes first in reading order.
    expect(rectsOf(applied).find((r) => r.id === 'r2')!.readingOrderIndex).toBe(1);
    expect(rectsOf(applied).find((r) => r.id === 'r1')!.readingOrderIndex).toBe(2);
    const reverted = revertActionFromProject(applied, action);
    expect(rectsOf(reverted).map((r) => r.id)).toEqual(['r1']);
  });

  it('DeleteRectangle removes and restores at index', () => {
    const base = computeReadingOrder([
      rect('r1', { x: 300, y: 0, w: 50, h: 50 }),
      rect('r2', { x: 100, y: 0, w: 50, h: 50 })
    ]);
    const project = projectWith(base);
    const action: ProjectAction = {
      type: 'DeleteRectangle',
      imageFile: 'a.png',
      rectangle: base[1],
      index: 1
    };
    const applied = applyActionToProject(project, action);
    expect(rectsOf(applied).map((r) => r.id)).toEqual(['r1']);
    const reverted = revertActionFromProject(applied, action);
    expect(rectsOf(reverted).map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('MoveResizeRectangle applies and reverts bounds', () => {
    const project = projectWith([rect('r1', { x: 10, y: 10, w: 50, h: 50 })]);
    const action: ProjectAction = {
      type: 'MoveResizeRectangle',
      imageFile: 'a.png',
      id: 'r1',
      previousBounds: { x: 10, y: 10, w: 50, h: 50 },
      newBounds: { x: 40, y: 60, w: 80, h: 30 }
    };
    expect(rectsOf(applyActionToProject(project, action))[0].bounds).toEqual({
      x: 40,
      y: 60,
      w: 80,
      h: 30
    });
    expect(rectsOf(revertActionFromProject(applyActionToProject(project, action), action))[0].bounds).toEqual({
      x: 10,
      y: 10,
      w: 50,
      h: 50
    });
  });

  it('EditRectangleText applies and reverts per field', () => {
    const project = projectWith([rect('r1', { x: 0, y: 0, w: 50, h: 50 })]);
    const action: ProjectAction = {
      type: 'EditRectangleText',
      imageFile: 'a.png',
      id: 'r1',
      field: 'translatedText',
      previousValue: '',
      newValue: 'Hello'
    };
    expect(rectsOf(applyActionToProject(project, action))[0].translatedText).toBe('Hello');
    expect(rectsOf(revertActionFromProject(applyActionToProject(project, action), action))[0].translatedText).toBe('');
  });

  it('ToggleReviewed flips and restores', () => {
    const project = projectWith([rect('r1', { x: 0, y: 0, w: 50, h: 50 })]);
    const action: ProjectAction = {
      type: 'ToggleReviewed',
      imageFile: 'a.png',
      id: 'r1',
      previousValue: false
    };
    expect(rectsOf(applyActionToProject(project, action))[0].reviewed).toBe(true);
    expect(rectsOf(revertActionFromProject(applyActionToProject(project, action), action))[0].reviewed).toBe(false);
  });

  it('RenumberRectangle applies and reverts', () => {
    const base = computeReadingOrder([
      rect('r1', { x: 300, y: 0, w: 50, h: 50 }),
      rect('r2', { x: 100, y: 0, w: 50, h: 50 })
    ]);
    const project = projectWith(base);
    const action: ProjectAction = {
      type: 'RenumberRectangle',
      imageFile: 'a.png',
      id: 'r2',
      previousIndex: 2,
      newIndex: 1
    };
    const applied = applyActionToProject(project, action);
    expect(rectsOf(applied).find((r) => r.id === 'r2')!.readingOrderIndex).toBe(1);
    const reverted = revertActionFromProject(applied, action);
    expect(rectsOf(reverted).find((r) => r.id === 'r2')!.readingOrderIndex).toBe(2);
  });
});
