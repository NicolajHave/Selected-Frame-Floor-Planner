'use client';

import { createContext, useContext } from 'react';

/**
 * 'interactive' is the editor's 3D view: selection outlines and dragging.
 * 'render' is an offscreen still for the PDF: no editing affordances.
 */
export type SceneMode = 'interactive' | 'render';

export const SceneModeContext = createContext<SceneMode>('interactive');

export const useSceneMode = () => useContext(SceneModeContext);
