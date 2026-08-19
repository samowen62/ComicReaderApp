import { CapturedImage, TextRectangle } from '../../../shared/types';
import { scaleRectAboutCenter } from './rectScale';
import { chooseFontSize, LINE_HEIGHT, wrapText } from './textFit';

/**
 * Canvas compositing for export (spec v2 section 10): each rectangle with
 * non-empty translated text gets a white background and horizontally rendered,
 * wrapped, auto-shrunk text in the configured export font.
 */

const PADDING_RATIO = 0.08;

export { scaleRectAboutCenter } from './rectScale';

export async function loadPageImage(projectName: string, file: string): Promise<HTMLImageElement> {
  const base64 = await window.api.readImageBase64(projectName, file);
  const img = new Image();
  img.src = `data:image/png;base64,${base64}`;
  await img.decode();
  return img;
}

/** Renders one page to PNG bytes (base64) per spec 10.1. */
export async function compositePage(
  projectName: string,
  image: CapturedImage,
  fontFamily: string,
  exportRectScale = 1
): Promise<string> {
  const img = await loadPageImage(projectName, image.file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  for (const rect of image.rectangles) {
    if (rect.translatedText.trim() === '') continue;
    drawTranslated(ctx, rect, fontFamily, exportRectScale);
  }

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function drawTranslated(
  ctx: CanvasRenderingContext2D,
  rect: TextRectangle,
  fontFamily: string,
  exportRectScale: number
): void {
  const { x, y, w, h } = scaleRectAboutCenter(rect.bounds, exportRectScale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);

  const pad = Math.max(2, Math.min(w, h) * PADDING_RATIO);
  const boxW = Math.max(4, w - pad * 2);
  const boxH = Math.max(4, h - pad * 2);
  const startPx = Math.min(48, boxH);

  const size = chooseFontSize(rect.translatedText, boxW, boxH, startPx, (s) => {
    ctx.font = `${s}px ${fontFamily}`;
    return (t) => ctx.measureText(t).width;
  });
  ctx.font = `${size}px ${fontFamily}`;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = wrapText(rect.translatedText, boxW, (t) => ctx.measureText(t).width);
  const lineHeight = size * LINE_HEIGHT;
  const totalHeight = lines.length * lineHeight;
  const startY = y + h / 2 - totalHeight / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, startY + i * lineHeight);
  });
}
