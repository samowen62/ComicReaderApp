import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  CaptureRegion,
  ComicReaderApi,
  ExportedPage,
  ExportFormat,
  IpcChannels,
  OcrProgressEvent,
  Project,
  Rect,
  Settings,
  TranslateRequest
} from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: ComicReaderApi = {
  getSettings: () => ipcRenderer.invoke(IpcChannels.settingsGet),
  setSettings: (settings: Settings) => ipcRenderer.invoke(IpcChannels.settingsSet, settings),
  pickDirectory: () => ipcRenderer.invoke(IpcChannels.settingsPickDir),

  listProjects: () => ipcRenderer.invoke(IpcChannels.projectList),
  createProject: (name: string) => ipcRenderer.invoke(IpcChannels.projectCreate, name),
  deleteProject: (name: string) => ipcRenderer.invoke(IpcChannels.projectDelete, name),
  loadProject: (name: string) => ipcRenderer.invoke(IpcChannels.projectLoad, name),
  autosaveProject: (name: string, project: Project | null, journalEntry: unknown) =>
    ipcRenderer.invoke(IpcChannels.projectAutosave, name, project, journalEntry),
  checkJournal: (name: string) => ipcRenderer.invoke(IpcChannels.projectCheckJournal, name),
  discardJournal: (name: string) => ipcRenderer.invoke(IpcChannels.projectDiscardJournal, name),
  setCurrentProject: (name: string | null) =>
    ipcRenderer.invoke(IpcChannels.projectSetCurrent, name),
  readImageBase64: (name: string, file: string) =>
    ipcRenderer.invoke(IpcChannels.projectReadImage, name, file),

  beginRegionSelect: () => ipcRenderer.invoke(IpcChannels.captureBeginSelect),
  cancelRegionSelect: () => ipcRenderer.invoke(IpcChannels.captureCancelSelect),
  screenshot: (projectName: string, region: CaptureRegion) =>
    ipcRenderer.invoke(IpcChannels.captureScreenshot, projectName, region),
  onRectProposed: (cb) => subscribe<CaptureRegion>(IpcChannels.captureRectProposed, cb),
  onSelectCancelled: (cb) => subscribe<void>(IpcChannels.captureSelectCancelled, cb),

  registerHotkey: (accelerator: string) =>
    ipcRenderer.invoke(IpcChannels.hotkeyRegister, accelerator),
  unregisterHotkey: () => ipcRenderer.invoke(IpcChannels.hotkeyUnregister),
  onHotkeyPressed: (cb) => subscribe<void>(IpcChannels.hotkeyPressed, cb),

  exportImage: (projectName: string, file: string, pngBase64: string) =>
    ipcRenderer.invoke(IpcChannels.exportImage, projectName, file, pngBase64),
  exportProject: (projectName: string, pages: ExportedPage[], format: ExportFormat) =>
    ipcRenderer.invoke(IpcChannels.exportProject, projectName, pages, format),

  ocrRegion: (projectName: string, file: string, bounds: Rect) =>
    ipcRenderer.invoke(IpcChannels.ocrRegion, projectName, file, bounds),
  ocrDetectAndRead: (projectName: string, file: string) =>
    ipcRenderer.invoke(IpcChannels.ocrDetectAndRead, projectName, file),
  ocrCancel: () => ipcRenderer.invoke(IpcChannels.ocrCancel),
  onOcrProgress: (cb) => subscribe<OcrProgressEvent>(IpcChannels.ocrProgress, cb),

  translatePage: (request: TranslateRequest) =>
    ipcRenderer.invoke(IpcChannels.translatePage, request),

  setJapaneseIme: () => ipcRenderer.invoke(IpcChannels.imeSetJapanese),
  setEnglishIme: () => ipcRenderer.invoke(IpcChannels.imeSetEnglish),

  sendOverlayRect: (displayId: string, rect: Rect) =>
    ipcRenderer.send(IpcChannels.overlayRect, { displayId, rect } satisfies CaptureRegion),
  sendOverlayCancel: () => ipcRenderer.send(IpcChannels.overlayCancel)
};

contextBridge.exposeInMainWorld('api', api);
