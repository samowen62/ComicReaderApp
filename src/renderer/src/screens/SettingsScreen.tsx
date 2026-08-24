import React, { useEffect, useState } from 'react';
import {
  DEFAULT_EXPORT_FONT,
  DEFAULT_EXPORT_RECT_SCALE,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TRANSLATION_PROVIDER,
  TRANSLATION_PROVIDER_OPTIONS,
  TranslationProviderId
} from '../../../shared/types';
import { useAppStore } from '../state/store';

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta']);
const MIN_EXPORT_SCALE_PCT = 20;
const MAX_EXPORT_SCALE_PCT = 100;

function clampExportRectScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_EXPORT_RECT_SCALE;
  return Math.min(1, Math.max(0.2, scale));
}

function scaleToPercent(scale: number): number {
  return Math.round(clampExportRectScale(scale) * 100);
}

function percentToScale(pct: number): number {
  const n = Number.isFinite(pct) ? pct : DEFAULT_EXPORT_RECT_SCALE * 100;
  const clamped = Math.min(MAX_EXPORT_SCALE_PCT, Math.max(MIN_EXPORT_SCALE_PCT, n));
  return clamped / 100;
}

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
  const [exportFont, setExportFont] = useState(DEFAULT_EXPORT_FONT);
  const [fontOptions, setFontOptions] = useState<string[]>([DEFAULT_EXPORT_FONT]);
  const [exportScalePct, setExportScalePct] = useState(scaleToPercent(DEFAULT_EXPORT_RECT_SCALE));
  const [provider, setProvider] = useState<TranslationProviderId>(DEFAULT_TRANSLATION_PROVIDER);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState(DEFAULT_OPENAI_MODEL);

  useEffect(() => {
    void window.api.listFonts().then((fonts) => {
      setFontOptions(fonts.length > 0 ? fonts : [DEFAULT_EXPORT_FONT]);
    });
  }, []);

  useEffect(() => {
    if (settings) {
      setMainDir(settings.mainProjectDir ?? '');
      setHotkey(settings.captureHotkey);
      setExportFont(settings.exportFontFamily || DEFAULT_EXPORT_FONT);
      setExportScalePct(scaleToPercent(settings.exportRectScale ?? DEFAULT_EXPORT_RECT_SCALE));
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

  const fontSelectOptions =
    exportFont && !fontOptions.some((f) => f.toLowerCase() === exportFont.toLowerCase())
      ? [exportFont, ...fontOptions]
      : fontOptions;

  const save = async () => {
    await saveSettings({
      mainProjectDir: mainDir || null,
      captureHotkey: hotkey || 'F8',
      exportFontFamily: exportFont.trim() || DEFAULT_EXPORT_FONT,
      exportRectScale: percentToScale(exportScalePct),
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
        <select
          className="input"
          value={exportFont}
          onChange={(e) => setExportFont(e.target.value)}
        >
          {fontSelectOptions.map((font) => (
            <option key={font} value={font}>
              {font}
            </option>
          ))}
        </select>
        <p className="muted">
          Installed Windows fonts designed for English (ANSI). Default is {DEFAULT_EXPORT_FONT}.
        </p>
      </section>

      <section className="settings-section">
        <label className="field-label">Export text box scale (%)</label>
        <input
          className="input"
          type="number"
          min={MIN_EXPORT_SCALE_PCT}
          max={MAX_EXPORT_SCALE_PCT}
          step={1}
          value={exportScalePct}
          onChange={(e) => setExportScalePct(Number(e.target.value))}
          onBlur={() => setExportScalePct(scaleToPercent(percentToScale(exportScalePct)))}
        />
        <p className="muted">
          Size of white text boxes relative to on-screen rectangles when exporting (default 70 =
          30% smaller). Clamped to {MIN_EXPORT_SCALE_PCT}–{MAX_EXPORT_SCALE_PCT}.
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
