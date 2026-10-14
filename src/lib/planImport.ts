'use client';

/** Longest side of the stored raster, px. Enough to trace walls at ~5 mm on a 12 m plan. */
const MAX_SIDE = 2400;
const JPEG_QUALITY = 0.85;

export interface RasterPlan {
  src: string;       // JPEG data URL
  aspect: number;    // height / width
  pageCount: number; // 1 for images
}

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
 * Turns a floor-plan file into a compact JPEG for the underlay: the first
 * page of a PDF, or a downscaled copy of an image. Transparent areas become
 * white so line drawings stay readable.
 */
export async function rasterizePlanFile(file: File): Promise<RasterPlan> {
  return isPdf(file) ? rasterizePdf(file) : rasterizeImage(file);
}

async function rasterizePdf(file: File): Promise<RasterPlan> {
  // Loaded on demand: pdf.js is large and only needed for this import.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_SIDE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = whiteCanvas(Math.round(viewport.width), Math.round(viewport.height));
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    return {
      src: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      aspect: viewport.height / viewport.width,
      pageCount: doc.numPages,
    };
  } finally {
    void doc.destroy();
  }
}

async function rasterizeImage(file: File): Promise<RasterPlan> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Could not read ${file.name} as an image.`));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = whiteCanvas(w, h);
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { src: canvas.toDataURL('image/jpeg', JPEG_QUALITY), aspect: h / w, pageCount: 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function whiteCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return canvas;
}
