import React, { useEffect } from 'react';
import { Modal } from './components/Modal';
import { CaptureScreen } from './screens/CaptureScreen';
import { MainScreen } from './screens/MainScreen';
import { ProjectScreen } from './screens/ProjectScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useAppStore } from './state/store';

export default function App(): React.JSX.Element {
  const store = useAppStore();
  const { screen, confirm, journalOrphan, notice } = store;

  useEffect(() => {
    void store.init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo/redo shortcuts are active on the Project Screen (spec v2 section 8).
  useEffect(() => {
    if (screen !== 'project') return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if (key === 'y') {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  return (
    <>
      {screen === 'main' && <MainScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'capture' && <CaptureScreen />}
      {screen === 'project' && <ProjectScreen />}

      {confirm && (
        <Modal
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={() => {
            store.closeConfirm();
            confirm.onConfirm();
          }}
          onCancel={() => store.closeConfirm()}
        />
      )}

      {journalOrphan && (
        <Modal
          title="Previous session ended unexpectedly"
          body="A recovery journal from a previous session was found. Your project data is up to date. Discard the recovery journal?"
          confirmLabel="Discard"
          onConfirm={() => void store.resolveJournalOrphan(true)}
          onCancel={() => void store.resolveJournalOrphan(false)}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </>
  );
}
