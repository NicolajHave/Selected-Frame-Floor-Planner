import type { ElectricalKind } from '@/model/objects';

export interface ElectricalType {
  kind: ElectricalKind;
  name: string;
  /** Short code drawn in the plan symbol. */
  code: string;
  description: string;
  /** Default centre height above the floor, mm. */
  height: number;
  /** On a wall, or a box in the floor. */
  mount: 'wall' | 'floor';
}

/** Defaults for new points; the height can be changed per point. */
export const ELECTRICAL_TYPES: readonly ElectricalType[] = [
  { kind: 'socket', name: 'Socket', code: 'S', description: 'Single power outlet', height: 300, mount: 'wall' },
  { kind: 'double-socket', name: 'Double socket', code: 'S2', description: 'Two power outlets', height: 300, mount: 'wall' },
  { kind: 'data', name: 'Network', code: 'D', description: 'Data / network outlet', height: 300, mount: 'wall' },
  { kind: 'logo-power', name: 'LED logo power', code: 'L', description: 'Hidden connection behind an LED logo', height: 2500, mount: 'wall' },
  { kind: 'screen-power', name: 'Screen', code: 'TV', description: 'Power and data for a digital screen', height: 1600, mount: 'wall' },
  { kind: 'switch', name: 'Switch', code: 'SW', description: 'Light switch', height: 1100, mount: 'wall' },
  { kind: 'floor-box', name: 'Floor box', code: 'F', description: 'Power in the floor, e.g. under a table', height: 0, mount: 'floor' },
];

export function electricalType(kind: ElectricalKind): ElectricalType {
  return ELECTRICAL_TYPES.find((t) => t.kind === kind)!;
}
