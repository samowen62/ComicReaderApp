import React, { useEffect } from 'react';
import { ThumbList } from '../components/ThumbList';
import { useAppStore } from '../state/store';

export function CaptureScreen(): React.JSX.Element {
  const store = useAppStore();
  const {
    settings,
    projectName,
    sessionImages,
    pendingRegion,
    confirmedRegion,
    selectingRegion,
    busy
  } = store;

  // Hotkey is scoped to Capture Mode: registered on entry, released on exit.
  useEffect(() => {
    if (settings?.captureHotkey) {
      void window.api.registerHotkey(settings.captureHotkey);
    }
    const offRect = window.api.onRectProposed((region) => store.onRectProposed(region));
    const offCancel = window.api.onSelectCancelled(() => store.onRegionSelectCancelled());
    const offHotkey = window.api.onHotkeyPressed(() => void store.doCapture());
    return () => {
      offRect();
      offCancel();
      offHotkey();
      void window.api.unregisterHotkey();
      void window.api.cancelRegionSelect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!projectName || !settings) return <div className="screen" />;

  const canCapture = !!confirmedRegion && !selectingRegion && !busy;

  return (
    <div className="screen capture-screen">
      <header className="screen-header">
        <h1>Capture Mode — {projectName}</h1>
        <button
          className="btn btn-primary"
          disabled={sessionImages.length === 0}
          onClick={() =>
            store.askConfirm({
              title: 'End capture mode?',
              body: `${sessionImages.length} image(s) in the workspace.`,
              confirmLabel: 'End Capture',
              onConfirm: () => store.endCaptureSession()
            })
          }
        >
          End Capture Mode
        </button>
      </header>

      <div className="capture-toolbar">
        <button className="btn" disabled={selectingRegion} onClick={() => store.beginRegionSelect()}>
          {confirmedRegion ? 'Change Capture Region' : 'Select Capture Region'}
        </button>

        {pendingRegion && (
          <span className="region-confirm">
            Region {Math.round(pendingRegion.rect.w)}×{Math.round(pendingRegion.rect.h)} on display{' '}
            {pendingRegion.displayId} — confirm?
            <button className="btn btn-primary" onClick={() => store.confirmPendingRegion()}>
              Confirm
            </button>
            <button className="btn" onClick={() => store.redrawRegion()}>
              Redraw
            </button>
          </span>
        )}

        <button className="btn btn-primary" disabled={!canCapture} onClick={() => void store.doCapture()}>
          {busy ? 'Capturing…' : 'Capture Screen'}
        </button>

        <span className="muted">
          {selectingRegion
            ? 'Drag on any monitor to select a region (Esc cancels)'
            : confirmedRegion
              ? `Region ${Math.round(confirmedRegion.rect.w)}×${Math.round(confirmedRegion.rect.h)} set · hotkey ${settings.captureHotkey}`
              : 'No capture region selected'}
        </span>
      </div>

      <ThumbList
        images={sessionImages}
        mainDir={settings.mainProjectDir ?? ''}
        projectName={projectName}
        onReorder={(files) => store.reorderSessionImages(files)}
        onDelete={(file) =>
          store.askConfirm({
            title: `Delete ${file}?`,
            body: 'The image is removed from this capture session.',
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: () => store.deleteSessionImage(file)
          })
        }
      />
    </div>
  );
}
