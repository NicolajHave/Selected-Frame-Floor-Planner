'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_KEY, CLOUD_URL } from './config';

let client: Promise<SupabaseClient> | null = null;

/** The Supabase client, loaded on first use so it stays out of the initial bundle. */
export function supabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(CLOUD_URL, CLOUD_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Its own key, so signing in here doesn't sign you in to other apps
        // that use the same Supabase project from another origin.
        storageKey: 'sf-planner:auth',
      },
    }),
  );
  return client;
}
