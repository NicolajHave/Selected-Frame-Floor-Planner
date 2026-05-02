/**
 * Branded numeric types so we cannot accidentally mix mm with pixels
 * or degrees with radians at the type level.
 *
 * The `unique symbol` trick is purely compile-time; runtime values
 * remain plain numbers, so there is zero serialisation overhead.
 */
export type Mm = number & { readonly __brand: 'mm' };
export type Radians = number & { readonly __brand: 'radians' };

export const mm = (n: number): Mm => n as Mm;
export const rad = (n: number): Radians => n as Radians;

export const degToRad = (deg: number): Radians => ((deg * Math.PI) / 180) as Radians;
export const radToDeg = (r: Radians): number => (r as number) * (180 / Math.PI);

/** Pretty-print a length in mm or m depending on magnitude. */
export function formatLength(mmValue: number): string {
  if (mmValue >= 1000) return `${(mmValue / 1000).toFixed(2)} m`;
  return `${Math.round(mmValue)} mm`;
}

/** Pretty-print an area in m². */
export function formatArea(mmSquared: number): string {
  const m2 = mmSquared / 1_000_000;
  return `${m2.toFixed(2)} m²`;
}

/** Pretty-print an angle in degrees. */
export function formatAngle(deg: number): string {
  return `${deg.toFixed(1)}°`;
}
