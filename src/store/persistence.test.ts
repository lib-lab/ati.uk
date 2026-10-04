import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../seed';
import { loadState, resetState, saveState, STORAGE_KEY, type KeyValueStorage } from './persistence';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('persistence', () => {
  it('seeds when storage is empty', () => {
    expect(loadState(memoryStorage())).toEqual(buildSeedState());
  });

  it('round-trips saved state', () => {
    const storage = memoryStorage();
    const state = { ...buildSeedState(), actorId: 'c05' };
    saveState(storage, state);
    expect(loadState(storage).actorId).toBe('c05');
  });

  it('reseeds on corrupt data or a different version', () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(loadState(storage).actorId).toBe(buildSeedState().actorId);
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...buildSeedState(), version: -1, actorId: 'c05' }));
    expect(loadState(storage).actorId).toBe(buildSeedState().actorId);
  });

  it('reset clears storage and returns the seed', () => {
    const storage = memoryStorage();
    saveState(storage, { ...buildSeedState(), actorId: 'c05' });
    expect(resetState(storage)).toEqual(buildSeedState());
    expect(storage.data.has(STORAGE_KEY)).toBe(false);
  });
});
