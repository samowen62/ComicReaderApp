/**
 * Enumerate installed Windows fonts designed for English/Latin.
 * Uses GDI EnumFontFamiliesExW; keeps families that expose Western (ANSI) and
 * do not also expose CJK/Thai design scripts (Japanese, Hangul, Chinese, Thai).
 */

import { DEFAULT_EXPORT_FONT } from '../shared/types';

const DEFAULT_CHARSET = 1;
const LF_FACESIZE = 32;

/** Scripts that indicate a non-English primary design language. */
const NON_ENGLISH_SCRIPTS = new Set([
  'Japanese',
  'Hangul',
  'Hangul(Johab)',
  'CHINESE_GB2312',
  'CHINESE_BIG5',
  'Thai'
]);

const FALLBACK_FONTS = [
  DEFAULT_EXPORT_FONT,
  'Arial',
  'Segoe UI',
  'Times New Roman',
  'Courier New'
];

let cached: string[] | null = null;

function uniqueSorted(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
}

function utf16ArrayToString(arr: ArrayLike<number>): string {
  const codes: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i]!;
    if (c === 0) break;
    codes.push(c);
  }
  return String.fromCharCode(...codes);
}

function enumerateEnglishFontsWin32(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi') as typeof import('koffi');
  const gdi32 = koffi.load('gdi32.dll');
  const user32 = koffi.load('user32.dll');

  const LOGFONTW = koffi.struct('CR_LOGFONTW', {
    lfHeight: 'long',
    lfWidth: 'long',
    lfEscapement: 'long',
    lfOrientation: 'long',
    lfWeight: 'long',
    lfItalic: 'uint8',
    lfUnderline: 'uint8',
    lfStrikeOut: 'uint8',
    lfCharSet: 'uint8',
    lfOutPrecision: 'uint8',
    lfClipPrecision: 'uint8',
    lfQuality: 'uint8',
    lfPitchAndFamily: 'uint8',
    lfFaceName: koffi.array('uint16', LF_FACESIZE)
  });

  const ENUMLOGFONTEXW = koffi.struct('CR_ENUMLOGFONTEXW', {
    elfLogFont: LOGFONTW,
    elfFullName: koffi.array('uint16', 64),
    elfStyle: koffi.array('uint16', 32),
    elfScript: koffi.array('uint16', 32)
  });

  const FontEnumProc = koffi.proto(
    'int __stdcall CR_FontEnumProc(CR_ENUMLOGFONTEXW *lpelfe, void *lpntme, uint FontType, long lParam)'
  );

  const EnumFontFamiliesExW = gdi32.func(
    'int __stdcall EnumFontFamiliesExW(void *hdc, CR_LOGFONTW *lpLogfont, CR_FontEnumProc *lpProc, long lParam, uint dwFlags)'
  );
  const GetDC = user32.func('void * __stdcall GetDC(void *hWnd)');
  const ReleaseDC = user32.func('int __stdcall ReleaseDC(void *hWnd, void *hDC)');

  const scriptsByFace = new Map<string, Set<string>>();
  const callback = koffi.register((lpelfe: unknown) => {
    try {
      const decoded = koffi.decode(lpelfe, ENUMLOGFONTEXW) as {
        elfLogFont: { lfFaceName: ArrayLike<number> };
        elfScript: ArrayLike<number>;
      };
      const face = utf16ArrayToString(decoded.elfLogFont.lfFaceName).trim();
      if (!face || face.startsWith('@')) return 1;
      const script = utf16ArrayToString(decoded.elfScript).trim();
      let set = scriptsByFace.get(face);
      if (!set) {
        set = new Set();
        scriptsByFace.set(face, set);
      }
      if (script) set.add(script);
    } catch (err) {
      console.error('[fonts] enum callback decode failed', err);
    }
    return 1;
  }, koffi.pointer(FontEnumProc));

  const hdc = GetDC(null);
  if (!hdc) {
    koffi.unregister(callback);
    throw new Error('GetDC failed');
  }

  try {
    const logfont = {
      lfHeight: 0,
      lfWidth: 0,
      lfEscapement: 0,
      lfOrientation: 0,
      lfWeight: 0,
      lfItalic: 0,
      lfUnderline: 0,
      lfStrikeOut: 0,
      lfCharSet: DEFAULT_CHARSET,
      lfOutPrecision: 0,
      lfClipPrecision: 0,
      lfQuality: 0,
      lfPitchAndFamily: 0,
      lfFaceName: new Array(LF_FACESIZE).fill(0)
    };
    EnumFontFamiliesExW(hdc, logfont, callback, 0, 0);
  } finally {
    ReleaseDC(null, hdc);
    koffi.unregister(callback);
  }

  const english: string[] = [];
  for (const [face, scripts] of scriptsByFace) {
    if (!scripts.has('Western')) continue;
    let nonEnglish = false;
    for (const script of scripts) {
      if (NON_ENGLISH_SCRIPTS.has(script)) {
        nonEnglish = true;
        break;
      }
    }
    if (!nonEnglish) english.push(face);
  }
  return uniqueSorted(english);
}

/** Installed English-designed font family names, sorted. */
export function listEnglishFonts(): string[] {
  if (cached) return cached;
  if (process.platform !== 'win32') {
    cached = uniqueSorted(FALLBACK_FONTS);
    return cached;
  }
  try {
    const listed = enumerateEnglishFontsWin32();
    cached = listed.length > 0 ? listed : uniqueSorted(FALLBACK_FONTS);
  } catch (err) {
    console.error('[fonts] enumeration failed', err);
    cached = uniqueSorted(FALLBACK_FONTS);
  }
  return cached;
}
