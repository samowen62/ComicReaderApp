import { app, BrowserWindow, net, protocol } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import { registerIpc, getCurrentProject } from './ipc';
import {
  discardJournalSync,
  loadProject,
  projectDir,
  sweepOrphanCapturesSync
} from './projectStore';
import { getMainProjectDir } from './settings';
import { getSidecar } from './sidecar';

let mainWindow: BrowserWindow | null = null;

// Must be registered before app ready so the renderer may use media:// URLs.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, supportFetchAPI: false } }
]);

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => (mainWindow = null));

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

/**
 * Serves project image files to the renderer as media://local/<encoded path>.
 * Paths are confined to the main project directory.
 */
function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    const decoded = path.normalize(decodeURIComponent(url.pathname.replace(/^\//, '')));
    const mainDir = path.normalize(await getMainProjectDir());
    const inProjectDir =
      decoded.toLowerCase().startsWith(mainDir.toLowerCase() + path.sep) ||
      decoded.toLowerCase() === mainDir.toLowerCase();
    if (!inProjectDir) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(decoded).toString());
  });
}

/**
 * Clean-exit housekeeping per spec 9.2: delete the journal, and sweep capture
 * files that were deleted in-project during the session (kept until now so
 * undo could restore them).
 */
async function cleanExitCleanup(): Promise<void> {
  const current = getCurrentProject();
  if (!current) return;
  try {
    const mainDir = await getMainProjectDir();
    const dir = projectDir(mainDir, current);
    const project = await loadProject(mainDir, current);
    sweepOrphanCapturesSync(dir, project);
    discardJournalSync(dir);
  } catch {
    // Best effort; the app is quitting.
  }
}

app.whenReady().then(() => {
  registerMediaProtocol();
  registerIpc(() => mainWindow);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', (event) => {
  event.preventDefault();
  void (async () => {
    try {
      await getSidecar(() => mainWindow).shutdown();
    } catch {
      // Best effort.
    }
    await cleanExitCleanup();
    app.exit(0);
  })();
});
