import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import {
  DEFAULT_EXPORT_FONT,
  DEFAULT_EXPORT_RECT_SCALE,
  DEFAULT_HOTKEY,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TRANSLATION_PROVIDER,
  Settings
} from '../shared/types';

let cached: Settings | null = null;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

function clampExportRectScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return DEFAULT_EXPORT_RECT_SCALE;
  return Math.min(1, Math.max(0.2, scale));
}

function defaultSettings(): Settings {
  return {
    mainProjectDir: path.join(app.getPath('documents'), 'ComicReaderProjects'),
    captureHotkey: DEFAULT_HOTKEY,
    exportFontFamily: DEFAULT_EXPORT_FONT,
    translationProvider: DEFAULT_TRANSLATION_PROVIDER,
    translationApiKey: '',
    translationBaseUrl: '',
    translationModel: DEFAULT_OPENAI_MODEL,
    exportRectScale: DEFAULT_EXPORT_RECT_SCALE
  };
}

export async function loadSettings(): Promise<Settings> {
  if (cached) return cached;
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Settings>;
    cached = { ...defaultSettings(), ...parsed };
    cached.exportRectScale = clampExportRectScale(cached.exportRectScale);
  } catch {
    cached = defaultSettings();
  }
  return cached;
}

export async function saveSettings(settings: Settings): Promise<void> {
  cached = {
    ...settings,
    exportRectScale: clampExportRectScale(settings.exportRectScale)
  };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(cached, null, 2), 'utf8');
}

/** Resolved main project directory, created if missing. */
export async function getMainProjectDir(): Promise<string> {
  const settings = await loadSettings();
  const dir = settings.mainProjectDir ?? defaultSettings().mainProjectDir!;
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
