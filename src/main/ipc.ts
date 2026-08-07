import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import {
  CaptureRegion,
  ExportedPage,
  ExportFormat,
  IpcChannels,
  Project,
  Rect,
  Settings
} from '../shared/types';
import { beginRegionSelect, captureRegion, closeOverlays, initCaptureIpc } from './capture';
import { writeImageExport, writeProjectExports } from './exporter';
import { registerHotkey, unregisterHotkey } from './hotkey';
import {
  appendJournal,
  createProject,
  deleteProject,
  discardJournal,
  hasJournal,
  listProjects,
  loadProject,
  projectDir,
  sanitizeProjectName,
  writeProjectAtomic
} from './projectStore';
import { getMainProjectDir, loadSettings, saveSettings } from './settings';
import { getSidecar } from './sidecar';

let currentProject: string | null = null;

export function getCurrentProject(): string | null {
  return currentProject;
}

export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  initCaptureIpc(getMainWindow);
  const sidecar = getSidecar(getMainWindow);

  ipcMain.handle(IpcChannels.settingsGet, () => loadSettings());
  ipcMain.handle(IpcChannels.settingsSet, async (_e, settings: Settings) => {
    await saveSettings(settings);
  });
  ipcMain.handle(IpcChannels.settingsPickDir, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Choose main project directory',
      properties: ['openDirectory', 'createDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.projectList, async () => listProjects(await getMainProjectDir()));

  ipcMain.handle(IpcChannels.projectCreate, async (_e, name: string) => {
    const mainDir = await getMainProjectDir();
    return createProject(mainDir, name);
  });

  ipcMain.handle(IpcChannels.projectDelete, async (_e, name: string) => {
    await deleteProject(await getMainProjectDir(), name);
    if (currentProject === name) currentProject = null;
  });

  ipcMain.handle(IpcChannels.projectLoad, async (_e, name: string) => {
    return loadProject(await getMainProjectDir(), name);
  });

  /**
   * Autosave per spec 9.2 Model A: atomically rewrite project.json (when a
   * project payload is given) and append the journal entry. Navigation passes
   * project=null so only the journal is touched.
   */
  ipcMain.handle(
    IpcChannels.projectAutosave,
    async (_e, name: string, project: Project | null, journalEntry: unknown) => {
      const dir = projectDir(await getMainProjectDir(), name);
      if (project) await writeProjectAtomic(dir, project);
      if (journalEntry !== null && journalEntry !== undefined) {
        await appendJournal(dir, journalEntry);
      }
    }
  );

  ipcMain.handle(IpcChannels.projectCheckJournal, async (_e, name: string) => {
    return hasJournal(projectDir(await getMainProjectDir(), name));
  });

  ipcMain.handle(IpcChannels.projectDiscardJournal, async (_e, name: string) => {
    await discardJournal(projectDir(await getMainProjectDir(), name));
  });

  ipcMain.handle(IpcChannels.projectSetCurrent, (_e, name: string | null) => {
    currentProject = name ? sanitizeProjectName(name) : null;
  });

  ipcMain.handle(IpcChannels.projectReadImage, async (_e, name: string, file: string) => {
    const dir = projectDir(await getMainProjectDir(), name);
    const data = await fs.readFile(path.join(dir, path.basename(file)));
    return data.toString('base64');
  });

  ipcMain.handle(IpcChannels.captureBeginSelect, () => {
    const win = getMainWindow();
    if (win) beginRegionSelect(win);
  });

  ipcMain.handle(IpcChannels.captureCancelSelect, () => closeOverlays());

  ipcMain.handle(
    IpcChannels.captureScreenshot,
    async (_e, projectName: string, region: CaptureRegion) => {
      return captureRegion(await getMainProjectDir(), projectName, region);
    }
  );

  ipcMain.handle(IpcChannels.hotkeyRegister, (_e, accelerator: string) => {
    const win = getMainWindow();
    return win ? registerHotkey(win, accelerator) : false;
  });

  ipcMain.handle(IpcChannels.hotkeyUnregister, () => unregisterHotkey());

  ipcMain.handle(
    IpcChannels.exportImage,
    async (_e, projectName: string, file: string, pngBase64: string) => {
      return writeImageExport(projectDir(await getMainProjectDir(), projectName), file, pngBase64);
    }
  );

  ipcMain.handle(
    IpcChannels.exportProject,
    async (_e, projectName: string, pages: ExportedPage[], format: ExportFormat) => {
      return writeProjectExports(projectDir(await getMainProjectDir(), projectName), pages, format);
    }
  );

  ipcMain.handle(
    IpcChannels.ocrRegion,
    async (_e, projectName: string, file: string, bounds: Rect) => {
      const imagePath = path.join(projectDir(await getMainProjectDir(), projectName), path.basename(file));
      return sidecar.ocrRegion(imagePath, bounds);
    }
  );

  ipcMain.handle(IpcChannels.ocrDetectAndRead, async (_e, projectName: string, file: string) => {
    const imagePath = path.join(projectDir(await getMainProjectDir(), projectName), path.basename(file));
    return sidecar.detectAndOcr(imagePath);
  });

  ipcMain.handle(IpcChannels.ocrCancel, async () => {
    await sidecar.cancel();
  });
}
