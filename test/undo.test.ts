import { describe, expect, it } from 'vitest';
import { applyActionToProject, revertActionFromProject } from '../src/renderer/src/state/actions';
import {
  canRedo,
  canUndo,
  emptyUndoState,
  popRedo,
  popUndo,
  pushAction
} from '../src/renderer/src/state/undoStack';
import { CapturedImage, emptyProject, ProjectAction } from '../src/shared/types';

const img = (file: string): CapturedImage => ({ file, rectangles: [] });

describe('applyActionToProject / revertActionFromProject', () => {
  it('commits and reverts a capture session as one unit', () => {
    const project = { ...emptyProject(), images: [img('capture_001.png')] };
    const action: ProjectAction = {
      type: 'CommitCaptureSession',
      previousImages: [img('capture_001.png')],
      newImages: [img('capture_001.png'), img('capture_002.png')]
    };
    const applied = applyActionToProject(project, action);
    expect(applied.images.map((i) => i.file)).toEqual(['capture_001.png', 'capture_002.png']);
    const reverted = revertActionFromProject(applied, action);
    expect(reverted.images.map((i) => i.file)).toEqual(['capture_001.png']);
  });

  it('applies and reverts a reorder', () => {
    const project = { ...emptyProject(), images: [img('a.png'), img('b.png'), img('c.png')] };
    const action: ProjectAction = {
      type: 'ReorderImages',
      previousOrder: ['a.png', 'b.png', 'c.png'],
      newOrder: ['c.png', 'a.png', 'b.png']
    };
    const applied = applyActionToProject(project, action);
    expect(applied.images.map((i) => i.file)).toEqual(['c.png', 'a.png', 'b.png']);
    expect(revertActionFromProject(applied, action).images.map((i) => i.file)).toEqual([
      'a.png',
      'b.png',
      'c.png'
    ]);
  });

  it('restores a deleted image at its original index', () => {
    const project = { ...emptyProject(), images: [img('a.png'), img('b.png'), img('c.png')] };
    const action: ProjectAction = { type: 'DeleteImage', image: img('b.png'), index: 1 };
    const applied = applyActionToProject(project, action);
    expect(applied.images.map((i) => i.file)).toEqual(['a.png', 'c.png']);
    expect(revertActionFromProject(applied, action).images.map((i) => i.file)).toEqual([
      'a.png',
      'b.png',
      'c.png'
    ]);
  });

  it('navigation actions leave the project unchanged in both directions', () => {
    const project = { ...emptyProject(), images: [img('a.png')] };
    const action: ProjectAction = { type: 'NavigateImage', from: 'a.png', to: null };
    expect(applyActionToProject(project, action)).toBe(project);
    expect(revertActionFromProject(project, action)).toBe(project);
  });
});

describe('undo stack', () => {
  const action: ProjectAction = { type: 'NavigateImage', from: null, to: 'a.png' };

  it('pushing an action clears the redo stack', () => {
    let state = pushAction(emptyUndoState, action);
    const popped = popUndo(state)!;
    state = popped.next;
    expect(canRedo(state)).toBe(true);
    state = pushAction(state, action);
    expect(canRedo(state)).toBe(false);
  });

  it('popUndo moves the action to the redo stack and popRedo moves it back', () => {
    let state = pushAction(emptyUndoState, action);
    expect(canUndo(state)).toBe(true);
    const undone = popUndo(state)!;
    expect(undone.action).toBe(action);
    expect(canUndo(undone.next)).toBe(false);
    const redone = popRedo(undone.next)!;
    expect(redone.action).toBe(action);
    expect(canUndo(redone.next)).toBe(true);
    expect(canRedo(redone.next)).toBe(false);
  });

  it('popping an empty stack returns null', () => {
    expect(popUndo(emptyUndoState)).toBeNull();
    expect(popRedo(emptyUndoState)).toBeNull();
  });
});
