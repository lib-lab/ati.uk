// localStorage persistence. Storage is injectable for tests.
import { buildSeedState, STATE_VERSION } from '../seed';
import type { AppState } from '../domain/types';

export const STORAGE_KEY = 'freight-board-prototype/state';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Loads saved state; falls back to a fresh seed if missing, corrupt or from another version. */
export function loadState(storage: KeyValueStorage | undefined): AppState {
  if (!storage) return buildSeedState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version === STATE_VERSION) return parsed;
    }
  } catch {
    // ignore and reseed
  }
  return buildSeedState();
}

export function saveState(storage: KeyValueStorage | undefined, state: AppState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // quota or private mode: the prototype keeps working in memory
  }
}

export function resetState(storage: KeyValueStorage | undefined): AppState {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return buildSeedState();
}
