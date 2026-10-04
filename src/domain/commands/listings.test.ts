import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { balanceOf } from '../rules/ledger';
import { searchListings } from '../rules/search';
import { cargo, cargoDraft, company, emptyState, NOW } from '../testing/fixtures';
import { addDays } from '../time';
import type { AppState, Listing } from '../types';
import { buyPriority, deleteTemplate, extendListing, makeListingOpen, postListing, removeListing, saveTemplate } from './listings';
import { advanceTime } from './time';

const topup = (companyId: string, amount: number) => ({ id: `t-${companyId}`, companyId, type: 'topup' as const, amount, createdAt: NOW });

function base(role: 'shipper' | 'carrier' | 'forwarder' = 'shipper', balance = 5000): AppState {
  return emptyState({ companies: [company('o', { role }), company('v', { role: 'carrier' })], actorId: 'o', transactions: [topup('o', balance)] });
}

function posted(s: AppState): [AppState, Listing] {
  const r = postListing(s, cargoDraft());
  if (!r.ok) throw new Error(r.error);
  return [r.state, r.state.listings.at(-1)!];
}

describe('postListing', () => {
  it('creates an active listing with computed expiry and logs it', () => {
    const [s, l] = posted(base());
    expect(l).toMatchObject({ ownerId: 'o', status: 'active', isOpen: false, expiresAt: '2026-10-08T23:59:59.999Z' });
    expect(s.events.some((e) => e.type === 'listing_created' && e.params.listing === l.id)).toBe(true);
    expect(searchListings(s, { kind: 'cargo' }, s.now).map((x) => x.id)).toEqual([l.id]);
  });

  it('respects the role table and validation', () => {
    expect(postListing(base('carrier'), cargoDraft())).toEqual({ ok: false, error: 'role_cannot_post' });
    expect(postListing(base(), cargoDraft({ weightT: 0 }))).toEqual({ ok: false, error: 'invalid_listing' });
    expect(postListing({ ...base(), actorId: 'moderator' }, cargoDraft())).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('open listing and priority', () => {
  it('charges, marks the listing and puts it first in search', () => {
    let [s, l] = posted(base());
    s = { ...s, listings: [...s.listings, cargo('other', 'v', { dateFrom: addDays(NOW, 1) })] };
    let r = makeListingOpen(s, l.id);
    if (!r.ok) throw new Error(r.error);
    r = buyPriority(r.state, l.id);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(balanceOf(s.transactions, 'o')).toBe(5000 - CONFIG.prices.openListing - CONFIG.prices.priority);
    const mine = s.listings.find((x) => x.id === l.id)!;
    expect(mine.isOpen).toBe(true);
    expect(mine.priorityUntil).toBe(mine.expiresAt);
    expect(searchListings(s, { kind: 'cargo' }, s.now)[0]!.id).toBe(l.id);
  });

  it('refuses twice, without money, or on someone else’s listing', () => {
    let [s, l] = posted(base('shipper', 1200));
    const r = makeListingOpen(s, l.id);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(makeListingOpen(s, l.id)).toEqual({ ok: false, error: 'already_open' });
    expect(buyPriority(s, l.id)).toEqual({ ok: false, error: 'insufficient_funds' });
    expect(buyPriority({ ...s, actorId: 'v' }, l.id)).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('lifetime processes', () => {
  it('reminds once within the last 24 hours, then expires and notifies', () => {
    let [s, l] = posted(base()); // expires 2026-10-08 end of day
    let r = advanceTime(s, '2026-10-08T06:00:00.000Z');
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.notifications.filter((n) => n.type === 'expiry_reminder')).toHaveLength(1);
    r = advanceTime(s, '2026-10-08T12:00:00.000Z');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.notifications.filter((n) => n.type === 'expiry_reminder')).toHaveLength(1);
    r = advanceTime(r.state, '2026-10-09T09:00:00.000Z');
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    expect(s.listings.find((x) => x.id === l.id)!.status).toBe('expired');
    expect(s.events.some((e) => e.type === 'listing_expired')).toBe(true);
    expect(s.notifications.some((n) => n.type === 'listing_expired')).toBe(true);
    expect(searchListings(s, { kind: 'cargo' }, s.now)).toHaveLength(0);
  });

  it('extending an expired listing brings it back; priority is dropped, "open" stays', () => {
    let [s, l] = posted(base());
    s = (makeListingOpen(s, l.id) as { state: AppState }).state;
    s = (buyPriority(s, l.id) as { state: AppState }).state;
    s = (advanceTime(s, '2026-10-09T09:00:00.000Z') as { state: AppState }).state;
    const r = extendListing(s, l.id);
    if (!r.ok) throw new Error(r.error);
    const ext = r.state.listings.find((x) => x.id === l.id)!;
    expect(ext).toMatchObject({ status: 'active', isOpen: true, priorityUntil: undefined, reminderSentAt: undefined });
    expect(ext.expiresAt).toBe('2026-10-10T23:59:59.999Z');
    expect(searchListings(r.state, { kind: 'cargo' }, r.state.now).map((x) => x.id)).toEqual([l.id]);
  });

  it('extension can move the loading date and keeps a range length', () => {
    const [s0] = [base()];
    const r0 = postListing(s0, cargoDraft({ dateFrom: addDays(NOW, 2), dateTo: addDays(NOW, 4) }));
    if (!r0.ok) throw new Error(r0.error);
    const l = r0.state.listings.at(-1)!;
    const r = extendListing(r0.state, l.id, addDays(NOW, 10));
    if (!r.ok) throw new Error(r.error);
    const ext = r.state.listings.find((x) => x.id === l.id)!;
    expect(ext.dateFrom).toBe(addDays(NOW, 10));
    expect(ext.kind === 'cargo' && ext.dateTo).toBe(addDays(NOW, 12));
    expect(extendListing(r.state, l.id, addDays(NOW, -2))).toEqual({ ok: false, error: 'invalid_listing' });
  });
});

describe('removeListing', () => {
  it('records the reason, hides the listing and cannot be extended afterwards', () => {
    const [s, l] = posted(base());
    const r = removeListing(s, l.id, 'found_on_platform');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.listings.find((x) => x.id === l.id)).toMatchObject({ status: 'removed', removalReason: 'found_on_platform', removedAt: NOW });
    expect(r.state.events.at(-1)?.reasonKey).toBe('event.listing.removed.found_on_platform');
    expect(searchListings(r.state, { kind: 'cargo' }, r.state.now)).toHaveLength(0);
    expect(extendListing(r.state, l.id)).toEqual({ ok: false, error: 'listing_not_active' });
    expect(removeListing(r.state, l.id, 'not_relevant')).toEqual({ ok: false, error: 'listing_not_active' });
  });

  it('the removal reason is a metric only: it does not change the rating (TZ)', () => {
    const [s0, l] = posted(base());
    const r = removeListing(s0, l.id, 'found_on_platform');
    if (!r.ok) throw new Error(r.error);
    expect(r.state.events.some((e) => e.type === 'rating_changed')).toBe(false);
  });
});

describe('templates', () => {
  it('saves and deletes own templates only', () => {
    const { dateFrom: _d, ...fields } = cargoDraft();
    const r = saveTemplate(base(), 'Warsaw steel', fields);
    if (!r.ok) throw new Error(r.error);
    const t = r.state.templates[0]!;
    expect(t).toMatchObject({ companyId: 'o', kind: 'cargo', name: 'Warsaw steel' });
    expect(deleteTemplate({ ...r.state, actorId: 'v' }, t.id)).toEqual({ ok: false, error: 'not_allowed' });
    const d = deleteTemplate(r.state, t.id);
    expect(d.ok && d.state.templates).toEqual([]);
  });
});

