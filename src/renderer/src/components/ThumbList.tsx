import React, { useRef } from 'react';
import { CapturedImage } from '../../../shared/types';
import { mediaUrl } from '../media';

interface ThumbListProps {
  images: CapturedImage[];
  mainDir: string;
  projectName: string;
  selectedFile?: string | null;
  onSelect?: (file: string) => void;
  onReorder: (files: string[]) => void;
  onDelete: (file: string) => void;
}

/** Ordered thumbnail list with HTML5 drag-to-reorder and per-item delete. */
export function ThumbList({
  images,
  mainDir,
  projectName,
  selectedFile,
  onSelect,
  onReorder,
  onDelete
}: ThumbListProps): React.JSX.Element {
  const dragIndex = useRef<number | null>(null);

  const moveItem = (from: number, to: number) => {
    if (from === to) return;
    const files = images.map((img) => img.file);
    const [moved] = files.splice(from, 1);
    files.splice(to, 0, moved);
    onReorder(files);
  };

  return (
    <ul className="thumb-list">
      {images.map((image, index) => (
        <li
          key={image.file}
          className={
            'thumb' + (selectedFile === image.file ? ' thumb-selected' : '')
          }
          draggable
          onDragStart={() => (dragIndex.current = index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex.current !== null) moveItem(dragIndex.current, index);
            dragIndex.current = null;
          }}
          onClick={() => onSelect?.(image.file)}
        >
          <img src={mediaUrl(mainDir, projectName, image.file)} alt={image.file} draggable={false} />
          <div className="thumb-footer">
            <span className="thumb-name" title={image.file}>
              {image.file}
            </span>
            <button
              className="thumb-delete"
              title="Delete image"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(image.file);
              }}
            >
              ×
            </button>
          </div>
        </li>
      ))}
      {images.length === 0 && <li className="thumb-empty">No captured images yet</li>}
    </ul>
  );
}
