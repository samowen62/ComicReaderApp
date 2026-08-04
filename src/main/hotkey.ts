import { BrowserWindow, globalShortcut } from 'electron';
import { IpcChannels } from '../shared/types';

let registered: string | null = null;

/**
 * Registers the global capture hotkey. The renderer only calls this while
 * Capture Mode is active, so the key is never hijacked app-globally (spec
 * v2 section 5). Returns whether registration succeeded.
 */
export function registerHotkey(mainWindow: BrowserWindow, accelerator: string): boolean {
  unregisterHotkey();
  if (!accelerator) return false;
  const ok = globalShortcut.register(accelerator, () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IpcChannels.hotkeyPressed);
    }
  });
  if (ok) registered = accelerator;
  return ok;
}

export function unregisterHotkey(): void {
  if (registered) {
    globalShortcut.unregister(registered);
    registered = null;
  }
}
