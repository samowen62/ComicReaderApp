import React, { useEffect, useRef, useState } from 'react';
import { TextRectangle } from '../../../shared/types';
import { useAppStore } from '../state/store';

const DEBOUNCE_MS = 1500;

/**
 * Panel to the right of the viewer shown when a text rectangle is selected
 * (spec 6.2/6.6): original and translated text boxes with edits committed on
 * debounce or focus loss, Mark Reviewed, and the (Phase 4) Auto Translate
 * button rendered disabled.
 */
export function TextPanel(): React.JSX.Element | null {
  const store = useAppStore();
  const { project, selectedImage, selectedRectangleId } = store;

  const rectangle: TextRectangle | null =
    project?.images
      .find((i) => i.file === selectedImage)
      ?.rectangles.find((r) => r.id === selectedRectangleId) ?? null;

  const [original, setOriginal] = useState('');
  const [translated, setTranslated] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resync drafts when the selection or underlying values change (e.g. undo).
  useEffect(() => {
    setOriginal(rectangle?.originalText ?? '');
    setTranslated(rectangle?.translatedText ?? '');
  }, [rectangle?.id, rectangle?.originalText, rectangle?.translatedText]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!rectangle) return null;

  const scheduleCommit = (field: 'originalText' | 'translatedText', value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => store.commitRectangleText(rectangle.id, field, value), DEBOUNCE_MS);
  };

  const commitNow = (field: 'originalText' | 'translatedText', value: string) => {
    if (timer.current) clearTimeout(timer.current);
    store.commitRectangleText(rectangle.id, field, value);
  };

  return (
    <aside className="text-panel">
      <div className="text-panel-row">
        <label className="field-label">Original text</label>
        <textarea
          className="text-box"
          value={original}
          rows={4}
          onChange={(e) => {
            setOriginal(e.target.value);
            scheduleCommit('originalText', e.target.value);
          }}
          onBlur={() => commitNow('originalText', original)}
        />
      </div>

      <button className="btn" disabled title="Available in Phase 4 (translation provider)">
        Auto Translate
      </button>

      <div className="text-panel-row">
        <label className="field-label">Translated text</label>
        <textarea
          className="text-box"
          value={translated}
          rows={4}
          onChange={(e) => {
            setTranslated(e.target.value);
            scheduleCommit('translatedText', e.target.value);
          }}
          onBlur={() => commitNow('translatedText', translated)}
        />
      </div>

      <button
        className={rectangle.reviewed ? 'btn btn-primary' : 'btn'}
        onClick={() => store.toggleReviewed(rectangle.id)}
      >
        {rectangle.reviewed ? 'Reviewed ✓' : 'Mark Reviewed'}
      </button>

      <button className="btn btn-danger" onClick={() => store.deleteRectangle(rectangle.id)}>
        Delete Rectangle
      </button>

      <p className="muted">Reading order: {rectangle.readingOrderIndex}</p>
    </aside>
  );
}
