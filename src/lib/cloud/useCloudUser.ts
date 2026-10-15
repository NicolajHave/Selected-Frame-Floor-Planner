'use client';

import { useEffect, useState } from 'react';
import { supabase } from './client';
import { CLOUD_ENABLED } from './config';

export interface CloudUser {
  id: string;
  email: string;
}

/** The signed-in user (null when signed out); `ready` once the session is known. */
export function useCloudUser(): { user: CloudUser | null; ready: boolean } {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [ready, setReady] = useState(!CLOUD_ENABLED);

  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    const toUser = (u: { id: string; email?: string } | null | undefined) =>
      u ? { id: u.id, email: (u.email ?? '').toLowerCase() } : null;
    let unsubscribe = () => {};
    let cancelled = false;
    void supabase().then((client) => {
      if (cancelled) return;
      // Fires once straight away with the stored session, then on every change.
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setUser(toUser(session?.user));
        setReady(true);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return { user, ready };
}
