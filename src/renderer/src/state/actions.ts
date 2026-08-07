import { CapturedImage, Project, ProjectAction, TextRectangle } from '../../../shared/types';
import { computeReadingOrder, renumber } from './readingOrder';

/**
 * Pure application of a user action to project state. Navigation actions
 * affect selection only (UI state), so the project passes through unchanged.
 */
export function applyActionToProject(project: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'CommitCaptureSession':
      return { ...project, images: action.newImages };
    case 'ReorderImages':
      return { ...project, images: orderImages(project.images, action.newOrder) };
    case 'DeleteImage':
      return { ...project, images: project.images.filter((img) => img.file !== action.image.file) };
    case 'NavigateImage':
      return project;
    case 'AddRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        computeReadingOrder([...rects, action.rectangle])
      );
    case 'DeleteRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        computeReadingOrder(rects.filter((r) => r.id !== action.rectangle.id))
      );
    case 'MoveResizeRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        computeReadingOrder(
          rects.map((r) => (r.id === action.id ? { ...r, bounds: action.newBounds } : r))
        )
      );
    case 'EditRectangleText':
      return mapImage(project, action.imageFile, (rects) =>
        rects.map((r) => (r.id === action.id ? { ...r, [action.field]: action.newValue } : r))
      );
    case 'ToggleReviewed':
      return mapImage(project, action.imageFile, (rects) =>
        rects.map((r) => (r.id === action.id ? { ...r, reviewed: !action.previousValue } : r))
      );
    case 'RenumberRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        renumber(rects, action.id, action.newIndex)
      );
    case 'ReplacePageRectangles':
      return mapImage(project, action.imageFile, () =>
        computeReadingOrder(action.newRectangles)
      );
  }
}

/** Inverse of applyActionToProject, using the data embedded in each action. */
export function revertActionFromProject(project: Project, action: ProjectAction): Project {
  switch (action.type) {
    case 'CommitCaptureSession':
      return { ...project, images: action.previousImages };
    case 'ReorderImages':
      return { ...project, images: orderImages(project.images, action.previousOrder) };
    case 'DeleteImage': {
      const images = [...project.images];
      images.splice(Math.min(action.index, images.length), 0, action.image);
      return { ...project, images };
    }
    case 'NavigateImage':
      return project;
    case 'AddRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        computeReadingOrder(rects.filter((r) => r.id !== action.rectangle.id))
      );
    case 'DeleteRectangle':
      return mapImage(project, action.imageFile, (rects) => {
        const next = [...rects];
        next.splice(Math.min(action.index, next.length), 0, action.rectangle);
        return computeReadingOrder(next);
      });
    case 'MoveResizeRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        computeReadingOrder(
          rects.map((r) => (r.id === action.id ? { ...r, bounds: action.previousBounds } : r))
        )
      );
    case 'EditRectangleText':
      return mapImage(project, action.imageFile, (rects) =>
        rects.map((r) => (r.id === action.id ? { ...r, [action.field]: action.previousValue } : r))
      );
    case 'ToggleReviewed':
      return mapImage(project, action.imageFile, (rects) =>
        rects.map((r) => (r.id === action.id ? { ...r, reviewed: action.previousValue } : r))
      );
    case 'RenumberRectangle':
      return mapImage(project, action.imageFile, (rects) =>
        renumber(rects, action.id, action.previousIndex)
      );
    case 'ReplacePageRectangles':
      return mapImage(project, action.imageFile, () =>
        computeReadingOrder(action.previousRectangles)
      );
  }
}

function orderImages(images: CapturedImage[], order: string[]): CapturedImage[] {
  const byFile = new Map(images.map((img) => [img.file, img]));
  return order.map((file) => byFile.get(file)).filter((img): img is CapturedImage => img !== undefined);
}

/** Applies fn to the rectangle list of one image, returning a new project. */
function mapImage(
  project: Project,
  imageFile: string,
  fn: (rects: TextRectangle[]) => TextRectangle[]
): Project {
  return {
    ...project,
    images: project.images.map((img) =>
      img.file === imageFile ? { ...img, rectangles: fn(img.rectangles) } : img
    )
  };
}
