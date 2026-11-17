/**
 * `settings.json`: settings shared by every harness on this computer. Only
 * what the person changed is saved; {@link loadSettings} merges the file over
 * the protocol's defaults.
 */

import { DEFAULT_SETTINGS, type OpenArtifactSettings } from '@open-artifact/protocol';
import { expandHome, files, readJson, writeJson } from './paths.ts';

/**
 * The settings in effect: the saved file over {@link DEFAULT_SETTINGS}, with
 * `~` expanded. `$OPEN_ARTIFACT_USER_TYPES`, `$OPEN_ARTIFACT_EXTRA_TYPES` (colon separated) and
 * `$OPEN_ARTIFACT_PORT` move the type roots and the port without touching the file
 * (tests, dev checkouts).
 */
export function loadSettings(): OpenArtifactSettings {
  const saved = readJson<Partial<OpenArtifactSettings> | null>(files.settings(), {}) ?? {};
  const merged: OpenArtifactSettings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    typeRoots: { ...DEFAULT_SETTINGS.typeRoots, ...(saved.typeRoots ?? {}) },
    wake: { ...DEFAULT_SETTINGS.wake, ...(saved.wake ?? {}) },
  };
  if (process.env.OPEN_ARTIFACT_USER_TYPES) merged.typeRoots.user = process.env.OPEN_ARTIFACT_USER_TYPES;
  if (process.env.OPEN_ARTIFACT_EXTRA_TYPES) {
    merged.typeRoots.extra = [...merged.typeRoots.extra, ...process.env.OPEN_ARTIFACT_EXTRA_TYPES.split(':').filter(Boolean)];
  }
  merged.typeRoots.user = expandHome(merged.typeRoots.user);
  merged.typeRoots.extra = merged.typeRoots.extra.map(expandHome);
  merged.homeWorkspace = expandHome(merged.homeWorkspace);
  merged.trustedProjects = (merged.trustedProjects ?? []).map(expandHome);
  if (process.env.OPEN_ARTIFACT_PORT) merged.serverPort = Number(process.env.OPEN_ARTIFACT_PORT);
  return merged;
}

/** Merges `patch` into the saved file (only what the person set is kept there). */
export function saveSettings(patch: Partial<OpenArtifactSettings>): void {
  const saved = readJson<Partial<OpenArtifactSettings> | null>(files.settings(), {}) ?? {};
  writeJson(files.settings(), { ...saved, ...patch });
}
