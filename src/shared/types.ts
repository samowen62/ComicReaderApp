// Shared types and IPC contract between main, preload, and renderer.

export const PROJECT_VERSION = 2;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextRectangle {
  id: string;
  bounds: Rect;
  originalText: string;
  translatedText: string;
  reviewed: boolean;
  readingOrderIndex: number;
  failed: boolean;
}

export interface CapturedImage {
  file: string;
  rectangles: TextRectangle[];
}

export interface Project {
  version: number;
  images: CapturedImage[];
}

export interface Settings {
  mainProjectDir: string | null;
  captureHotkey: string;
  /** Font family used when rendering translated text at export (spec 10.1). */
  exportFontFamily: string;
  /** Selected translation provider (spec 7.4). */
  translationProvider: TranslationProviderId;
  /** API key / token for the selected provider (stored in settings.json). */
  translationApiKey: string;
  /**
   * Optional base URL override. Used by openaiCompatible (default OpenAI) and
   * libreTranslate (default public instance). DeepL free vs pro is inferred
   * from the key prefix when this is empty.
   */
  translationBaseUrl: string;
  /** Model name for openaiCompatible (e.g. gpt-4o-mini). */
  translationModel: string;
  /**
   * Scale applied to text rectangle bounds at export (1 = full size).
   * Default 0.7 = 30% smaller width and height, centered on the original box.
   */
  exportRectScale: number;
}

export type TranslationProviderId = 'deepl' | 'google' | 'openaiCompatible' | 'libreTranslate';

export const DEFAULT_HOTKEY = 'F8';
export const DEFAULT_EXPORT_FONT = 'Arial';
export const DEFAULT_TRANSLATION_PROVIDER: TranslationProviderId = 'deepl';
export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
/** Default export box size: 30% smaller than the on-screen rectangle. */
export const DEFAULT_EXPORT_RECT_SCALE = 0.7;

export const TRANSLATION_PROVIDER_OPTIONS: Array<{
  id: TranslationProviderId;
  label: string;
  needsKey: boolean;
  notes: string;
}> = [
  {
    id: 'deepl',
    label: 'DeepL',
    needsKey: true,
    notes: 'Best JP→EN quality for MT. Free keys use api-free.deepl.com; pro keys use api.deepl.com.'
  },
  {
    id: 'google',
    label: 'Google Cloud Translation',
    needsKey: true,
    notes: 'Requires a Cloud Translation API key from Google Cloud.'
  },
  {
    id: 'openaiCompatible',
    label: 'OpenAI-compatible (LLM)',
    needsKey: true,
    notes: 'Sends the whole page as numbered context. Works with OpenAI or any compatible base URL.'
  },
  {
    id: 'libreTranslate',
    label: 'LibreTranslate',
    needsKey: false,
    notes: 'Self-hosted / public LibreTranslate. Optional API key. Quality varies.'
  }
];

export function emptyProject(): Project {
  return { version: PROJECT_VERSION, images: [] };
}

/**
 * User actions per spec v2 section 8. Each action carries the data needed to
 * both apply and revert it, so the undo stack stores actions only.
 */
export type ProjectAction =
  | { type: 'CommitCaptureSession'; previousImages: CapturedImage[]; newImages: CapturedImage[] }
  | { type: 'ReorderImages'; previousOrder: string[]; newOrder: string[] }
  | { type: 'DeleteImage'; image: CapturedImage; index: number }
  | { type: 'NavigateImage'; from: string | null; to: string | null }
  | { type: 'AddRectangle'; imageFile: string; rectangle: TextRectangle }
  | { type: 'DeleteRectangle'; imageFile: string; rectangle: TextRectangle; index: number }
  | {
      type: 'MoveResizeRectangle';
      imageFile: string;
      id: string;
      previousBounds: Rect;
      newBounds: Rect;
    }
  | {
      type: 'EditRectangleText';
      imageFile: string;
      id: string;
      field: 'originalText' | 'translatedText';
      previousValue: string;
      newValue: string;
      previousReviewed: boolean;
    }
  | { type: 'ToggleReviewed'; imageFile: string; id: string; previousValue: boolean }
  | {
      type: 'RenumberRectangle';
      imageFile: string;
      id: string;
      previousIndex: number;
      newIndex: number;
    }
  | {
      type: 'ReplacePageRectangles';
      imageFile: string;
      previousRectangles: TextRectangle[];
      newRectangles: TextRectangle[];
    }
  | {
      type: 'ApplyTranslations';
      imageFile: string;
      changes: Array<{
        id: string;
        previousTranslatedText: string;
        newTranslatedText: string;
        previousFailed: boolean;
        newFailed: boolean;
      }>;
    };

export interface CaptureRegion {
  displayId: string;
  /** Rectangle in DIP coordinates relative to the display's top-left corner. */
  rect: Rect;
}

export type ExportFormat = 'dir' | 'zip' | 'cbz';

/** Zero-padded 3-digit ordering prefix for exported pages (spec 10.2). */
export function zeroPaddedPrefix(index: number): string {
  return String(index + 1).padStart(3, '0') + '_';
}

/** One composited page sent from the renderer to the main process at export. */
export interface ExportedPage {
  /** Entry file name including the zero-padded ordering prefix (spec 10.2). */
  name: string;
  dataBase64: string;
}

export interface ProjectSummary {
  name: string;
  imageCount: number;
  modifiedAt: number;
}

export const IpcChannels = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsPickDir: 'settings:pickDir',
  projectList: 'project:list',
  projectCreate: 'project:create',
  projectDelete: 'project:delete',
  projectLoad: 'project:load',
  projectAutosave: 'project:autosave',
  projectCheckJournal: 'project:checkJournal',
  projectDiscardJournal: 'project:discardJournal',
  projectSetCurrent: 'project:setCurrent',
  projectReadImage: 'project:readImage',
  captureBeginSelect: 'capture:beginSelect',
  captureCancelSelect: 'capture:cancelSelect',
  captureScreenshot: 'capture:screenshot',
  captureRectProposed: 'capture:rectProposed',
  captureSelectCancelled: 'capture:selectCancelled',
  overlayRect: 'overlay:rect',
  overlayCancel: 'overlay:cancel',
  hotkeyRegister: 'hotkey:register',
  hotkeyUnregister: 'hotkey:unregister',
  hotkeyPressed: 'hotkey:pressed',
  exportImage: 'export:image',
  exportProject: 'export:project',
  ocrRegion: 'ocr:region',
  ocrDetectAndRead: 'ocr:detectAndRead',
  ocrCancel: 'ocr:cancel',
  ocrProgress: 'ocr:progress',
  translatePage: 'translate:page',
  imeSetJapanese: 'ime:setJapanese',
  imeSetEnglish: 'ime:setEnglish'
} as const;

export interface OcrRegionResult {
  text: string;
  failed: boolean;
  error?: string;
}

export interface OcrDetectedRegion {
  bounds: Rect;
  text: string;
  failed: boolean;
  error?: string;
}

export interface OcrDetectAndReadResult {
  cancelled: boolean;
  regions: OcrDetectedRegion[];
}

export interface OcrProgressEvent {
  id: string;
  stage: string;
  current: number;
  total: number;
  message: string;
}

/** One bubble/line sent to the translation provider in reading order (spec 7.4). */
export interface TranslateSegment {
  rectangleId: string;
  originalText: string;
}

export interface TranslateSegmentResult {
  rectangleId: string;
  translatedText: string;
  failed?: boolean;
  error?: string;
}

export interface TranslateRequest {
  segments: TranslateSegment[];
  sourceLang: 'ja';
  targetLang: 'en';
}

export interface TranslateResponse {
  results: TranslateSegmentResult[];
}

/** API surface exposed to the renderer via the preload contextBridge. */
export interface ComicReaderApi {
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
  pickDirectory(): Promise<string | null>;

  listProjects(): Promise<ProjectSummary[]>;
  createProject(name: string): Promise<Project>;
  deleteProject(name: string): Promise<void>;
  loadProject(name: string): Promise<Project>;
  /** journalEntry may be null; project may be null for journal-only entries (e.g. navigation). */
  autosaveProject(name: string, project: Project | null, journalEntry: unknown): Promise<void>;
  checkJournal(name: string): Promise<boolean>;
  discardJournal(name: string): Promise<void>;
  setCurrentProject(name: string | null): Promise<void>;
  /** Reads a project image as base64 so the renderer can composite it without canvas taint. */
  readImageBase64(name: string, file: string): Promise<string>;

  beginRegionSelect(): Promise<void>;
  cancelRegionSelect(): Promise<void>;
  screenshot(projectName: string, region: CaptureRegion): Promise<{ file: string }>;
  onRectProposed(cb: (region: CaptureRegion) => void): () => void;
  onSelectCancelled(cb: () => void): () => void;

  registerHotkey(accelerator: string): Promise<boolean>;
  unregisterHotkey(): Promise<void>;
  onHotkeyPressed(cb: () => void): () => void;

  /** Writes a composited page adjacent to its source capture (spec 10.1). */
  exportImage(projectName: string, file: string, pngBase64: string): Promise<string>;
  /** Writes composited pages as a numbered directory, .zip, or .cbz (spec 10.2). */
  exportProject(projectName: string, pages: ExportedPage[], format: ExportFormat): Promise<string>;

  /** Run manga-ocr on a single image region (Find Text, spec 6.4). */
  ocrRegion(projectName: string, file: string, bounds: Rect): Promise<OcrRegionResult>;
  /** Detect bubbles and OCR each region on a page (Auto Translate Page steps 1–3). */
  ocrDetectAndRead(projectName: string, file: string): Promise<OcrDetectAndReadResult>;
  ocrCancel(): Promise<void>;
  onOcrProgress(cb: (event: OcrProgressEvent) => void): () => void;

  /** Translate an ordered list of segments with page-level context (spec 7.4). */
  translatePage(request: TranslateRequest): Promise<TranslateResponse>;

  /** Switch OS IME toward Japanese Hiragana (Windows) / no-op elsewhere. */
  setJapaneseIme(): Promise<void>;
  /** Restore English keyboard layout (Windows) / no-op elsewhere. */
  setEnglishIme(): Promise<void>;

  sendOverlayRect(displayId: string, rect: Rect): void;
  sendOverlayCancel(): void;
}
