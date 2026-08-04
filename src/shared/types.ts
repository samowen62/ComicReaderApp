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
}

export const DEFAULT_HOTKEY = 'F8';
export const DEFAULT_EXPORT_FONT = 'Arial';

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
    }
  | { type: 'ToggleReviewed'; imageFile: string; id: string; previousValue: boolean }
  | {
      type: 'RenumberRectangle';
      imageFile: string;
      id: string;
      previousIndex: number;
      newIndex: number;
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
  exportProject: 'export:project'
} as const;

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

  sendOverlayRect(displayId: string, rect: Rect): void;
  sendOverlayCancel(): void;
}
