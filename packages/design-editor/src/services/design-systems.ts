/**
 * Installed design systems, loaded and kept current (the pure reading is in
 * `lib/design-systems.ts`).
 *
 * `useDesignSystems` holds what every installed system offers. The Theme
 * tab lists them; the properties panel's color fields offer their colors as
 * swatches ({@link useSystemSwatches}) and its Text style menu their type
 * styles ({@link useSystemTextStyles}). Shared pickers plug in through the
 * same two hooks.
 *
 * Tokens are re-read when `designSystems` in canvas.json changes or when a
 * `tokens.json` under `project/ds/` changes.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { createSystemsLoader } from '@open-artifact/editor-kit';
import type { DesignSystemRecord } from '@open-artifact/design-core';
import { useDocument } from '../state/document.ts';
import { DS_DIR, installedRecords, swatchValue, systemFromTokens, type InstalledSystem, type SystemColor, type SystemTextStyle } from '../lib/design-systems.ts';
import { session } from './session.ts';

export * from '../lib/design-systems.ts';

interface DesignSystemsState {
  systems: InstalledSystem[];
  /** Records listed in canvas.json whose copy could not be read (no tokens.json, or not JSON). */
  missing: string[];
  loaded: boolean;
}

/** The installed systems, as last read. */
export const useDesignSystems = create<DesignSystemsState>()(() => ({ systems: [], missing: [], loaded: false }));

/** A color a field can offer: the swatch's label, what it writes and what it shows. */
export interface Swatch {
  label: string;
  group: string;
  /** What picking it writes (`var(--token, literal)`). */
  value: string;
  /** The literal color drawn on the swatch. */
  color: string;
  token: string;
}

/** Swatches of every installed system's colors, grouped by system. */
export function swatchesOf(systems: readonly InstalledSystem[]): Swatch[] {
  return systems.flatMap((system) => system.colors.map((color: SystemColor) => ({ label: color.name, group: system.title, value: swatchValue(color), color: color.value, token: color.name })));
}

/** The installed systems' colors as swatches (for color fields and pickers). */
export function useSystemSwatches(): Swatch[] {
  const systems = useDesignSystems((s) => s.systems);
  return useMemo(() => swatchesOf(systems), [systems]);
}

/** The installed systems' type styles (for Text style menus). */
export function useSystemTextStyles(): SystemTextStyle[] {
  const systems = useDesignSystems((s) => s.systems);
  return useMemo(() => systems.flatMap((system) => system.styles), [systems]);
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

const loader = createSystemsLoader<DesignSystemRecord, InstalledSystem>({
  artifact: () => session().artifact,
  records: () => installedRecords(useDocument.getState().canvas.designSystems),
  subscribe: (listener) => useDocument.subscribe(listener),
  read: systemFromTokens,
  loaded: ({ systems, missing }) => useDesignSystems.setState({ systems, missing, loaded: true }),
});

/** Loads the installed systems and keeps them current (`createSystemsLoader`, `@open-artifact/editor-kit`). Call once the canvas is loaded. */
export function startDesignSystems(): void {
  loader.start();
}

/** The address of an installed copy's README (shown read-only in the Theme tab). */
export const readmePath = (namespace: string): string => `${DS_DIR}${namespace}/README.md`;
