import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendJournal,
  createProject,
  discardJournal,
  hasJournal,
  listProjects,
  loadProject,
  nextCaptureFileName,
  sanitizeProjectName,
  writeProjectAtomic
} from '../src/main/projectStore';
import { emptyProject, PROJECT_VERSION } from '../src/shared/types';

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), 'comicreader-test-'));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('createProject / loadProject / listProjects', () => {
  it('creates a project directory with an empty project.json', async () => {
    await createProject(dir, 'Manga A');
    const project = await loadProject(dir, 'Manga A');
    expect(project.version).toBe(PROJECT_VERSION);
    expect(project.images).toEqual([]);
    const names = (await listProjects(dir)).map((p) => p.name);
    expect(names).toEqual(['Manga A']);
  });

  it('rejects duplicate project names', async () => {
    await createProject(dir, 'dup');
    await expect(createProject(dir, 'dup')).rejects.toThrow('already exists');
  });

  it('skips directories without a project.json when listing', async () => {
    await fs.mkdir(path.join(dir, 'not-a-project'));
    await createProject(dir, 'real');
    const names = (await listProjects(dir)).map((p) => p.name);
    expect(names).toEqual(['real']);
  });
});

describe('sanitizeProjectName', () => {
  it('replaces characters that are illegal in directory names', () => {
    expect(sanitizeProjectName('a/b\\c:d')).toBe('a_b_c_d');
  });

  it('rejects empty and traversal names', () => {
    expect(() => sanitizeProjectName('..')).toThrow('Invalid project name');
    expect(() => sanitizeProjectName('   ')).toThrow('Invalid project name');
  });
});

describe('writeProjectAtomic', () => {
  it('writes valid JSON and leaves no temp files behind', async () => {
    const projectDir = path.join(dir, 'p');
    await fs.mkdir(projectDir);
    await writeProjectAtomic(projectDir, { ...emptyProject(), images: [{ file: 'a.png', rectangles: [] }] });
    const raw = await fs.readFile(path.join(projectDir, 'project.json'), 'utf8');
    expect(JSON.parse(raw).images).toHaveLength(1);
    const leftovers = (await fs.readdir(projectDir)).filter((f) => f.includes('.tmp'));
    expect(leftovers).toEqual([]);
  });
});

describe('journal lifecycle', () => {
  it('appends, detects, and discards the journal', async () => {
    const projectDir = path.join(dir, 'p');
    await fs.mkdir(projectDir);
    expect(await hasJournal(projectDir)).toBe(false);
    await appendJournal(projectDir, { type: 'NavigateImage', from: null, to: 'a.png' });
    expect(await hasJournal(projectDir)).toBe(true);
    const content = await fs.readFile(path.join(projectDir, 'journal.jsonl'), 'utf8');
    expect(JSON.parse(content.trim()).entry.type).toBe('NavigateImage');
    await discardJournal(projectDir);
    expect(await hasJournal(projectDir)).toBe(false);
  });
});

describe('nextCaptureFileName', () => {
  it('increments past the highest existing capture number', async () => {
    await fs.writeFile(path.join(dir, 'capture_001.png'), 'x');
    await fs.writeFile(path.join(dir, 'capture_007.png'), 'x');
    expect(await nextCaptureFileName(dir)).toBe('capture_008.png');
  });

  it('starts at 001 in an empty directory', async () => {
    expect(await nextCaptureFileName(dir)).toBe('capture_001.png');
  });
});
