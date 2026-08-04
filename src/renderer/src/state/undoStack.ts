import { ProjectAction } from '../../../shared/types';

/**
 * Session-only, project-wide undo/redo stacks (spec v2 section 8).
 * Pure functions so the semantics are unit-testable.
 */
export interface UndoState {
  undoStack: ProjectAction[];
  redoStack: ProjectAction[];
}

export const emptyUndoState: UndoState = { undoStack: [], redoStack: [] };

/** Pushing a new action clears the redo stack (spec v2 section 8). */
export function pushAction(state: UndoState, action: ProjectAction): UndoState {
  return { undoStack: [...state.undoStack, action], redoStack: [] };
}

export function popUndo(state: UndoState): { action: ProjectAction; next: UndoState } | null {
  const action = state.undoStack[state.undoStack.length - 1];
  if (action === undefined) return null;
  return {
    action,
    next: { undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, action] }
  };
}

export function popRedo(state: UndoState): { action: ProjectAction; next: UndoState } | null {
  const action = state.redoStack[state.redoStack.length - 1];
  if (action === undefined) return null;
  return {
    action,
    next: { redoStack: state.redoStack.slice(0, -1), undoStack: [...state.undoStack, action] }
  };
}

export function canUndo(state: UndoState): boolean {
  return state.undoStack.length > 0;
}

export function canRedo(state: UndoState): boolean {
  return state.redoStack.length > 0;
}
