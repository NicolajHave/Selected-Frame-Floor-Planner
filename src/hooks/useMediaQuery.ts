'use client';

import { useEffect, useState } from 'react';

/** Whether a CSS media query matches; false until mounted so server and client agree. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Phones and narrow tablets: the side panels become drawers over the plan. */
export const NARROW_SCREEN = '(max-width: 900px)';
