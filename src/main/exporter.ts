import { ZipArchive } from 'archiver';
import { createWriteStream, promises as fs } from 'fs';
import path from 'path';
import { ExportedPage, zeroPaddedPrefix } from '../shared/types';

export { zeroPaddedPrefix };

const EXPORTS_DIR = 'exports';

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Writes a composited page (rendered by the renderer process: white box +
 * translated text per rectangle, spec 10.1) adjacent to its source capture.
 */
export async function writeImageExport(
  projectDir: string,
  sourceFile: string,
  pngBase64: string
): Promise<string> {
  const ext = path.extname(sourceFile);
  const dest = path.join(projectDir, `${path.basename(sourceFile, ext)}_export${ext}`);
  await fs.writeFile(dest, Buffer.from(pngBase64, 'base64'));
  return dest;
}

/**
 * Writes composited pages to a numbered directory, or packs them into a
 * .zip/.cbz (spec 10.2). Page names already carry the zero-padded prefix.
 */
export async function writeProjectExports(
  projectDir: string,
  pages: ExportedPage[],
  format: 'dir' | 'zip' | 'cbz'
): Promise<string> {
  const exportsDir = path.join(projectDir, EXPORTS_DIR);
  await fs.mkdir(exportsDir, { recursive: true });
  const staging = path.join(exportsDir, `export_${timestamp()}`);
  await fs.mkdir(staging, { recursive: true });
  for (const page of pages) {
    await fs.writeFile(path.join(staging, page.name), Buffer.from(page.dataBase64, 'base64'));
  }

  if (format === 'dir') return staging;

  const archivePath = path.join(exportsDir, `export_${timestamp()}.${format}`);
  await writeArchive(archivePath, staging, pages.map((p) => p.name));
  await fs.rm(staging, { recursive: true, force: true });
  return archivePath;
}

function writeArchive(archivePath: string, stagingDir: string, names: string[]): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const output = createWriteStream(archivePath);
    const archive = new ZipArchive({ level: 9 });
    output.on('close', () => resolvePromise());
    archive.on('error', (err) => rejectPromise(err));
    archive.pipe(output);
    for (const name of names) {
      archive.file(path.join(stagingDir, name), { name });
    }
    void archive.finalize();
  });
}
