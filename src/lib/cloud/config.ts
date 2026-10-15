/**
 * Where cloud projects live: the shared SELECTED Supabase project. The URL
 * and publishable key are public by design (every browser receives them);
 * access control is enforced by the fp_* database functions.
 *
 * Override with NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY, or set
 * NEXT_PUBLIC_SUPABASE_URL=off to run without cloud features.
 */
const DEFAULT_URL = 'https://xpfoozuhndqnhvfyokki.supabase.co';
const DEFAULT_KEY = 'sb_publishable_CLdIo986mYUfxur-QHv9eg_deL1WvrG';

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const CLOUD_URL = envUrl && envUrl !== 'off' ? envUrl : DEFAULT_URL;
export const CLOUD_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || DEFAULT_KEY;
export const CLOUD_ENABLED = envUrl !== 'off';

/** Only these accounts can use cloud projects (also enforced in the database). */
export const ALLOWED_DOMAIN = 'bestseller.com';
