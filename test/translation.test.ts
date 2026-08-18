import { describe, expect, it } from 'vitest';
import { parseJsonStringArray } from '../src/main/translation/providers';
import { applyActionToProject, revertActionFromProject } from '../src/renderer/src/state/actions';
import { emptyProject, ProjectAction, TextRectangle } from '../src/shared/types';

describe('parseJsonStringArray', () => {
  it('parses a bare JSON array', () => {
    expect(parseJsonStringArray('["a", "b"]')).toEqual(['a', 'b']);
  });

  it('tolerates markdown fences and surrounding prose', () => {
    const content = 'Sure!\n```json\n["Hello", "World"]\n```\n';
    expect(parseJsonStringArray(content)).toEqual(['Hello', 'World']);
  });

  it('rejects non-array JSON', () => {
    expect(() => parseJsonStringArray('{"a":1}')).toThrow(/JSON array/);
  });
});

describe('ApplyTranslations', () => {
  it('updates translated text and failed flags, and reverts cleanly', () => {
    const rect: TextRectangle = {
      id: 'r1',
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      originalText: 'こんにちは',
      translatedText: '',
      reviewed: false,
      readingOrderIndex: 1,
      failed: false
    };
    const project = { ...emptyProject(), images: [{ file: 'a.png', rectangles: [rect] }] };
    const action: ProjectAction = {
      type: 'ApplyTranslations',
      imageFile: 'a.png',
      changes: [
        {
          id: 'r1',
          previousTranslatedText: '',
          newTranslatedText: 'Hello',
          previousFailed: false,
          newFailed: false
        }
      ]
    };
    const applied = applyActionToProject(project, action);
    expect(applied.images[0].rectangles[0].translatedText).toBe('Hello');
    const reverted = revertActionFromProject(applied, action);
    expect(reverted.images[0].rectangles[0].translatedText).toBe('');
  });
});
