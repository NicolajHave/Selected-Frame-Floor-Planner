'use client';

import { useEffect } from 'react';
import { setPriceList, type PriceListData } from '@/lib/prices';
import { cloud, type CloudPriceList } from './api';
import type { CloudUser } from './useCloudUser';

/**
 * The price list in use is kept in the cloud (fp_price_lists), so a new one
 * does not need a release: anyone signed in can edit it in the planner
 * (File → Price list…) and every save is kept with who and when.
 *
 * Prices are internal: the cloud list is only read while signed in. Signed
 * out, the planner shows the list built into it.
 */

const CACHE_KEY = 'sf-planner:price-list';

const toData = (l: CloudPriceList): PriceListData => ({ id: l.id, name: l.name, date: l.valid_from, prices: l.prices });

function cached(): PriceListData | null {
  try {
    const l = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null') as PriceListData | null;
    return l && typeof l.name === 'string' && typeof l.date === 'string' && l.prices && typeof l.prices === 'object' ? l : null;
  } catch {
    return null;
  }
}

function remember(l: PriceListData | null) {
  try {
    if (l) window.localStorage.setItem(CACHE_KEY, JSON.stringify(l));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // No storage: the list is fetched again next time.
  }
}

/** Puts the cloud's price list in use: at once from this browser's copy, then fresh from the cloud. */
export async function loadPriceList(): Promise<void> {
  const local = cached();
  if (local) setPriceList(local);
  try {
    const l = await cloud.getPriceList();
    const data = l ? toData(l) : null;
    setPriceList(data);
    remember(data);
  } catch {
    // Offline, or a database from before the price list: keep what we have.
  }
}

/** Saves a new price list and puts it in use. */
export async function savePriceList(name: string, date: string, prices: Record<string, number | null>): Promise<void> {
  const data = toData(await cloud.savePriceList(name, date, prices));
  setPriceList(data);
  remember(data);
}

/** Keeps the price list in step with who is signed in. */
export function usePriceListSync(user: CloudUser | null, ready: boolean) {
  const email = user?.email ?? null;
  useEffect(() => {
    if (!ready) return;
    if (email) void loadPriceList();
    else {
      // Signed out: back to the built-in list, and nothing internal left behind.
      setPriceList(null);
      remember(null);
    }
  }, [email, ready]);
}
