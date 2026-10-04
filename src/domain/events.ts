// Event log helpers. Every state change worth explaining goes through logEvent.
import type { AppState, EventLogEntry } from './types';

export type NewEvent = Omit<EventLogEntry, 'id' | 'at'>;

/** Returns a new state with the next id issued (deterministic, no randomness). */
export function nextId(state: AppState, prefix: string): [AppState, string] {
  const seq = state.seq + 1;
  return [{ ...state, seq }, `${prefix}${seq}`];
}

export function logEvent(state: AppState, event: NewEvent): AppState {
  const [s, id] = nextId(state, 'e');
  return { ...s, events: [...s.events, { ...event, id, at: s.now }] };
}
