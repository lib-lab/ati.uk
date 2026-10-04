// "Log in as": switching the acting company counts as a login (matters for inactivity).
import { logEvent } from '../events';
import { MODERATOR_ID, type ActorId, type AppState } from '../types';
import type { CommandResult } from './result';

export function loginAs(state: AppState, actorId: ActorId): CommandResult {
  if (actorId === MODERATOR_ID) {
    return { ok: true, state: logEvent({ ...state, actorId }, sessionEvent(actorId)) };
  }
  const company = state.companies.find((c) => c.id === actorId);
  if (!company) return { ok: false, error: 'company_not_found' };
  const companies = state.companies.map((c) => (c.id === actorId ? { ...c, lastLoginAt: state.now } : c));
  return { ok: true, state: logEvent({ ...state, actorId, companies }, sessionEvent(actorId)) };
}

const sessionEvent = (actorId: ActorId) => ({
  type: 'session_login' as const,
  actor: actorId,
  subjectIds: [actorId],
  reasonKey: 'event.login',
  params: {},
});
