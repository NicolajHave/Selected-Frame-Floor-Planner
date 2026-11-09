import type { Accessory, InventoryItem } from '@/model/objects';
import { findAsset, type AssetEntry } from './assetCatalog';
import { rackSlots } from './racks';

/**
 * Accessories belong to a fixture and are added from its panel, never placed
 * on their own: rack signs on floor racks, the leather tray on the Iconic
 * table, oak trays on shelf wall units, the A5 sign on the Volume table and
 * the floor price sign in front of a mannequin.
 *
 * Positions are measured on the Blender models (scripts/blender), in plan mm
 * around the host's centre (unrotated: back towards −y, front towards +y)
 * and mm above the floor.
 */

export const RACK_SIGN = '105-06-011-22-C';
export const LEATHER_TRAY = '105-15-001';
export const TRAY_3X3 = '105-15-003';
export const TRAY_3X5 = '105-15-004';
export const TABLE_SIGN = '105-13-023';
export const PRICE_SIGN = '105-18-001';

export const ACCESSORY_IDS: readonly string[] = [RACK_SIGN, LEATHER_TRAY, TRAY_3X3, TRAY_3X5, TABLE_SIGN, PRICE_SIGN];
export const isAccessory = (assetId: string | undefined) => !!assetId && ACCESSORY_IDS.includes(assetId);

/** Floor racks: the middle of the double post at the thick end, and its top. */
const RACK_POSTS: Record<string, { x: number; top: number }> = {
  '105-06-001': { x: -615, top: 1508 },
  '105-06-002': { x: -360, top: 1508 },
  '105-06-010': { x: -615, top: 1508 },
  '105-06-011': { x: -615, top: 1508 },
  '105-06-013': { x: -610, top: 1508 },
  '105-06-014': { x: -615, top: 1708 },
  '105-06-014-700': { x: -360, top: 1708 },
};
/** The sign's pin goes down between the two uprights; the holder rests on top. */
const RACK_SIGN_PIN = 95;

/**
 * Shelf wall units (&elements 105-99-010-A): shelves between the uprights
 * (95 mm each side), tops at 484 / 844 / 1204 / 1564 mm, 117–517 mm from the wall.
 */
const SHELF_UNITS: Record<string, { x0: number; x1: number }> = {
  '105-99-004': { x0: -653, x1: 653 },
  '105-99-010': { x0: -310, x1: 310 },
};
export const SHELF_TOPS = [484, 844, 1204, 1564] as const;
/** New trays go to the eye-level shelves first. */
const SHELF_FILL_ORDER = [2, 1, 3, 0];
/** Middle of the shelves front to back, from a unit's centre (517 deep: wall at −258.5, shelves 117–517 off it). */
const SHELF_Y = -517 / 2 + (117 + 517) / 2;
/** Clearance at the shelf ends and between trays, mm. */
const TRAY_GAP = 15;

const ICONIC_TABLE = '105-17-007';
const VOLUME_TABLE = '105-17-001';
const MANNEQUINS = ['112-18-001', '112-18-002'];

interface Rule {
  hosts: readonly string[];
  /** Most per host unit; trays are limited by shelf room instead. */
  max: number;
}

const RULES: Record<string, Rule> = {
  [RACK_SIGN]: { hosts: Object.keys(RACK_POSTS), max: 1 },
  [LEATHER_TRAY]: { hosts: [ICONIC_TABLE], max: 1 },
  [TRAY_3X3]: { hosts: Object.keys(SHELF_UNITS), max: Infinity },
  [TRAY_3X5]: { hosts: Object.keys(SHELF_UNITS), max: Infinity },
  [TABLE_SIGN]: { hosts: [VOLUME_TABLE], max: 2 },
  [PRICE_SIGN]: { hosts: MANNEQUINS, max: 1 },
};

/** The accessories a catalog item takes, with how many of each. */
export function accessoryOptions(hostAssetId: string | undefined): { asset: AssetEntry; max: number }[] {
  if (!hostAssetId) return [];
  return ACCESSORY_IDS.filter((id) => RULES[id]!.hosts.includes(hostAssetId)).map((id) => ({
    asset: findAsset(id)!,
    max: RULES[id]!.max,
  }));
}

/** One place a fixture takes accessories: the fixture itself, or one unit of a wall rack. */
export interface AccessoryHost {
  /** Index of the wall rack unit; undefined for the fixture itself. */
  module?: number;
  asset: AssetEntry;
  /** Offset of this unit from the fixture's centre, plan mm. */
  x: number;
  y: number;
}

export function accessoryHosts(item: Pick<InventoryItem, 'assetRef' | 'modules'>): AccessoryHost[] {
  if (item.modules?.length) {
    return rackSlots(item.modules)
      .map((slot, module) => ({ module, asset: slot.asset, x: slot.x, y: slot.y }))
      .filter((h) => accessoryOptions(h.asset.id).length > 0);
  }
  const asset = findAsset(item.assetRef);
  return asset && accessoryOptions(asset.id).length > 0 ? [{ asset, x: 0, y: 0 }] : [];
}

export interface AccessoryPlacement {
  accessory: Accessory;
  asset: AssetEntry;
  /** Centre in plan mm around the fixture's centre (unrotated), bottom height above the floor. */
  x: number;
  y: number;
  z: number;
  /** Turn about the vertical axis, radians, in the fixture's frame (0 = as modelled). */
  rot: number;
}

/** The acrylic sign stands across the rack, not along it: a quarter turn from the model. */
const RACK_SIGN_TURN = Math.PI / 2;

const onHost = (a: Accessory, host: AccessoryHost) => (a.module ?? undefined) === host.module;

/**
 * Lays out trays shelf by shelf, left to right in the order they were added.
 * Returns their x centres, or null for a shelf that is over-full.
 */
function trayRow(unit: string, trays: Accessory[]): Map<string, number> | null {
  const span = SHELF_UNITS[unit];
  if (!span) return null;
  const out = new Map<string, number>();
  let cursor = span.x0 + TRAY_GAP;
  for (const t of trays) {
    const w = findAsset(t.assetRef)?.size.width ?? 0;
    if (cursor + w > span.x1 - TRAY_GAP + 0.5) return null;
    out.set(t.id, cursor + w / 2);
    cursor += w + TRAY_GAP;
  }
  return out;
}

/** Where each of a fixture's accessories sits. Ones that no longer fit are left out. */
export function placeAccessories(
  item: Pick<InventoryItem, 'assetRef' | 'modules' | 'accessories'>,
): AccessoryPlacement[] {
  const list = item.accessories ?? [];
  if (!list.length) return [];
  const out: AccessoryPlacement[] = [];
  for (const host of accessoryHosts(item)) {
    const mine = list.filter((a) => onHost(a, host));
    const hostId = host.asset.id;
    // Shelves: pack each one separately.
    const trays = mine.filter((a) => a.assetRef === TRAY_3X3 || a.assetRef === TRAY_3X5);
    const rows = SHELF_TOPS.map((_, shelf) => trayRow(hostId, trays.filter((t) => (t.shelf ?? 0) === shelf)));
    let tableSigns = 0;
    for (const a of mine) {
      const asset = findAsset(a.assetRef);
      if (!asset || !RULES[a.assetRef]?.hosts.includes(hostId)) continue;
      let p: { x: number; y: number; z: number; rot?: number } | null = null;
      if (a.assetRef === RACK_SIGN) {
        const post = RACK_POSTS[hostId]!;
        p = { x: post.x, y: 0, z: post.top - RACK_SIGN_PIN, rot: RACK_SIGN_TURN };
      } else if (a.assetRef === LEATHER_TRAY) {
        // Over the table's foot, where the top is thickest.
        p = { x: 65, y: 76, z: 650 };
      } else if (a.assetRef === TABLE_SIGN) {
        // On the upper shelf: first the left half, then the right.
        p = { x: tableSigns++ === 0 ? -450 : 450, y: 0, z: 816 };
      } else if (a.assetRef === PRICE_SIGN) {
        // On the floor just in front of the mannequin.
        p = { x: 0, y: host.asset.size.depth / 2 + 40 + asset.size.depth / 2, z: 0 };
      } else {
        const shelf = a.shelf ?? 0;
        const x = rows[shelf]?.get(a.id);
        if (x !== undefined) p = { x, y: SHELF_Y, z: SHELF_TOPS[shelf]! };
      }
      if (p) out.push({ accessory: a, asset, x: p.x + host.x, y: p.y + host.y, z: p.z, rot: p.rot ?? 0 });
    }
  }
  return out;
}

/**
 * The shelf a new tray of `assetRef` fits on (eye level first), or null
 * when the unit's shelves are full.
 */
export function freeShelf(
  item: Pick<InventoryItem, 'assetRef' | 'modules' | 'accessories'>,
  host: AccessoryHost,
  assetRef: string,
  shelves: readonly number[] = SHELF_FILL_ORDER,
): number | null {
  const trays = (item.accessories ?? []).filter(
    (a) => onHost(a, host) && (a.assetRef === TRAY_3X3 || a.assetRef === TRAY_3X5),
  );
  for (const shelf of shelves) {
    const row = [...trays.filter((t) => (t.shelf ?? 0) === shelf), { id: '?', assetRef, shelf }];
    if (trayRow(host.asset.id, row)) return shelf;
  }
  return null;
}

/** How many more of `assetRef` the host takes (Infinity for trays: shelf room decides). */
export function roomFor(
  item: Pick<InventoryItem, 'accessories'>,
  host: AccessoryHost,
  assetRef: string,
): number {
  const rule = RULES[assetRef];
  if (!rule?.hosts.includes(host.asset.id)) return 0;
  const used = (item.accessories ?? []).filter((a) => onHost(a, host) && a.assetRef === assetRef).length;
  return rule.max - used;
}
