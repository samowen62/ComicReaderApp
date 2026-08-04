import { app, BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron';
import path from 'path';
import { CaptureRegion, IpcChannels, Rect } from '../shared/types';
import { projectDir, saveCapturePng } from './projectStore';

let overlays: BrowserWindow[] = [];

function overlayUrl(displayId: number): { url?: string; file?: string; query: Record<string, string> } {
  const query = { displayId: String(displayId) };
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    return { url: `${process.env['ELECTRON_RENDERER_URL']}/overlay.html?displayId=${displayId}`, query };
  }
  return { file: path.join(__dirname, '../renderer/overlay.html'), query };
}

/**
 * Opens one frameless, transparent, always-on-top overlay per display so the
 * user can drag a capture rectangle on any monitor (spec v2 section 5).
 * The overlay pages report the selection back via IPC; the main window is
 * notified with capture:rectProposed / capture:selectCancelled.
 */
export function beginRegionSelect(mainWindow: BrowserWindow): void {
  closeOverlays();
  for (const display of screen.getAllDisplays()) {
    const target = overlayUrl(display.id);
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent:  false,
      titleBarStyle: 'hidden',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: true,
      focusable: true,
      enableLargerThanScreen: true,
      opacity: 0.3,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (target.url) {
      win.loadURL(target.url);
    } else {
      win.loadFile(target.file!, { query: target.query });
    }

    overlays.push(win);
  }
}

export function closeOverlays(): void {
  for (const win of overlays) {
    if (!win.isDestroyed()) win.destroy();
  }
  overlays = [];
}

/** Wire the overlay pages' reports. Called once from ipc registration. */
export function initCaptureIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.on(IpcChannels.overlayRect, (_event, payload: CaptureRegion) => {
    closeOverlays();
    getMainWindow()?.webContents.send(IpcChannels.captureRectProposed, payload);
  });

  ipcMain.on(IpcChannels.overlayCancel, () => {
    closeOverlays();
    getMainWindow()?.webContents.send(IpcChannels.captureSelectCancelled);
  });
}

/**
 * Captures the confirmed region at full resolution and saves it as the next
 * capture_NNN.png in the project directory. Coordinates are DIP relative to
 * the display; the crop is scaled by the thumbnail's actual pixel ratio so it
 * stays correct under Windows display scaling (spec v2 section 12).
 */
export async function captureRegion(
  mainProjectDir: string,
  projectName: string,
  region: CaptureRegion
): Promise<{ file: string }> {
  const display = screen.getAllDisplays().find((d) => String(d.id) === String(region.displayId));
  if (!display) throw new Error(`Display ${region.displayId} not found`);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor)
    },
    fetchWindowIcons: false
  });
  const source =
    sources.find((s) => s.display_id === String(display.id)) ??
    (sources.length === 1 ? sources[0] : undefined);
  if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture screen');

  const thumbnail = source.thumbnail;
  const actual = thumbnail.getSize();
  const scaleX = actual.width / display.size.width;
  const scaleY = actual.height / display.size.height;
  const rect: Rect = region.rect;
  const cropped = thumbnail.crop({
    x: Math.max(0, Math.round(rect.x * scaleX)),
    y: Math.max(0, Math.round(rect.y * scaleY)),
    width: Math.max(1, Math.round(rect.w * scaleX)),
    height: Math.max(1, Math.round(rect.h * scaleY))
  });

  const dir = projectDir(mainProjectDir, projectName);
  const file = await saveCapturePng(dir, cropped.toPNG());
  return { file };
}
