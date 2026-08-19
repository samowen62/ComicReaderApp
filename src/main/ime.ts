/**
 * Windows keyboard / IME helpers for the Original-text field.
 * Non-Windows platforms are no-ops (renderer still sets lang="ja"/"en").
 */

import { BrowserWindow } from 'electron';

const KLF_ACTIVATE = 0x00000001;
const LANG_JA = '00000411';
const LANG_EN_US = '00000409';
const IME_CMODE_NATIVE = 0x0001;
const IME_CMODE_FULLSHAPE = 0x0008;
const IME_CMODE_KATAKANA = 0x0002;

let previousHkl: unknown = null;
let user32: ReturnType<typeof loadUser32> | null = null;
let imm32: ReturnType<typeof loadImm32> | null = null;

function loadUser32() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi') as typeof import('koffi');
  const lib = koffi.load('user32.dll');
  return {
    LoadKeyboardLayoutW: lib.func('LoadKeyboardLayoutW', 'void*', ['str16', 'uint']),
    ActivateKeyboardLayout: lib.func('ActivateKeyboardLayout', 'void*', ['void*', 'uint']),
    GetKeyboardLayout: lib.func('GetKeyboardLayout', 'void*', ['uint']),
    GetForegroundWindow: lib.func('GetForegroundWindow', 'void*', [])
  };
}

function loadImm32() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi') as typeof import('koffi');
  const lib = koffi.load('imm32.dll');
  return {
    ImmGetContext: lib.func('ImmGetContext', 'void*', ['void*']),
    ImmReleaseContext: lib.func('ImmReleaseContext', 'int', ['void*', 'void*']),
    ImmGetConversionStatus: lib.func('ImmGetConversionStatus', 'int', ['void*', 'uint*', 'uint*']),
    ImmSetConversionStatus: lib.func('ImmSetConversionStatus', 'int', ['void*', 'uint', 'uint']),
    ImmSetOpenStatus: lib.func('ImmSetOpenStatus', 'int', ['void*', 'int'])
  };
}

function ensureLibs(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    if (!user32) user32 = loadUser32();
    if (!imm32) imm32 = loadImm32();
    return true;
  } catch (err) {
    console.error('[ime] failed to load Win32 libs', err);
    return false;
  }
}

function setHiraganaOnForeground(): void {
  if (!imm32 || !user32) return;
  try {
    const hwnd = user32.GetForegroundWindow();
    if (!hwnd) return;
    const himc = imm32.ImmGetContext(hwnd);
    if (!himc) return;
    try {
      imm32.ImmSetOpenStatus(himc, 1);
      // Force native (Japanese) + full-width, clear katakana → hiragana.
      const conv = IME_CMODE_NATIVE | IME_CMODE_FULLSHAPE;
      const sentence = 0;
      imm32.ImmSetConversionStatus(himc, conv & ~IME_CMODE_KATAKANA, sentence);
    } finally {
      imm32.ImmReleaseContext(hwnd, himc);
    }
  } catch (err) {
    console.error('[ime] ImmSetConversionStatus failed', err);
  }
}

/** Activate Japanese layout and prefer Hiragana conversion mode. */
export function setJapaneseIme(_win?: BrowserWindow | null): void {
  if (!ensureLibs() || !user32) return;
  try {
    if (previousHkl === null) {
      previousHkl = user32.GetKeyboardLayout(0);
    }
    const hkl = user32.LoadKeyboardLayoutW(LANG_JA, KLF_ACTIVATE);
    if (hkl) user32.ActivateKeyboardLayout(hkl, 0);
    setHiraganaOnForeground();
  } catch (err) {
    console.error('[ime] setJapaneseIme failed', err);
  }
}

/** Restore the layout that was active before the last Japanese switch. */
export function setEnglishIme(_win?: BrowserWindow | null): void {
  if (!ensureLibs() || !user32) return;
  try {
    if (previousHkl) {
      user32.ActivateKeyboardLayout(previousHkl, 0);
    } else {
      const hkl = user32.LoadKeyboardLayoutW(LANG_EN_US, KLF_ACTIVATE);
      if (hkl) user32.ActivateKeyboardLayout(hkl, 0);
    }
  } catch (err) {
    console.error('[ime] setEnglishIme failed', err);
  }
}
