import type { FloorFinish, RoomFinish, RoomPolygon } from '@/model/objects';

/**
 * What the shop is finished in: the floor (a kind of floor in one of its
 * colours) and the colour of the walls. Seen in the 3D view and in the
 * PDF's pictures; the plan stays a drawing.
 */

export type FloorKind = 'plain' | 'wood' | 'herringbone' | 'concrete' | 'tiles' | 'linoleum' | 'terrazzo' | 'carpet';

export interface FloorTone {
  id: string;
  name: string;
  /** The floor's main colour; its pattern is drawn in shades of it. */
  color: string;
}

export interface FloorType {
  kind: FloorKind;
  name: string;
  /** What it is, in a few words. */
  note: string;
  tones: FloorTone[];
  /** How matt it is: 0 mirror-like, 1 dull. */
  roughness: number;
  /** The stretch of floor one painted square covers, mm. */
  tile: number;
  /** Turned on the floor, degrees (herringbone runs on the diagonal). */
  turn?: number;
  /** It has a direction: it can be laid the other way. */
  directional?: boolean;
}

/** The floor of a plan with no finish chosen. */
export const DEFAULT_FLOOR_COLOR = '#DDD8CE';
/** The walls of a plan with no colour chosen. */
export const DEFAULT_WALL_COLOR = '#F1EEE7';

const OAK: FloorTone[] = [
  { id: 'light-oak', name: 'Light oak', color: '#D8BD93' },
  { id: 'natural-oak', name: 'Natural oak', color: '#C49B66' },
  { id: 'smoked-oak', name: 'Smoked oak', color: '#8B6B49' },
  { id: 'walnut', name: 'Walnut', color: '#6A4A33' },
  { id: 'grey-oak', name: 'Grey oak', color: '#A99F8F' },
  { id: 'whitewashed', name: 'Whitewashed', color: '#E2D6C1' },
];

export const FLOOR_TYPES: readonly FloorType[] = [
  {
    kind: 'plain',
    name: 'Plain',
    note: 'One even colour',
    tones: [
      { id: 'neutral', name: 'Neutral', color: DEFAULT_FLOOR_COLOR },
      { id: 'white', name: 'White', color: '#EFEDE8' },
      { id: 'grey', name: 'Grey', color: '#B4B3AF' },
      { id: 'dark', name: 'Dark', color: '#5B5B5A' },
    ],
    roughness: 0.95,
    tile: 1000,
  },
  { kind: 'wood', name: 'Wood', note: 'Planks, 200 mm wide', tones: OAK, roughness: 0.62, tile: 2400, directional: true },
  {
    kind: 'herringbone',
    name: 'Herringbone',
    note: 'Parquet blocks, 100 × 400 mm',
    tones: OAK.slice(0, 4),
    roughness: 0.58,
    tile: 2400,
    turn: 45,
  },
  {
    kind: 'concrete',
    name: 'Concrete',
    note: 'Polished, poured in one',
    tones: [
      { id: 'light', name: 'Light', color: '#C8C6C0' },
      { id: 'grey', name: 'Grey', color: '#A8A7A3' },
      { id: 'warm', name: 'Warm', color: '#BCB3A5' },
      { id: 'dark', name: 'Dark', color: '#6D6D6B' },
    ],
    roughness: 0.5,
    tile: 3000,
  },
  {
    kind: 'tiles',
    name: 'Tiles',
    note: '600 × 600 mm',
    tones: [
      { id: 'light-grey', name: 'Light grey', color: '#CECCC7' },
      { id: 'sand', name: 'Sand', color: '#D7CCB7' },
      { id: 'white', name: 'White', color: '#EBE9E3' },
      { id: 'terracotta', name: 'Terracotta', color: '#B5694A' },
      { id: 'anthracite', name: 'Anthracite', color: '#4A4B4D' },
    ],
    roughness: 0.38,
    tile: 1200,
  },
  {
    kind: 'linoleum',
    name: 'Linoleum',
    note: 'Marbled, in one sheet',
    tones: [
      { id: 'pebble', name: 'Pebble grey', color: '#B8B6AF' },
      { id: 'sand', name: 'Sand', color: '#CCBD9E' },
      { id: 'sage', name: 'Sage', color: '#A8B399' },
      { id: 'blue-grey', name: 'Blue grey', color: '#93A2AC' },
      { id: 'terracotta', name: 'Terracotta', color: '#B3654A' },
      { id: 'charcoal', name: 'Charcoal', color: '#46484B' },
    ],
    roughness: 0.6,
    tile: 2000,
  },
  {
    kind: 'terrazzo',
    name: 'Terrazzo',
    note: 'Stone chips in a ground',
    tones: [
      { id: 'light', name: 'Light', color: '#D8D4CB' },
      { id: 'warm', name: 'Warm', color: '#D7C8B3' },
      { id: 'dark', name: 'Dark', color: '#56575B' },
    ],
    roughness: 0.42,
    tile: 1500,
  },
  {
    kind: 'carpet',
    name: 'Carpet',
    note: 'Wall to wall',
    tones: [
      { id: 'grey', name: 'Grey', color: '#8D8E8F' },
      { id: 'beige', name: 'Beige', color: '#B8AA92' },
      { id: 'moss', name: 'Moss', color: '#6E795A' },
      { id: 'anthracite', name: 'Anthracite', color: '#404245' },
    ],
    roughness: 1,
    tile: 800,
  },
];

export const floorType = (kind: string): FloorType => FLOOR_TYPES.find((t) => t.kind === kind) ?? FLOOR_TYPES[0]!;

const HEX = /^#[0-9a-f]{6}$/i;
export const isColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

export interface ResolvedFloor {
  type: FloorType;
  /** The tone chosen, or null for a colour of one's own. */
  tone: FloorTone | null;
  color: string;
  /** Degrees it is turned on the floor. */
  turn: number;
  /** "Wood · Natural oak", for lists and the PDF. */
  label: string;
}

/**
 * The floor a finish stands for. Anything it does not know — a kind or a
 * colour from a newer version of the planner — falls back to what it does.
 */
export function resolveFloor(finish: FloorFinish | undefined | null): ResolvedFloor {
  const type = floorType(finish?.kind ?? 'plain');
  // A tone belongs to its kind: with a kind that is not known, it says nothing.
  const asked = type.kind === finish?.kind ? finish.tone : undefined;
  const own = isColor(asked) ? asked : null;
  const tone = own ? null : type.tones.find((t) => t.id === asked) ?? type.tones[0]!;
  return {
    type,
    tone,
    color: own ?? tone!.color,
    turn: (type.turn ?? 0) + (type.directional && finish?.turned ? 90 : 0),
    label: type.kind === 'plain' ? `Plain · ${tone ? tone.name : own}` : `${type.name} · ${tone ? tone.name : own}`,
  };
}

/** The floor of a room, and whether one was chosen at all. */
export const roomFloor = (room: RoomPolygon | null | undefined) => resolveFloor(room?.finish?.floor);

export interface WallColor {
  id: string;
  name: string;
  color: string;
}

export const WALL_COLORS: readonly WallColor[] = [
  { id: 'warm-white', name: 'Warm white', color: DEFAULT_WALL_COLOR },
  { id: 'white', name: 'White', color: '#FAFAF7' },
  { id: 'light-grey', name: 'Light grey', color: '#D8D7D3' },
  { id: 'greige', name: 'Greige', color: '#CEC5B7' },
  { id: 'sand', name: 'Sand', color: '#D8C6A7' },
  { id: 'mint', name: 'Mint', color: '#C6DACB' },
  { id: 'sage', name: 'Sage', color: '#A8B399' },
  { id: 'dusty-blue', name: 'Dusty blue', color: '#9EB0BC' },
  { id: 'terracotta', name: 'Terracotta', color: '#B76E51' },
  { id: 'olive', name: 'Olive', color: '#6E7253' },
  { id: 'charcoal', name: 'Charcoal', color: '#46484B' },
  { id: 'black', name: 'Black', color: '#1F2022' },
];

/** The colour of the room's walls. */
export const roomWallColor = (room: RoomPolygon | null | undefined): string =>
  isColor(room?.finish?.wall) ? room!.finish!.wall! : DEFAULT_WALL_COLOR;

/** The colour of wall `index`: its own if it has one, the room's otherwise. */
export function wallColorOf(room: RoomPolygon, index: number): string {
  const id = room.corners[index]?.id;
  const own = id ? room.walls?.[id]?.color : undefined;
  return isColor(own) ? own : roomWallColor(room);
}

/** What a colour is called: its name in the list, or the code of one's own. */
export const wallColorName = (color: string): string =>
  WALL_COLORS.find((c) => c.color.toLowerCase() === color.toLowerCase())?.name ?? color.toUpperCase();

const KIND = /^[a-z][a-z-]{0,31}$/;
const TONE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Only what a finish may hold, from something that came from outside (a
 * link, this browser's storage): a kind of floor with a tone and whether it
 * is laid the other way, and a wall colour. Null when nothing of it is one.
 */
export function cleanFinish(raw: unknown): RoomFinish | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { floor?: unknown; wall?: unknown };
  const out: RoomFinish = {};
  const f = r.floor as { kind?: unknown; tone?: unknown; turned?: unknown } | null | undefined;
  if (f && typeof f === 'object' && typeof f.kind === 'string' && KIND.test(f.kind)) {
    out.floor = { kind: f.kind };
    if (typeof f.tone === 'string' && (TONE.test(f.tone) || isColor(f.tone))) out.floor.tone = f.tone;
    if (f.turned === true) out.floor.turned = true;
  }
  if (isColor(r.wall)) out.wall = r.wall;
  return out.floor || out.wall ? out : null;
}

/** A plan's finish with another laid over it: where the other says something, that; elsewhere the plan's. */
export function overlayFinish(plan: RoomFinish | undefined | null, over: RoomFinish | undefined | null): RoomFinish | undefined {
  const floor = over?.floor ?? plan?.floor;
  const wall = over?.wall ?? plan?.wall;
  if (!floor && !wall) return undefined;
  return { ...(floor ? { floor } : {}), ...(wall ? { wall } : {}) };
}

/** "Wood · Smoked oak · walls Sage": a finish in words; only what it says. */
export function finishInWords(finish: RoomFinish | undefined | null): string {
  const parts: string[] = [];
  if (finish?.floor) parts.push(resolveFloor(finish.floor).label);
  if (isColor(finish?.wall)) parts.push(`walls ${wallColorName(finish!.wall!)}`);
  return parts.join(' · ');
}

export const sameFinish = (a: RoomFinish | undefined | null, b: RoomFinish | undefined | null) =>
  JSON.stringify(cleanFinish(a)) === JSON.stringify(cleanFinish(b));
