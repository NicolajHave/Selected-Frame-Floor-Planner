'use client';

import { createContext, useContext } from 'react';

/**
 * How one still is staged, for the PDF's elevations: a wall drawn alone,
 * things left out, a light from the viewer's side.
 *
 * Mutable on purpose: the offscreen renderer changes it between pictures
 * of the same scene, and the scene reads it on every frame.
 */
export interface Stage {
  /** Draw only this wall of the room (its index); null: the usual cutaway towards the camera. */
  onlyWall: number | null;
  /** Ids of fixtures and pillars left out of the picture. */
  hidden: ReadonlySet<string>;
  /** Light everything evenly from the viewer's side, without shadows: a drawing rather than a room. */
  frontLight: boolean;
}

export const plainStage = (): Stage => ({ onlyWall: null, hidden: new Set(), frontLight: false });

/** Null in the editor's 3D view, which is never staged. */
export const StageContext = createContext<Stage | null>(null);

export const useStage = () => useContext(StageContext);
