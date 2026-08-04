import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeImageExport, writeProjectExports, zeroPaddedPrefix } from '../src/main/exporter';
import { ExportedPage } from '../src/shared/types';

let dir: string;

const b64 = (s: string) => Buffer.from(s).toString('base64');

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'comicreader-export-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('zeroPaddedPrefix', () => {
  it('pads single and double digit indexes to three digits', () => {
    expect(zeroPaddedPrefix(0)).toBe('001_');
    expect(zeroPaddedPrefix(11)).toBe('012_');
    expect(zeroPaddedPrefix(999)).toBe('1000_');
  });
});

describe('writeImageExport', () => {
  it('writes the composited PNG adjacent to the source with an _export suffix', async () => {
    const dest = await writeImageExport(dir, 'capture_001.png', b64('png-bytes'));
    expect(path.basename(dest)).toBe('capture_001_export.png');
    expect(await fs.readFile(dest, 'utf8')).toBe('png-bytes');
  });
});

describe('writeProjectExports', () => {
  const pages: ExportedPage[] = [
    { name: '001_capture_001.png', dataBase64: b64('page-one') },
    { name: '002_capture_002.png', dataBase64: b64('page-two') }
  ];

  it('writes a numbered directory of images', async () => {
    const dest = await writeProjectExports(dir, pages, 'dir');
    const files = (await fs.readdir(dest)).sort();
    expect(files).toEqual(['001_capture_001.png', '002_capture_002.png']);
    expect(await fs.readFile(path.join(dest, files[0]), 'utf8')).toBe('page-one');
  });

  it('writes a zip archive and removes the staging directory', async () => {
    const dest = await writeProjectExports(dir, pages, 'zip');
    expect(dest.endsWith('.zip')).toBe(true);
    expect((await fs.stat(dest)).size).toBeGreaterThan(0);
    const siblings = await fs.readdir(path.dirname(dest));
    expect(siblings.filter((f) => f.startsWith('export_')).length).toBe(1);
  });

  it('writes a cbz archive (a zip with a different extension)', async () => {
    const dest = await writeProjectExports(dir, pages, 'cbz');
    expect(dest.endsWith('.cbz')).toBe(true);
    expect((await fs.stat(dest)).size).toBeGreaterThan(0);
  });
});
