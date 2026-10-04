import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { balanceOf } from '../rules/ledger';
import { freeContactsLeft } from '../rules/contactAccess';
import type { AppState } from '../types';
import { openContact } from './contacts';

/** Seed state acting as `actorId`, with a cargo listing of an owner the actor has no access to yet. */
function setup(actorId: string) {
  const s: AppState = { ...buildSeedState(), actorId };
  const listing = s.listings.find(
    (l) =>
      l.kind === 'cargo' && l.status === 'active' && !l.isOpen && l.ownerId !== actorId &&
      !s.contactAccesses.some((a) => a.viewerId === actorId && a.ownerId === l.ownerId),
  )!;
  return { s, listing };
}

describe('openContact', () => {
  it('uses a free contact, records access and logs it, without charging', () => {
    const { s, listing } = setup('c02'); // 1 of 3 free used
    const res = openContact(s, listing.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(balanceOf(res.state.transactions, 'c02')).toBe(balanceOf(s.transactions, 'c02'));
    expect(freeContactsLeft(res.state, 'c02', s.now)).toBe(1);
    expect(res.state.contactAccesses.at(-1)).toMatchObject({ viewerId: 'c02', ownerId: listing.ownerId, paidWith: 'free_quota' });
    expect(res.state.events.at(-1)).toMatchObject({ type: 'contact_opened', reasonKey: 'event.contactOpened.free_quota' });
  });

  it('charges the balance after free contacts, then the same owner is free on another listing', () => {
    let { s, listing } = setup('c02');
    // use up the remaining free contacts on other owners
    for (let i = 0; i < 2; i++) {
      const next = s.listings.find(
        (l) => l.status === 'active' && !l.isOpen && l.ownerId !== 'c02' && l.ownerId !== listing.ownerId &&
          !s.contactAccesses.some((a) => a.viewerId === 'c02' && a.ownerId === l.ownerId),
      )!;
      const r = openContact(s, next.id);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(freeContactsLeft(s, 'c02', s.now)).toBe(0);
    const before = balanceOf(s.transactions, 'c02');
    const res = openContact(s, listing.id);
    if (!res.ok) throw new Error(res.error);
    expect(balanceOf(res.state.transactions, 'c02')).toBe(before - 500);
    expect(res.state.events.slice(-2).map((e) => e.type)).toEqual(['payment', 'contact_opened']);

    const sameOwnerOther = res.state.listings.find((l) => l.ownerId === listing.ownerId && l.id !== listing.id && l.status === 'active');
    if (sameOwnerOther) {
      const again = openContact(res.state, sameOwnerOther.id);
      expect(again.ok && again.state).toBe(res.state); // nothing changed, nothing charged
    }
    const repeat = openContact(res.state, listing.id);
    expect(repeat.ok && repeat.state).toBe(res.state);
  });

  it('refuses when free contacts are used up and the balance is empty', () => {
    const { s, listing } = setup('c04'); // seed: 3 free used, €0
    expect(openContact(s, listing.id)).toEqual({ ok: false, error: 'insufficient_funds' });
  });

  it('refuses for the moderator and unknown listings', () => {
    const { s, listing } = setup('c02');
    expect(openContact({ ...s, actorId: 'moderator' }, listing.id)).toEqual({ ok: false, error: 'not_allowed' });
    expect(openContact(s, 'nope')).toEqual({ ok: false, error: 'listing_not_found' });
  });
});
