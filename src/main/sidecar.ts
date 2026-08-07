import { app, BrowserWindow } from 'electron';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { IpcChannels, OcrProgressEvent, Rect } from '../shared/types';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Spawns and manages the Python sidecar process. JSON-lines on stdin/stdout;
 * progress events are forwarded to the renderer.
 */
export class Sidecar {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private pending = new Map<string, Pending>();
  private starting: Promise<void> | null = null;
  private getMainWindow: () => BrowserWindow | null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  /** Resolve the Python interpreter: project venv first, then COMIC_READER_PYTHON, then portable tools. */
  resolvePython(): string {
    const candidates = [
      path.join(app.getAppPath(), 'python', '.venv', 'Scripts', 'python.exe'),
      path.join(process.cwd(), 'python', '.venv', 'Scripts', 'python.exe'),
      path.join(__dirname, '../../python/.venv/Scripts/python.exe'),
      process.env.COMIC_READER_PYTHON,
      path.join(process.env.USERPROFILE ?? '', 'tools', 'python311', 'python.exe')
    ].filter((p): p is string => !!p);
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    throw new Error(
      'Python sidecar not found. Create comicReaderApp/python/.venv and install requirements ' +
        '(see python/README.md), or set COMIC_READER_PYTHON.'
    );
  }

  private resolveModuleRoot(): string {
    const candidates = [
      path.join(app.getAppPath(), 'python'),
      path.join(process.cwd(), 'python'),
      path.join(__dirname, '../../python')
    ];
    for (const candidate of candidates) {
      if (existsSync(path.join(candidate, 'sidecar', '__main__.py'))) return candidate;
    }
    throw new Error('Could not locate python/sidecar package');
  }

  async ensureStarted(): Promise<void> {
    if (this.proc && !this.proc.killed) return;
    if (this.starting) return this.starting;
    this.starting = this.spawn().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async spawn(): Promise<void> {
    const python = this.resolvePython();
    const cwd = this.resolveModuleRoot();
    this.proc = spawn(python, ['-m', 'sidecar'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.proc.stderr.on('data', (chunk: string) => {
      console.error('[sidecar stderr]', chunk.trim());
    });
    this.proc.on('exit', (code, signal) => {
      console.error(`[sidecar] exited code=${code} signal=${signal}`);
      this.failAll(new Error(`Sidecar exited (code=${code})`));
      this.proc = null;
    });
    // Warm-up ping so first user action isn't stuck waiting on import failures alone.
    await this.request('ping', {});
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx;
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        console.error('[sidecar] non-json line', line);
        continue;
      }
      if (msg.type === 'progress') {
        const event: OcrProgressEvent = {
          id: String(msg.id ?? ''),
          stage: String(msg.stage ?? ''),
          current: Number(msg.current ?? 0),
          total: Number(msg.total ?? 0),
          message: String(msg.message ?? '')
        };
        this.getMainWindow()?.webContents.send(IpcChannels.ocrProgress, event);
        continue;
      }
      if (msg.type === 'log') {
        console.log('[sidecar]', msg.message);
        continue;
      }
      const id = String(msg.id ?? '');
      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);
      if (msg.ok) pending.resolve(msg.result);
      else pending.reject(new Error(String(msg.error ?? 'sidecar error')));
    }
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  request(cmd: string, args: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      void this.ensureStarted()
        .then(() => {
          if (!this.proc || !this.proc.stdin.writable) {
            reject(new Error('Sidecar is not running'));
            return;
          }
          const id = randomUUID();
          this.pending.set(id, { resolve, reject });
          this.proc.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n');
        })
        .catch(reject);
    });
  }

  async ocrRegion(imagePath: string, bounds: Rect): Promise<{ text: string; failed: boolean; error?: string }> {
    return (await this.request('ocr_region', { imagePath, bounds })) as {
      text: string;
      failed: boolean;
      error?: string;
    };
  }

  async detectAndOcr(imagePath: string): Promise<{
    cancelled: boolean;
    regions: Array<{ bounds: Rect; text: string; failed: boolean; error?: string }>;
  }> {
    return (await this.request('detect_and_ocr', { imagePath })) as {
      cancelled: boolean;
      regions: Array<{ bounds: Rect; text: string; failed: boolean; error?: string }>;
    };
  }

  async cancel(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.request('cancel', {});
    } catch {
      // Best effort.
    }
  }

  async shutdown(): Promise<void> {
    if (!this.proc) return;
    try {
      await this.request('shutdown', {});
    } catch {
      // ignore
    }
    this.proc.kill();
    this.proc = null;
  }
}

let instance: Sidecar | null = null;

export function getSidecar(getMainWindow: () => BrowserWindow | null): Sidecar {
  if (!instance) instance = new Sidecar(getMainWindow);
  return instance;
}
