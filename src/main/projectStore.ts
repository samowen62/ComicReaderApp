import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import path from 'path';
import { CapturedImage, emptyProject, Project, ProjectSummary } from '../shared/types';

const PROJECT_FILE = 'project.json';
const JOURNAL_FILE = 'journal.jsonl';
const CAPTURE_PATTERN = /^capture_\d+\.png$/;

export function projectDir(mainDir: string, name: string): string {
  return path.join(mainDir, name);
}

/** Restrict to a conservative name charset: names become directory names. */
export function sanitizeProjectName(name: string): string {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw new Error('Invalid project name');
  }
  return cleaned;
}

export async function listProjects(mainDir: string): Promise<ProjectSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(mainDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const summaries: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(mainDir, entry.name, PROJECT_FILE);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const project = JSON.parse(raw) as Project;
      const stat = await fs.stat(file);
      summaries.push({
        name: entry.name,
        imageCount: Array.isArray(project.images) ? project.images.length : 0,
        modifiedAt: stat.mtimeMs
      });
    } catch {
      // Not a project directory (no readable project.json) — skip.
    }
  }
  summaries.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return summaries;
}

export async function createProject(mainDir: string, name: string): Promise<Project> {
  const dir = projectDir(mainDir, sanitizeProjectName(name));
  const exists = await fs
    .access(dir)
    .then(() => true)
    .catch(() => false);
  if (exists) throw new Error(`Project "${name}" already exists`);
  await fs.mkdir(dir, { recursive: true });
  const project = emptyProject();
  await writeProjectAtomic(dir, project);
  return project;
}

export async function loadProject(mainDir: string, name: string): Promise<Project> {
  const raw = await fs.readFile(path.join(projectDir(mainDir, name), PROJECT_FILE), 'utf8');
  const project = JSON.parse(raw) as Project;
  if (!Array.isArray(project.images)) project.images = [];
  return project;
}

export async function deleteProject(mainDir: string, name: string): Promise<void> {
  await fs.rm(projectDir(mainDir, name), { recursive: true, force: true });
}

/** Atomic write per spec 9.2: write to a temp file, then rename over project.json. */
export async function writeProjectAtomic(dir: string, project: Project): Promise<void> {
  const tmp = path.join(dir, `${PROJECT_FILE}.tmp-${process.pid}`);
  await fs.writeFile(tmp, JSON.stringify(project, null, 2), 'utf8');
  await fs.rename(tmp, path.join(dir, PROJECT_FILE));
}

export async function appendJournal(dir: string, entry: unknown): Promise<void> {
  const line = JSON.stringify({ ts: Date.now(), entry }) + '\n';
  await fs.appendFile(path.join(dir, JOURNAL_FILE), line, 'utf8');
}

export async function hasJournal(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dir, JOURNAL_FILE));
    return stat.size > 0;
  } catch {
    return false;
  }
}

export async function discardJournal(dir: string): Promise<void> {
  await fs.rm(path.join(dir, JOURNAL_FILE), { force: true });
}

export async function nextCaptureFileName(dir: string): Promise<string> {
  const entries = await fs.readdir(dir);
  let max = 0;
  for (const entry of entries) {
    const match = /^capture_(\d+)\.png$/.exec(entry);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `capture_${String(max + 1).padStart(3, '0')}.png`;
}

export async function saveCapturePng(dir: string, data: Buffer): Promise<string> {
  const file = await nextCaptureFileName(dir);
  await fs.writeFile(path.join(dir, file), data);
  return file;
}

/**
 * Deletes capture files on disk that are no longer referenced by the project.
 * Called on clean app quit so in-session undo of image deletion stays possible
 * (spec 6.1). Exported derivatives (capture_XXX_export.png) are left alone.
 */
export function sweepOrphanCapturesSync(dir: string, project: Project): void {
  const referenced = new Set(project.images.map((img: CapturedImage) => img.file));
  let entries: string[];
  try {
    entries = fsSync.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (CAPTURE_PATTERN.test(entry) && !referenced.has(entry)) {
      try {
        fsSync.rmSync(path.join(dir, entry), { force: true });
      } catch {
        // Best effort.
      }
    }
  }
}

export function discardJournalSync(dir: string): void {
  try {
    fsSync.rmSync(path.join(dir, JOURNAL_FILE), { force: true });
  } catch {
    // Best effort.
  }
}
