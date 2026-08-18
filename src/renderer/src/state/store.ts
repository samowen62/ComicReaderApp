import { create } from 'zustand';
import {
  CapturedImage,
  CaptureRegion,
  ExportedPage,
  ExportFormat,
  Project,
  ProjectAction,
  ProjectSummary,
  Rect,
  Settings,
  TextRectangle,
  TranslateSegment,
  zeroPaddedPrefix
} from '../../../shared/types';
import { compositePage } from '../export/composite';
import { applyActionToProject, revertActionFromProject } from './actions';
import { computeReadingOrder } from './readingOrder';
import { canRedo, canUndo, emptyUndoState, popRedo, popUndo, pushAction, UndoState } from './undoStack';

export type Screen = 'main' | 'settings' | 'capture' | 'project';

export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface AppState {
  settings: Settings | null;
  projects: ProjectSummary[];
  screen: Screen;

  projectName: string | null;
  project: Project | null;
  selectedImage: string | null;
  undoState: UndoState;
  journalOrphan: boolean;

  selectedRectangleId: string | null;
  /** Find Text draw mode: the next drag on the viewer creates a text rectangle. */
  drawMode: boolean;
  /** Non-null while detect/OCR is running; shown as a progress banner. */
  pipelineProgress: string | null;

  // Capture session state (Capture Mode Screen).
  sessionBaseline: CapturedImage[];
  sessionImages: CapturedImage[];
  pendingRegion: CaptureRegion | null;
  confirmedRegion: CaptureRegion | null;
  selectingRegion: boolean;

  confirm: ConfirmRequest | null;
  notice: string | null;
  busy: boolean;

  init(): Promise<void>;
  refreshProjects(): Promise<void>;
  setScreen(screen: Screen): void;
  askConfirm(request: ConfirmRequest): void;
  closeConfirm(): void;
  notify(message: string): void;

  saveSettings(settings: Settings): Promise<void>;

  newProject(name: string): Promise<void>;
  openProject(name: string): Promise<void>;
  removeProject(name: string): Promise<void>;
  closeProject(): Promise<void>;
  resolveJournalOrphan(discard: boolean): Promise<void>;

  navigate(file: string): void;
  reorderImages(files: string[]): void;
  deleteImage(file: string): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;

  selectRectangle(id: string | null): void;
  setDrawMode(on: boolean): void;
  addRectangle(bounds: Rect): void;
  /** Find Text: create a rectangle and auto-run manga-ocr on it (spec 6.4). */
  addRectangleWithOcr(bounds: Rect): Promise<void>;
  moveResizeRectangle(id: string, newBounds: Rect): void;
  deleteRectangle(id: string): void;
  commitRectangleText(id: string, field: 'originalText' | 'translatedText', value: string): void;
  toggleReviewed(id: string): void;
  renumberRectangle(id: string, newIndex: number): void;
  /** Auto Translate Page: detect + OCR + translate (spec §7). */
  runAutoTranslatePage(): Promise<void>;
  /** Per-rectangle Auto Translate with full page context (spec §6.6). */
  autoTranslateRectangle(id: string): Promise<void>;
  cancelPipeline(): Promise<void>;

  beginAddPages(): void;
  beginRegionSelect(): void;
  onRectProposed(region: CaptureRegion): void;
  onRegionSelectCancelled(): void;
  confirmPendingRegion(): void;
  redrawRegion(): void;
  doCapture(): Promise<void>;
  reorderSessionImages(files: string[]): void;
  deleteSessionImage(file: string): void;
  endCaptureSession(): void;

  exportSelectedImage(): Promise<void>;
  exportProjectAs(format: ExportFormat): Promise<void>;
}

function persistAutosave(
  projectName: string | null,
  project: Project | null,
  journalEntry: unknown
): void {
  if (!projectName) return;
  window.api.autosaveProject(projectName, project, journalEntry).catch((err: unknown) => {
    console.error('Autosave failed', err);
  });
}

/** Keeps rectangle selection consistent after undo/redo applied project changes. */
function validRectangleId(
  project: Project,
  imageFile: string | null,
  id: string | null
): string | null {
  if (!id || !imageFile) return null;
  const image = project.images.find((i) => i.file === imageFile);
  return image?.rectangles.some((r) => r.id === id) ? id : null;
}

function boundsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export const useAppStore = create<AppState>((set, get) => ({
  settings: null,
  projects: [],
  screen: 'main',

  projectName: null,
  project: null,
  selectedImage: null,
  undoState: emptyUndoState,
  journalOrphan: false,
  selectedRectangleId: null,
  drawMode: false,
  pipelineProgress: null,

  sessionBaseline: [],
  sessionImages: [],
  pendingRegion: null,
  confirmedRegion: null,
  selectingRegion: false,

  confirm: null,
  notice: null,
  busy: false,

  async init() {
    const settings = await window.api.getSettings();
    set({ settings });
    await get().refreshProjects();
  },

  async refreshProjects() {
    const projects = await window.api.listProjects();
    set({ projects });
  },

  setScreen(screen) {
    set({ screen });
  },

  askConfirm(request) {
    set({ confirm: request });
  },

  closeConfirm() {
    set({ confirm: null });
  },

  notify(message) {
    if (noticeTimer) clearTimeout(noticeTimer);
    set({ notice: message });
    noticeTimer = setTimeout(() => set({ notice: null }), 5000);
  },

  async saveSettings(settings) {
    await window.api.setSettings(settings);
    set({ settings });
  },

  async newProject(name) {
    const project = await window.api.createProject(name);
    await window.api.setCurrentProject(name);
    set({
      projectName: name,
      project,
      selectedImage: null,
      undoState: emptyUndoState,
      journalOrphan: false,
      selectedRectangleId: null,
      drawMode: false,
      sessionBaseline: [],
      sessionImages: [],
      pendingRegion: null,
      confirmedRegion: null,
      screen: 'capture'
    });
    await get().refreshProjects();
  },

  async openProject(name) {
    const project = await window.api.loadProject(name);
    const orphan = await window.api.checkJournal(name);
    await window.api.setCurrentProject(name);
    set({
      projectName: name,
      project,
      selectedImage: project.images[0]?.file ?? null,
      undoState: emptyUndoState,
      journalOrphan: orphan,
      selectedRectangleId: null,
      drawMode: false,
      screen: 'project'
    });
  },

  async removeProject(name) {
    await window.api.deleteProject(name);
    if (get().projectName === name) {
      set({
        projectName: null,
        project: null,
        selectedImage: null,
        undoState: emptyUndoState,
        selectedRectangleId: null,
        drawMode: false
      });
    }
    await get().refreshProjects();
  },

  async closeProject() {
    await window.api.setCurrentProject(null);
    set({
      projectName: null,
      project: null,
      selectedImage: null,
      undoState: emptyUndoState,
      journalOrphan: false,
      selectedRectangleId: null,
      drawMode: false,
      screen: 'main'
    });
    await get().refreshProjects();
  },

  async resolveJournalOrphan(discard) {
    const { projectName } = get();
    if (discard && projectName) await window.api.discardJournal(projectName);
    set({ journalOrphan: false });
  },

  navigate(file) {
    const { selectedImage, projectName, undoState } = get();
    if (file === selectedImage) return;
    const action: ProjectAction = { type: 'NavigateImage', from: selectedImage, to: file };
    // Rectangle selection resets on image switch (spec 6.3).
    set({ selectedImage: file, selectedRectangleId: null, undoState: pushAction(undoState, action) });
    // Navigation is journaled but does not rewrite project.json (spec 8).
    persistAutosave(projectName, null, action);
  },

  reorderImages(files) {
    const { project, projectName, undoState } = get();
    if (!project) return;
    const action: ProjectAction = {
      type: 'ReorderImages',
      previousOrder: project.images.map((img) => img.file),
      newOrder: files
    };
    const next = applyActionToProject(project, action);
    set({ project: next, undoState: pushAction(undoState, action) });
    persistAutosave(projectName, next, action);
  },

  deleteImage(file) {
    const { project, projectName, undoState, selectedImage } = get();
    if (!project) return;
    const index = project.images.findIndex((img) => img.file === file);
    if (index < 0) return;
    const action: ProjectAction = { type: 'DeleteImage', image: project.images[index], index };
    const next = applyActionToProject(project, action);
    let selection = selectedImage;
    if (selection === file) {
      selection = next.images[Math.min(index, next.images.length - 1)]?.file ?? null;
    }
    set({
      project: next,
      selectedImage: selection,
      selectedRectangleId: selection === selectedImage ? get().selectedRectangleId : null,
      undoState: pushAction(undoState, action)
    });
    persistAutosave(projectName, next, action);
  },

  undo() {
    const { undoState, project, projectName } = get();
    const popped = popUndo(undoState);
    if (!popped) return;
    const { action, next } = popped;
    if (action.type === 'NavigateImage') {
      set({ selectedImage: action.from, selectedRectangleId: null, undoState: next });
      persistAutosave(projectName, null, { undo: action });
      return;
    }
    if (!project) return;
    const reverted = revertActionFromProject(project, action);
    const selected = get().selectedImage;
    const stillThere = reverted.images.some((img) => img.file === selected);
    const nextSelected = stillThere ? selected : reverted.images[0]?.file ?? null;
    set({
      project: reverted,
      selectedImage: nextSelected,
      selectedRectangleId: validRectangleId(reverted, nextSelected, get().selectedRectangleId),
      undoState: next
    });
    persistAutosave(projectName, reverted, { undo: action });
  },

  redo() {
    const { undoState, project, projectName } = get();
    const popped = popRedo(undoState);
    if (!popped) return;
    const { action, next } = popped;
    if (action.type === 'NavigateImage') {
      set({ selectedImage: action.to, selectedRectangleId: null, undoState: next });
      persistAutosave(projectName, null, { redo: action });
      return;
    }
    if (!project) return;
    const applied = applyActionToProject(project, action);
    const selected = get().selectedImage;
    const stillThere = applied.images.some((img) => img.file === selected);
    const nextSelected = stillThere ? selected : applied.images[0]?.file ?? null;
    set({
      project: applied,
      selectedImage: nextSelected,
      selectedRectangleId: validRectangleId(applied, nextSelected, get().selectedRectangleId),
      undoState: next
    });
    persistAutosave(projectName, applied, { redo: action });
  },

  canUndo() {
    return canUndo(get().undoState);
  },

  canRedo() {
    return canRedo(get().undoState);
  },

  selectRectangle(id) {
    set({ selectedRectangleId: id });
  },

  setDrawMode(on) {
    // Entering draw mode drops rectangle selection so the first drag cannot
    // be mistaken for a move (spec 6.4).
    set({ drawMode: on, selectedRectangleId: on ? null : get().selectedRectangleId });
  },

  addRectangle(bounds) {
    const { project, projectName, selectedImage, undoState } = get();
    if (!project || !selectedImage) return;
    const rectangle: TextRectangle = {
      id: crypto.randomUUID(),
      bounds,
      originalText: '',
      translatedText: '',
      reviewed: false,
      readingOrderIndex: 0, // assigned by computeReadingOrder during apply
      failed: false
    };
    const action: ProjectAction = { type: 'AddRectangle', imageFile: selectedImage, rectangle };
    const next = applyActionToProject(project, action);
    set({
      project: next,
      selectedRectangleId: rectangle.id,
      drawMode: false,
      undoState: pushAction(undoState, action)
    });
    persistAutosave(projectName, next, action);
  },

  async addRectangleWithOcr(bounds) {
    const { project, projectName, selectedImage, undoState, busy } = get();
    if (!project || !selectedImage || !projectName || busy) return;
    set({ busy: true, drawMode: false, pipelineProgress: 'Reading text with manga-ocr…' });
    let originalText = '';
    let failed = false;
    try {
      const result = await window.api.ocrRegion(projectName, selectedImage, bounds);
      originalText = result.text ?? '';
      failed = !!result.failed;
      if (failed && result.error) get().notify(`OCR failed: ${result.error}`);
    } catch (err) {
      failed = true;
      get().notify(`OCR failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Re-read project in case the user did something else — still commit onto current state.
    const latest = get();
    if (!latest.project || latest.selectedImage !== selectedImage) {
      set({ busy: false, pipelineProgress: null });
      return;
    }
    const rectangle: TextRectangle = {
      id: crypto.randomUUID(),
      bounds,
      originalText,
      translatedText: '',
      reviewed: false,
      readingOrderIndex: 0,
      failed
    };
    const action: ProjectAction = {
      type: 'AddRectangle',
      imageFile: selectedImage,
      rectangle
    };
    const next = applyActionToProject(latest.project, action);
    set({
      project: next,
      selectedRectangleId: rectangle.id,
      undoState: pushAction(latest.undoState, action),
      busy: false,
      pipelineProgress: null
    });
    persistAutosave(projectName, next, action);
  },

  moveResizeRectangle(id, newBounds) {
    const { project, projectName, selectedImage, undoState } = get();
    if (!project || !selectedImage) return;
    const current = project.images
      .find((i) => i.file === selectedImage)
      ?.rectangles.find((r) => r.id === id);
    if (!current || boundsEqual(current.bounds, newBounds)) return;
    const action: ProjectAction = {
      type: 'MoveResizeRectangle',
      imageFile: selectedImage,
      id,
      previousBounds: current.bounds,
      newBounds
    };
    const next = applyActionToProject(project, action);
    set({ project: next, undoState: pushAction(undoState, action) });
    persistAutosave(projectName, next, action);
  },

  deleteRectangle(id) {
    const { project, projectName, selectedImage, undoState, selectedRectangleId } = get();
    if (!project || !selectedImage) return;
    const rects = project.images.find((i) => i.file === selectedImage)?.rectangles ?? [];
    const index = rects.findIndex((r) => r.id === id);
    if (index < 0) return;
    const action: ProjectAction = {
      type: 'DeleteRectangle',
      imageFile: selectedImage,
      rectangle: rects[index],
      index
    };
    const next = applyActionToProject(project, action);
    set({
      project: next,
      selectedRectangleId: selectedRectangleId === id ? null : selectedRectangleId,
      undoState: pushAction(undoState, action)
    });
    persistAutosave(projectName, next, action);
  },

  commitRectangleText(id, field, value) {
    const { project, projectName, selectedImage, undoState } = get();
    if (!project || !selectedImage) return;
    const current = project.images
      .find((i) => i.file === selectedImage)
      ?.rectangles.find((r) => r.id === id);
    if (!current || current[field] === value) return;
    const action: ProjectAction = {
      type: 'EditRectangleText',
      imageFile: selectedImage,
      id,
      field,
      previousValue: current[field],
      newValue: value
    };
    const next = applyActionToProject(project, action);
    set({ project: next, undoState: pushAction(undoState, action) });
    persistAutosave(projectName, next, action);
  },

  toggleReviewed(id) {
    const { project, projectName, selectedImage, undoState } = get();
    if (!project || !selectedImage) return;
    const current = project.images
      .find((i) => i.file === selectedImage)
      ?.rectangles.find((r) => r.id === id);
    if (!current) return;
    const action: ProjectAction = {
      type: 'ToggleReviewed',
      imageFile: selectedImage,
      id,
      previousValue: current.reviewed
    };
    const next = applyActionToProject(project, action);
    set({ project: next, undoState: pushAction(undoState, action) });
    persistAutosave(projectName, next, action);
  },

  renumberRectangle(id, newIndex) {
    const { project, projectName, selectedImage, undoState } = get();
    if (!project || !selectedImage) return;
    const current = project.images
      .find((i) => i.file === selectedImage)
      ?.rectangles.find((r) => r.id === id);
    if (!current || current.readingOrderIndex === newIndex) return;
    const action: ProjectAction = {
      type: 'RenumberRectangle',
      imageFile: selectedImage,
      id,
      previousIndex: current.readingOrderIndex,
      newIndex
    };
    const next = applyActionToProject(project, action);
    set({ project: next, undoState: pushAction(undoState, action) });
    persistAutosave(projectName, next, action);
  },

  async runAutoTranslatePage() {
    const { project, projectName, selectedImage, busy } = get();
    if (!project || !projectName || !selectedImage || busy) return;
    const image = project.images.find((i) => i.file === selectedImage);
    if (!image) return;

    const start = async () => {
      set({ busy: true, pipelineProgress: 'Starting detection…', drawMode: false });
      const offProgress = window.api.onOcrProgress((event) => {
        set({ pipelineProgress: event.message || `${event.stage} ${event.current}/${event.total}` });
      });
      try {
        const result = await window.api.ocrDetectAndRead(projectName, selectedImage);
        if (result.cancelled) {
          get().notify('Auto Translate Page cancelled');
          return;
        }

        let working: TextRectangle[] = result.regions.map((region) => ({
          id: crypto.randomUUID(),
          bounds: region.bounds,
          originalText: region.text ?? '',
          translatedText: '',
          reviewed: false,
          readingOrderIndex: 0,
          failed: !!region.failed
        }));
        working = computeReadingOrder(working);

        set({ pipelineProgress: 'Translating page…' });
        const segments: TranslateSegment[] = [...working]
          .sort((a, b) => a.readingOrderIndex - b.readingOrderIndex)
          .map((r) => ({ rectangleId: r.id, originalText: r.originalText }));

        try {
          const translated = await window.api.translatePage({
            segments,
            sourceLang: 'ja',
            targetLang: 'en'
          });
          const byId = new Map(translated.results.map((r) => [r.rectangleId, r]));
          working = working.map((r) => {
            const hit = byId.get(r.id);
            if (!hit) return r;
            return {
              ...r,
              translatedText: hit.translatedText ?? '',
              failed: r.failed || !!hit.failed
            };
          });
        } catch (err) {
          // Connectivity / provider failure aborts translation but keeps OCR
          // rectangles (spec §7 / §11).
          get().notify(
            `Translation failed: ${err instanceof Error ? err.message : String(err)}. OCR results were kept.`
          );
        }

        const latest = get();
        if (!latest.project || latest.selectedImage !== selectedImage) return;
        const previousRectangles =
          latest.project.images.find((i) => i.file === selectedImage)?.rectangles ?? [];
        const action: ProjectAction = {
          type: 'ReplacePageRectangles',
          imageFile: selectedImage,
          previousRectangles,
          newRectangles: working
        };
        const next = applyActionToProject(latest.project, action);
        set({
          project: next,
          selectedRectangleId: null,
          undoState: pushAction(latest.undoState, action)
        });
        persistAutosave(projectName, next, action);
        const failedCount = working.filter((r) => r.failed).length;
        const translatedCount = working.filter((r) => r.translatedText.trim()).length;
        get().notify(
          `Page done: ${working.length} region(s), ${translatedCount} translated` +
            (failedCount ? `, ${failedCount} failed` : '')
        );
      } catch (err) {
        get().notify(
          `Auto Translate Page failed: ${err instanceof Error ? err.message : String(err)}`
        );
      } finally {
        offProgress();
        set({ busy: false, pipelineProgress: null });
      }
    };

    if (image.rectangles.length > 0) {
      get().askConfirm({
        title: 'Replace existing text rectangles?',
        body: `This page already has ${image.rectangles.length} rectangle(s). Auto Translate Page will replace them (undoable).`,
        confirmLabel: 'Replace',
        danger: true,
        onConfirm: () => void start()
      });
    } else {
      await start();
    }
  },

  async autoTranslateRectangle(id) {
    const { project, projectName, selectedImage, busy } = get();
    if (!project || !projectName || !selectedImage || busy) return;
    const image = project.images.find((i) => i.file === selectedImage);
    const target = image?.rectangles.find((r) => r.id === id);
    if (!image || !target) return;
    if (!target.originalText.trim()) {
      get().notify('Selected rectangle has no original text to translate');
      return;
    }

    set({ busy: true, pipelineProgress: 'Translating with page context…' });
    try {
      const segments: TranslateSegment[] = [...image.rectangles]
        .sort((a, b) => a.readingOrderIndex - b.readingOrderIndex)
        .map((r) => ({ rectangleId: r.id, originalText: r.originalText }));
      const response = await window.api.translatePage({
        segments,
        sourceLang: 'ja',
        targetLang: 'en'
      });
      const hit = response.results.find((r) => r.rectangleId === id);
      if (!hit) {
        get().notify('Translation provider returned no result for this rectangle');
        return;
      }
      const latest = get();
      if (!latest.project || latest.selectedImage !== selectedImage) return;
      const action: ProjectAction = {
        type: 'ApplyTranslations',
        imageFile: selectedImage,
        changes: [
          {
            id,
            previousTranslatedText: target.translatedText,
            newTranslatedText: hit.translatedText ?? '',
            previousFailed: target.failed,
            newFailed: !!hit.failed
          }
        ]
      };
      const next = applyActionToProject(latest.project, action);
      set({ project: next, undoState: pushAction(latest.undoState, action) });
      persistAutosave(projectName, next, action);
      if (hit.failed) {
        get().notify(`Translation failed: ${hit.error ?? 'unknown error'}`);
      }
    } catch (err) {
      get().notify(`Translation failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      set({ busy: false, pipelineProgress: null });
    }
  },

  async cancelPipeline() {
    try {
      await window.api.ocrCancel();
    } catch {
      // Best effort.
    }
  },

  beginAddPages() {
    const { project } = get();
    if (!project) return;
    set({
      sessionBaseline: project.images,
      sessionImages: [...project.images],
      pendingRegion: null,
      confirmedRegion: null,
      selectedRectangleId: null,
      drawMode: false,
      screen: 'capture'
    });
  },

  beginRegionSelect() {
    set({ selectingRegion: true, pendingRegion: null });
    void window.api.beginRegionSelect();
  },

  onRectProposed(region) {
    set({ pendingRegion: region, selectingRegion: false });
  },

  onRegionSelectCancelled() {
    set({ selectingRegion: false });
  },

  confirmPendingRegion() {
    const { pendingRegion } = get();
    if (pendingRegion) set({ confirmedRegion: pendingRegion, pendingRegion: null });
  },

  redrawRegion() {
    set({ pendingRegion: null });
    get().beginRegionSelect();
  },

  async doCapture() {
    const { confirmedRegion, projectName, sessionImages, busy } = get();
    if (!confirmedRegion || !projectName || busy) return;
    set({ busy: true });
    try {
      const { file } = await window.api.screenshot(projectName, confirmedRegion);
      set({ sessionImages: [...sessionImages, { file, rectangles: [] }] });
    } catch (err) {
      get().notify(`Capture failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      set({ busy: false });
    }
  },

  reorderSessionImages(files) {
    const { sessionImages } = get();
    const byFile = new Map(sessionImages.map((img) => [img.file, img]));
    const reordered = files
      .map((file) => byFile.get(file))
      .filter((img): img is CapturedImage => img !== undefined);
    set({ sessionImages: reordered });
  },

  deleteSessionImage(file) {
    set({ sessionImages: get().sessionImages.filter((img) => img.file !== file) });
  },

  /** Commits the whole capture-mode visit as one user action (spec v2 section 5). */
  endCaptureSession() {
    const { project, projectName, sessionBaseline, sessionImages, undoState } = get();
    if (!project || !projectName) return;
    const action: ProjectAction = {
      type: 'CommitCaptureSession',
      previousImages: sessionBaseline,
      newImages: sessionImages
    };
    const next = applyActionToProject(project, action);
    const selected = get().selectedImage;
    const stillThere = next.images.some((img) => img.file === selected);
    set({
      project: next,
      selectedImage: stillThere ? selected : next.images[0]?.file ?? null,
      undoState: pushAction(undoState, action),
      sessionBaseline: [],
      sessionImages: [],
      pendingRegion: null,
      confirmedRegion: null,
      screen: 'project'
    });
    void window.api.unregisterHotkey();
    persistAutosave(projectName, next, action);
  },

  async exportSelectedImage() {
    const { projectName, project, selectedImage, settings } = get();
    const image = project?.images.find((i) => i.file === selectedImage);
    if (!projectName || !image || !settings) return;
    set({ busy: true });
    try {
      const base64 = await compositePage(projectName, image, settings.exportFontFamily);
      const out = await window.api.exportImage(projectName, image.file, base64);
      get().notify(`Exported image: ${out}`);
    } catch (err) {
      get().notify(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      set({ busy: false });
    }
  },

  async exportProjectAs(format) {
    const { projectName, project, settings } = get();
    if (!projectName || !project || !settings) return;
    set({ busy: true });
    try {
      const pages: ExportedPage[] = [];
      for (let i = 0; i < project.images.length; i++) {
        const image = project.images[i];
        const dataBase64 = await compositePage(projectName, image, settings.exportFontFamily);
        pages.push({ name: `${zeroPaddedPrefix(i)}${image.file}`, dataBase64 });
      }
      const out = await window.api.exportProject(projectName, pages, format);
      get().notify(`Exported project: ${out}`);
    } catch (err) {
      get().notify(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      set({ busy: false });
    }
  }
}));
