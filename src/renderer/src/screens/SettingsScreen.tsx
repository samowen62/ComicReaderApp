import React, { useEffect, useState } from 'react';
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TRANSLATION_PROVIDER,
  TRANSLATION_PROVIDER_OPTIONS,
  TranslationProviderId
} from '../../../shared/types';
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
  const [provider, setProvider] = useState<TranslationProviderId>(DEFAULT_TRANSLATION_PROVIDER);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState(DEFAULT_OPENAI_MODEL);

  useEffect(() => {
    if (settings) {
      setMainDir(settings.mainProjectDir ?? '');
      setHotkey(settings.captureHotkey);
      setExportFont(settings.exportFontFamily);
      setProvider(settings.translationProvider);
      setApiKey(settings.translationApiKey);
      setBaseUrl(settings.translationBaseUrl);
      setModel(settings.translationModel);
    }
  }, [settings]);

  const browse = async () => {
    const picked = await window.api.pickDirectory();
    if (picked) setMainDir(picked);
  };

  const selectedMeta = TRANSLATION_PROVIDER_OPTIONS.find((o) => o.id === provider);

  const save = async () => {
    await saveSettings({
      mainProjectDir: mainDir || null,
      captureHotkey: hotkey || 'F8',
      exportFontFamily: exportFont.trim() || 'Arial',
      translationProvider: provider,
      translationApiKey: apiKey.trim(),
      translationBaseUrl: baseUrl.trim(),
      translationModel: model.trim() || DEFAULT_OPENAI_MODEL
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

      <section className="settings-section">
        <label className="field-label">Translation provider</label>
        <select
          className="input"
          value={provider}
          onChange={(e) => setProvider(e.target.value as TranslationProviderId)}
        >
          {TRANSLATION_PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="muted">{selectedMeta?.notes}</p>
      </section>

      <section className="settings-section">
        <label className="field-label">
          API key{selectedMeta?.needsKey ? '' : ' (optional)'}
        </label>
        <input
          className="input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={selectedMeta?.needsKey ? 'Required' : 'Optional'}
          autoComplete="off"
        />
      </section>

      <section className="settings-section">
        <label className="field-label">Base URL (optional)</label>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={
            provider === 'openaiCompatible'
              ? 'https://api.openai.com/v1'
              : provider === 'libreTranslate'
                ? 'https://libretranslate.com'
                : 'Leave blank for provider default'
          }
        />
      </section>

      {provider === 'openaiCompatible' && (
        <section className="settings-section">
          <label className="field-label">Model</label>
          <input
            className="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={DEFAULT_OPENAI_MODEL}
          />
        </section>
      )}

      <div className="settings-save-row">
        <button className="btn btn-primary" onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  );
}
