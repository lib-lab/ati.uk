// Minimal external store: React subscribes via useSyncExternalStore.
import { useSyncExternalStore } from 'react';
import type { CommandResult } from '../domain/commands/result';
import type { AppState } from '../domain/types';
import { loadState, resetState, saveState, type KeyValueStorage } from './persistence';

type Listener = () => void;

export interface Store {
  getState(): AppState;
  /** Applies a domain command; on success persists and notifies. */
  run(command: (state: AppState) => CommandResult): CommandResult;
  reset(): void;
  subscribe(listener: Listener): () => void;
}

export function createStore(storage: KeyValueStorage | undefined): Store {
  let state = loadState(storage);
  const listeners = new Set<Listener>();
  const set = (next: AppState) => {
    state = next;
    saveState(storage, state);
    listeners.forEach((l) => l());
  };
  return {
    getState: () => state,
    run(command) {
      const result = command(state);
      if (result.ok) set(result.state);
      return result;
    },
    reset() {
      set(resetState(storage));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserStorage(): KeyValueStorage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export const store = createStore(browserStorage());

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
