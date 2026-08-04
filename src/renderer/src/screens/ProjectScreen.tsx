import React, { useEffect, useState } from 'react';
import { ExportFormat } from '../../../shared/types';
import { ImageViewer } from '../components/ImageViewer';
import { TextPanel } from '../components/TextPanel';
import { ThumbList } from '../components/ThumbList';
import { useAppStore } from '../state/store';

export function ProjectScreen(): React.JSX.Element {
  const store = useAppStore();
  const { settings, projectName, project, selectedImage, selectedRectangleId, drawMode, busy } =
    store;
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Rectangle keyboard shortcuts: Delete removes the selected rectangle,
  // Escape exits draw mode or deselects. Skipped while typing in text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return;
      if (e.key === 'Delete' && selectedRectangleId) {
        store.deleteRectangle(selectedRectangleId);
      } else if (e.key === 'Escape') {
        if (drawMode) store.setDrawMode(false);
        else if (selectedRectangleId) store.selectRectangle(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRectangleId, drawMode]);

  if (!projectName || !project || !settings) return <div className="screen" />;

  const exportAs = (format: ExportFormat) => {
    setExportMenuOpen(false);
    // Spec 10.2: confirm with a summary if unreviewed/untranslated work remains.
    let untranslated = 0;
    let unreviewed = 0;
    for (const image of project.images) {
      for (const rect of image.rectangles) {
        if (rect.translatedText.trim() === '') untranslated++;
        if (!rect.reviewed) unreviewed++;
      }
    }
    if (untranslated > 0 || unreviewed > 0) {
      store.askConfirm({
        title: 'Export with incomplete work?',
        body: `${untranslated} rectangle(s) have no translation and ${unreviewed} are unreviewed. Untranslated rectangles are left untouched in the output.`,
        confirmLabel: 'Export',
        onConfirm: () => void store.exportProjectAs(format)
      });
    } else {
      void store.exportProjectAs(format);
    }
  };

  return (
    <div className="screen project-screen">
      <header className="screen-header">
        <h1>{projectName}</h1>
        <div className="header-actions">
          <button className="btn" disabled={!store.canUndo()} onClick={() => store.undo()}>
            Undo
          </button>
          <button className="btn" disabled={!store.canRedo()} onClick={() => store.redo()}>
            Redo
          </button>
          <button className="btn" onClick={() => store.beginAddPages()}>
            Add Pages
          </button>
          <button
            className={drawMode ? 'btn btn-primary' : 'btn'}
            disabled={!selectedImage}
            onClick={() => store.setDrawMode(!drawMode)}
            title="Draw a rectangle on the image to add text manually"
          >
            Find Text
          </button>
          <button
            className="btn"
            disabled={!selectedImage || busy}
            onClick={() => void store.exportSelectedImage()}
          >
            Export Image
          </button>
          <div className="export-menu-wrap">
            <button
              className="btn btn-primary"
              disabled={project.images.length === 0 || busy}
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              Export Project
            </button>
            {exportMenuOpen && (
              <div className="export-menu">
                <button className="btn" onClick={() => exportAs('dir')}>
                  Directory of images
                </button>
                <button className="btn" onClick={() => exportAs('zip')}>
                  .zip archive
                </button>
                <button className="btn" onClick={() => exportAs('cbz')}>
                  .cbz archive
                </button>
              </div>
            )}
          </div>
          <button className="btn" onClick={() => void store.closeProject()}>
            Close Project
          </button>
        </div>
      </header>

      {drawMode && (
        <div className="draw-banner">Find Text: drag a rectangle on the image (Esc to cancel)</div>
      )}

      <div className="project-body">
        <aside className="sidebar">
          <ThumbList
            images={project.images}
            mainDir={settings.mainProjectDir ?? ''}
            projectName={projectName}
            selectedFile={selectedImage}
            onSelect={(file) => store.navigate(file)}
            onReorder={(files) => store.reorderImages(files)}
            onDelete={(file) =>
              store.askConfirm({
                title: `Delete ${file}?`,
                body: 'The image and its text rectangles and translations will be removed from the project.',
                confirmLabel: 'Delete',
                danger: true,
                onConfirm: () => store.deleteImage(file)
              })
            }
          />
        </aside>

        <ImageViewer />

        <TextPanel />
      </div>
    </div>
  );
}
