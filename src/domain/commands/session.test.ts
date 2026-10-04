import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { addDays } from '../time';
import { MODERATOR_ID } from '../types';
import { loginAs } from './session';

describe('loginAs', () => {
  const seed = buildSeedState();
  const later = { ...seed, now: addDays(seed.now, 3) };

  it('switches the actor, updates lastLoginAt and logs the event', () => {
    const res = loginAs(later, 'c17');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.actorId).toBe('c17');
    expect(res.state.companies.find((c) => c.id === 'c17')?.lastLoginAt).toBe(later.now);
    const last = res.state.events.at(-1);
    expect(last?.type).toBe('session_login');
    expect(last?.at).toBe(later.now);
  });

  it('allows the moderator pseudo-actor', () => {
    const res = loginAs(seed, MODERATOR_ID);
    expect(res.ok && res.state.actorId).toBe(MODERATOR_ID);
  });

  it('rejects unknown companies without changing state', () => {
    expect(loginAs(seed, 'nope')).toEqual({ ok: false, error: 'company_not_found' });
  });
});
