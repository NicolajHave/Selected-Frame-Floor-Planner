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

/** Part of a page, as fractions of its width and height from the top-left. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Turns an image into a compact JPEG for the underlay. Transparent areas
 * become white so line drawings stay readable. PDFs go through `openPdf`,
 * so a page (and a part of it) can be chosen first.
 */
export async function rasterizePlanFile(file: File): Promise<RasterPlan> {
  if (isPdf(file)) {
    const pdf = await openPdf(file);
    try {
      return await pdf.render(1);
    } finally {
      pdf.close();
    }
  }
  return rasterizeImage(file);
}

/** An open PDF: page previews, and any page (or part of one) as an underlay. */
export interface PdfSource {
  pageCount: number;
  /** A small picture of page `n` (1-based) for choosing it. */
  preview: (n: number, maxSide: number) => Promise<{ src: string; aspect: number }>;
  /** Page `n`, or the `crop` of it, at full underlay resolution. */
  render: (n: number, crop?: Crop | null) => Promise<RasterPlan>;
  close: () => void;
}

export async function openPdf(file: File): Promise<PdfSource> {
  // Loaded on demand: pdf.js is large and only needed for this import.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url,
  ).toString();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const draw = async (n: number, maxSide: number, crop: Crop | null, type: 'image/jpeg' | 'image/png') => {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const cw = c.w * base.width;
    const ch = c.h * base.height;
    // The chosen part gets the full resolution; pdf.js draws only what falls on the canvas.
    const scale = maxSide / Math.max(cw, ch);
    const viewport = page.getViewport({
      scale,
      offsetX: -c.x * base.width * scale,
      offsetY: -c.y * base.height * scale,
    });
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    const canvas = whiteCanvas(w, h);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    page.cleanup();
    return { src: canvas.toDataURL(type, JPEG_QUALITY), aspect: h / w };
  };

  return {
    pageCount: doc.numPages,
    preview: (n, maxSide) => draw(n, maxSide, null, 'image/jpeg'),
    render: async (n, crop) => ({ ...(await draw(n, MAX_SIDE, crop ?? null, 'image/jpeg')), pageCount: doc.numPages }),
    close: () => void doc.destroy(),
  };
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
