import React, { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);

function acceleratorFromEvent(e: React.KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

export function SettingsScreen(): React.JSX.Element {
  const { settings, saveSettings, setScreen, notify } = useAppStore();
  const [mainDir, setMainDir] = useState('');
  const [hotkey, setHotkey] = useState('');
  const [exportFont, setExportFont] = useState('');

  useEffect(() => {
    if (settings) {
      setMainDir(settings.mainProjectDir ?? '');
      setHotkey(settings.captureHotkey);
      setExportFont(settings.exportFontFamily);
    }
  }, [settings]);

  const browse = async () => {
    const picked = await window.api.pickDirectory();
    if (picked) setMainDir(picked);
  };

  const save = async () => {
    await saveSettings({
      mainProjectDir: mainDir || null,
      captureHotkey: hotkey || 'F8',
      exportFontFamily: exportFont.trim() || 'Arial'
    });
    notify('Settings saved');
    setScreen('main');
  };

  return (
    <div className="screen settings-screen">
      <header className="screen-header">
        <h1>Settings</h1>
        <button className="btn" onClick={() => setScreen('main')}>
          Back
        </button>
      </header>

      <section className="settings-section">
        <label className="field-label">Main project directory</label>
        <div className="settings-row">
          <input className="input" value={mainDir} onChange={(e) => setMainDir(e.target.value)} />
          <button className="btn" onClick={() => void browse()}>
            Browse…
          </button>
        </div>
        <p className="muted">Projects are stored as child directories of this folder.</p>
      </section>

      <section className="settings-section">
        <label className="field-label">Global capture hotkey</label>
        <input
          className="input hotkey-input"
          value={hotkey}
          placeholder="Press a key combination"
          readOnly
          onKeyDown={(e) => {
            e.preventDefault();
            const accel = acceleratorFromEvent(e);
            if (accel) setHotkey(accel);
          }}
        />
        <p className="muted">
          Used to capture the confirmed region without clicking the app. Active only in Capture
          Mode.
        </p>
      </section>

      <section className="settings-section">
        <label className="field-label">Export font</label>
        <input
          className="input"
          value={exportFont}
          onChange={(e) => setExportFont(e.target.value)}
          placeholder="Arial"
        />
        <p className="muted">
          Font family used for translated text in exported images. Any installed system font works.
        </p>
      </section>

      <div className="settings-save-row">
        <button className="btn btn-primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  );
}
