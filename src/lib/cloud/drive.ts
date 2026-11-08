'use client';

import { supabase } from './client';

/**
 * The shared cloud drive for store drawings (PDF, DWG, DXF, images): files
 * live in the private fp-drawings Storage bucket, what they are in the
 * fp_drawings table (see supabase/migrations/*_fp_drawings_drive.sql).
 */
export const DRIVE_BUCKET = 'fp-drawings';
/** Largest file the bucket takes. */
export const DRIVE_MAX_BYTES = 50 * 1024 * 1024;
export const DRIVE_ACCEPT = /\.(pdf|dwg|dxf|png|jpe?g|webp)$/i;

export interface Drawing {
  id: string;
  path: string;
  file_name: string;
  shop: string | null;
  size_bytes: number;
  uploaded_by_email: string;
  uploaded_at: string;
  mine: boolean;
}

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (await supabase()).rpc(fn, args);
  if (error) throw new Error(error.message || 'The cloud request failed.');
  return data as T;
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** A storage key for the file: a fresh folder, and a name storage accepts. */
export function drivePath(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const ext = fileName.slice(dot + 1).toLowerCase();
  const stem = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'drawing';
  return `${crypto.randomUUID()}/${stem}.${ext}`;
}

export const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

export const drive = {
  list: () => call<Drawing[]>('fp_list_drawings'),

  upload: async (file: File, shop: string): Promise<Drawing> => {
    if (!DRIVE_ACCEPT.test(file.name)) throw new Error('Upload a PDF, DWG, DXF or image (PNG, JPG, WebP).');
    if (file.size > DRIVE_MAX_BYTES) throw new Error(`${file.name} is ${sizeLabel(file.size)}; the drive takes up to 50 MB per file.`);
    const path = drivePath(file.name);
    const ext = path.slice(path.lastIndexOf('.') + 1);
    // Sent as raw bytes (not a form), so the stored file is exactly the original.
    const { error } = await (await supabase()).storage
      .from(DRIVE_BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream', upsert: false });
    if (error) throw new Error(error.message || 'The upload failed.');
    return call<Drawing>('fp_add_drawing', { p_path: path, p_file_name: file.name, p_shop: shop });
  },

  /** The drawing as a File, ready to import as the plan underlay. */
  download: async (d: Drawing): Promise<File> => {
    const { data, error } = await (await supabase()).storage.from(DRIVE_BUCKET).download(d.path);
    if (error || !data) throw new Error(error?.message || 'The drawing could not be downloaded.');
    return new File([data], d.file_name, { type: data.type });
  },

  remove: async (d: Drawing): Promise<void> => {
    const { error } = await (await supabase()).storage.from(DRIVE_BUCKET).remove([d.path]);
    if (error) throw new Error(error.message || 'The file could not be deleted.');
    await call<void>('fp_delete_drawing', { p_id: d.id });
  },
};
