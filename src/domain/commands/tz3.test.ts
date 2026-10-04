// Updated TZ: listing edits after opening, contact collection, personal data.
import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { CONFIG } from '../config';
import { collectionSignals, openingsToday } from '../rules/collection';
import { publicListing, revealContact } from '../rules/contactPrivacy';
import { computeRating } from '../rules/rating';
import { balanceOf } from '../rules/ledger';
import { editRefund } from '../rules/listingEdits';
import { searchListings } from '../rules/search';
import { cargo, cargoDraft, company, emptyState, NOW } from '../testing/fixtures';
import { addDays, addHours, addMonths } from '../time';
import { MODERATOR_ID, type AppState, type Listing } from '../types';
import { openContact, requestHigherLimit, unblockCollection } from './contacts';
import { claimEditRefund, draftOf, editListing, postListing } from './listings';
import { confirmsCompany, deleteAccount, exportCompanyData, giveConsent, hideReviewText, recordExport, withdrawConsent } from './privacy';
import type { CommandResult } from './result';
import { loginAs } from './session';
import { advanceTime } from './time';

const ok = (r: CommandResult): AppState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const as = (s: AppState, actorId: string): AppState => ({ ...s, actorId });
const topup = (companyId: string, amount: number) => ({ id: `top-${companyId}`, companyId, type: 'topup' as const, amount, createdAt: addDays(NOW, -40) });

/** Owner "o" (shipper) with one posted cargo listing; viewers v1, v2 with money and no free contacts left. */
function withListing(): [AppState, Listing] {
  let s = emptyState({
    companies: [company('o', { role: 'shipper' }), company('v1'), company('v2')],
    transactions: [topup('v1', 2000), topup('v2', 2000)],
    actorId: 'o',
  });
  s = ok(postListing(s, cargoDraft()));
  // use up free contacts of v1, v2 so the opening is paid
  const used = ['x1', 'x2', 'x3'].flatMap((x) => ['v1', 'v2'].map((v) => ({ id: `${v}-${x}`, viewerId: v, ownerId: x, firstListingId: '', openedAt: NOW, paidWith: 'free_quota' as const })));
  s = { ...s, contactAccesses: [...s.contactAccesses, ...used] };
  return [s, s.listings.at(-1)!];
}

describe('editing a listing after contacts were opened', () => {
  it('keeps a visible history, notifies everyone who revealed the contact on it', () => {
    let [s, l] = withListing();
    s = ok(openContact(as(s, 'v1'), l.id));
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(s.listings.find((x) => x.id === l.id)!), comment: 'Gate 3' }));
    expect(s.listingChanges).toHaveLength(1);
    expect(s.listingChanges[0]).toMatchObject({ key: false, fields: [{ field: 'comment', before: '', after: 'Gate 3' }] });
    expect(s.notifications.filter((n) => n.companyId === 'v1' && n.type === 'listing_changed')).toHaveLength(1);
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(s.listings.find((x) => x.id === l.id)!), weightT: 12 }));
    expect(s.listingChanges[1]).toMatchObject({ key: true, fields: [{ field: 'weightT', before: '10 t', after: '12 t' }] });
    expect(s.notifications.filter((n) => n.companyId === 'v2')).toHaveLength(0); // v2 never opened it
  });

  it('a key change within 24 h after a paid opening: one-button refund; later — no refund', () => {
    let [s, l] = withListing();
    s = ok(openContact(as(s, 'v1'), l.id));
    s = ok(openContact(as(s, 'v2'), l.id));
    const before = balanceOf(s.transactions, 'v1');
    s = { ...s, now: addHours(NOW, 5) };
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(s.listings.find((x) => x.id === l.id)!), to: { cityId: 'paris' } }));
    s = ok(claimEditRefund(as(s, 'v1'), l.id));
    expect(balanceOf(s.transactions, 'v1')).toBe(before + CONFIG.prices.contact);
    expect(claimEditRefund(as(s, 'v1'), l.id)).toEqual({ ok: false, error: 'refund_not_available' }); // once
    // 30 hours after opening a new key change gives no refund to v2
    let late = withListing()[0];
    late = ok(openContact(as(late, 'v2'), l.id));
    late = { ...late, now: addHours(NOW, 30) };
    late = ok(editListing(as(late, 'o'), l.id, { ...draftOf(late.listings.find((x) => x.id === l.id)!), weightT: 20 }));
    expect(claimEditRefund(as(late, 'v2'), l.id)).toEqual({ ok: false, error: 'refund_not_available' });
  });

  it('a minor change gives no refund; only the owner edits; the edit is validated', () => {
    let [s, l] = withListing();
    s = ok(openContact(as(s, 'v1'), l.id));
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(s.listings.find((x) => x.id === l.id)!), comment: 'x' }));
    expect(claimEditRefund(as(s, 'v1'), l.id)).toEqual({ ok: false, error: 'refund_not_available' });
    expect(editListing(as(s, 'v1'), l.id, cargoDraft())).toEqual({ ok: false, error: 'not_allowed' });
    expect(editListing(as(s, 'o'), l.id, cargoDraft({ weightT: 0 }))).toEqual({ ok: false, error: 'invalid_listing' });
  });

  it('nothing to return for an open listing; a package contact goes back to its package while it is valid', () => {
    let [s, l] = withListing();
    s = { ...s, packages: [{ id: 'p1', companyId: 'v1', size: 20, used: 0, validFrom: NOW, validTo: addDays(NOW, 30) }] };
    s = ok(openContact(as(s, 'v1'), l.id)); // free contacts used up → from the package
    expect(s.contactAccesses.find((a) => a.viewerId === 'v1' && a.ownerId === 'o')).toMatchObject({ paidWith: 'package', packageId: 'p1' });
    expect(s.packages[0]!.used).toBe(1);
    s = ok(openContact(as(s, 'v2'), l.id));
    s = { ...s, contactAccesses: s.contactAccesses.map((a) => (a.viewerId === 'v2' && a.ownerId === 'o' ? { ...a, paidWith: 'open_listing' as const } : a)) };
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(s.listings.find((x) => x.id === l.id)!), weightT: 20 }));
    expect(editRefund(s, 'v2', l.id)).toBeNull(); // no refund button for a free open listing
    expect(claimEditRefund(as(s, 'v2'), l.id)).toEqual({ ok: false, error: 'refund_not_available' });
    const balance = balanceOf(s.transactions, 'v1');
    const refunded = ok(claimEditRefund(as(s, 'v1'), l.id));
    expect(refunded.packages[0]!.used).toBe(0);
    expect(balanceOf(refunded.transactions, 'v1')).toBe(balance);
    expect(refunded.notifications.at(-1)).toMatchObject({ type: 'refund', params: { variant: 'packageEdit' } });
    // an expired package cannot take the contact back
    const late = { ...s, packages: s.packages.map((p) => ({ ...p, validTo: addHours(NOW, 1) })), now: addHours(NOW, 2) };
    expect(claimEditRefund(as(late, 'v1'), l.id)).toEqual({ ok: false, error: 'refund_not_available' });
  });
});

describe('contact data before opening', () => {
  it('search results and the card get a listing without the contact person; reveal needs an opened contact', () => {
    const seed = buildSeedState();
    const results = searchListings(seed, { kind: 'cargo' }, seed.now).map(publicListing);
    const json = JSON.stringify(results);
    expect(json).not.toContain('contactPersonId');
    const owner = seed.companies.find((c) => c.id === results[0]!.ownerId)!;
    expect(json).not.toContain(owner.contactPersons[0]!.phone);
    const viewer = 'c06'; // newcomer, no contacts opened
    expect(revealContact(seed, viewer, results[0]!.id)).toEqual({ ok: false, reason: 'not_opened' });
    const opened = ok(openContact(as(seed, viewer), results[0]!.id));
    expect(revealContact(opened, viewer, results[0]!.id)).toMatchObject({ ok: true, person: { phone: owner.contactPersons[0]!.phone } });
  });
});

describe('against collecting contacts', () => {
  /** A collector without listings and many owners with one listing each. */
  function market(n: number): AppState {
    const owners = Array.from({ length: n }, (_, i) => `w${i}`);
    const cities = ['warsaw', 'berlin', 'paris', 'lyon', 'milan', 'vienna', 'prague', 'riga', 'kaunas', 'brno', 'hamburg', 'munich', 'cologne', 'leipzig', 'dresden', 'gdansk', 'krakow', 'lodz'];
    return emptyState({
      companies: [company('bot'), ...owners.map((id) => company(id))],
      listings: owners.map((o, i) => cargo(`l-${o}`, o, { from: { cityId: cities[i % cities.length]! }, to: { cityId: cities[(i + 5) % cities.length]! } })),
      transactions: [topup('bot', 100000)],
      actorId: 'bot',
    });
  }

  it('daily limit of new openings; a company with history raises it on request', () => {
    let s = market(CONFIG.collection.dailyOpenLimit + 1);
    // spread over the day to avoid the burst signal
    for (let i = 0; i < CONFIG.collection.dailyOpenLimit; i++) {
      s = ok(openContact({ ...s, now: addHours(NOW, -8 + i * 0.2), actorId: 'bot' }, `l-w${i}`, { humanConfirmed: true }));
    }
    s = { ...s, now: addHours(NOW, 3) };
    const res = openContact(s, `l-w${CONFIG.collection.dailyOpenLimit}`, { humanConfirmed: true });
    expect(res.ok ? 'opened' : res.error).toBe('daily_limit');
    expect(openingsToday(s, 'bot', s.now)).toBe(CONFIG.collection.dailyOpenLimit);
    const newcomer = { ...s, companies: s.companies.map((c) => (c.id === 'bot' ? { ...c, joinedAt: addDays(s.now, -10) } : c)) };
    expect(requestHigherLimit(newcomer)).toEqual({ ok: false, error: 'no_history' });
    const raised = ok(requestHigherLimit(s));
    expect(raised.companies.find((c) => c.id === 'bot')!.dailyOpenLimit).toBe(CONFIG.collection.raisedDailyOpenLimit);
    expect(openContact(raised, `l-w${CONFIG.collection.dailyOpenLimit}`).ok).toBe(true);
  });

  it('signals slow down first; attempts without the human check keep coming → blocked; moderator unblocks', () => {
    let s = market(20);
    let opened = 0;
    for (let i = 0; i < CONFIG.collection.burstCount; i++) {
      const r = openContact(s, `l-w${i}`, { viaCard: false });
      if (!r.ok) break;
      s = r.state;
      opened++;
    }
    // slowed as soon as the "no card view" signal appears, before any block
    expect(opened).toBe(CONFIG.collection.noCardViewCount);
    const guard = s.companies.find((c) => c.id === 'bot')!.collection!;
    expect(guard.state).toBe('slowed');
    expect(guard.reasons).toEqual(['collection.signal.noCard']);
    expect(s.notifications.at(-1)?.type).toBe('collection_slowed');
    // while slowed: each opening needs the human check, at most 5 per hour; the openings that
    // triggered the slowdown do not use up the cap
    let human = s;
    for (let i = 0; i < CONFIG.collection.slowedPerHour; i++) human = ok(openContact(human, `l-w${10 + i}`, { humanConfirmed: true }));
    expect(openContact(human, 'l-w19', { humanConfirmed: true })).toEqual({ ok: false, error: 'slow_down' });
    expect(openContact({ ...human, now: addHours(NOW, 2) }, 'l-w19', { humanConfirmed: true }).ok).toBe(true);
    // the bot keeps trying without the check
    let r = openContact(s, 'l-w11');
    expect(r).toMatchObject({ ok: false, error: 'human_check_required' });
    s = r.state!;
    r = openContact(s, 'l-w11');
    s = r.state!;
    r = openContact(s, 'l-w11');
    expect(r).toMatchObject({ ok: false, error: 'collection_blocked' });
    s = r.state!;
    expect(s.companies.find((c) => c.id === 'bot')!.collection!.state).toBe('blocked');
    expect(openContact(s, 'l-w12', { humanConfirmed: true })).toEqual({ ok: false, error: 'collection_blocked' });
    expect(unblockCollection(s, 'bot')).toEqual({ ok: false, error: 'not_allowed' });
    s = ok(unblockCollection(as(s, MODERATOR_ID), 'bot'));
    expect(s.companies.find((c) => c.id === 'bot')!.collection!.state).toBe('ok');
  });

  it('an honest forwarder opening a few contacts from cards is not slowed; many directions without own listings is a signal', () => {
    let s = market(20);
    for (let i = 0; i < 5; i++) s = ok(openContact({ ...s, now: addHours(NOW, i) }, `l-w${i}`));
    expect(s.companies.find((c) => c.id === 'bot')!.collection).toBeUndefined();
    let spread = market(20);
    for (let i = 0; i < CONFIG.collection.directionsCount; i++) {
      spread = ok(openContact({ ...spread, now: addHours(NOW, i * 0.5) }, `l-w${i}`, { humanConfirmed: true }));
    }
    expect(collectionSignals(spread, 'bot', addDays(NOW, -1), spread.now)).toContain('collection.signal.directions');
  });
});

describe('personal data', () => {
  it('withdrawn consent hides the person even from those who opened the contact; consent can be given again', () => {
    const seed = buildSeedState();
    const access = seed.contactAccesses.find((a) => a.viewerId === 'c02' && seed.listings.some((l) => l.ownerId === a.ownerId && l.status === 'active'))!;
    const listing = seed.listings.find((l) => l.ownerId === access.ownerId && l.status === 'active')!;
    const owner = seed.companies.find((c) => c.id === access.ownerId)!;
    expect(revealContact(seed, 'c02', listing.id).ok).toBe(true);
    let s = seed;
    for (const p of owner.contactPersons) s = ok(withdrawConsent(as(s, owner.id), p.id));
    expect(revealContact(s, 'c02', listing.id)).toEqual({ ok: false, reason: 'no_consent' });
    s = ok(giveConsent(as(s, owner.id), owner.contactPersons[0]!.id));
    expect(revealContact(s, 'c02', listing.id).ok).toBe(true);
  });

  it('deleting the account removes people, hides the company, keeps reviews and events without names', () => {
    const seed = buildSeedState();
    const reviews = seed.reviews.filter((r) => r.targetId === 'c03' || r.authorId === 'c03').length;
    // confirmed by typing the company name
    expect(deleteAccount(as(seed, 'c03'), 'Rhein')).toEqual({ ok: false, error: 'confirmation_mismatch' });
    expect(deleteAccount(as(seed, 'c03'), '')).toEqual({ ok: false, error: 'confirmation_mismatch' });
    const s = ok(deleteAccount(as(seed, 'c03'), '  rhein spedition gmbh '));
    const c03 = s.companies.find((c) => c.id === 'c03')!;
    expect(c03).toMatchObject({ status: 'deleted', contactPersons: [] });
    expect(JSON.stringify(s)).not.toContain('Jonas Becker');
    expect(s.reviews.filter((r) => r.targetId === 'c03' || r.authorId === 'c03')).toHaveLength(reviews);
    expect(searchListings(s, { kind: 'cargo' }, s.now).some((l) => l.ownerId === 'c03')).toBe(false);
    expect(loginAs(s, 'c03')).toEqual({ ok: false, error: 'account_deleted' });
    expect(s.actorId).toBe(MODERATOR_ID);
  });

  it('export is confirmed by the company name and contains the company’s own data only', () => {
    const seed = buildSeedState();
    expect(recordExport(as(seed, 'c09'), 'Danube')).toEqual({ ok: false, error: 'confirmation_mismatch' });
    const name = seed.companies.find((c) => c.id === 'c09')!.legalName;
    expect(ok(recordExport(as(seed, 'c09'), name)).events.at(-1)?.reasonKey).toBe('event.data.exported');
    const data = exportCompanyData(seed, 'c09')!;
    expect(data.company.id).toBe('c09');
    expect(data.claims.every((c) => c.claimantId === 'c09' || c.targetId === 'c09')).toBe(true);
    expect(data.transactions.every((t) => t.companyId === 'c09')).toBe(true);
    expect(data.reviewsReceived.length).toBeGreaterThan(0);
  });

  it('the opening log is anonymised after 12 months; the contact access itself stays', () => {
    const seed = buildSeedState();
    expect(seed.contactOpenings.some((o) => o.viewerId === null)).toBe(true); // seed is already past retention for old ones
    const recent = seed.contactOpenings.find((o) => o.viewerId !== null)!;
    const s = ok(advanceTime(seed, addMonths(recent.at, 12 + 1)));
    const after = s.contactOpenings.find((o) => o.id === recent.id)!;
    expect(after.viewerId).toBeNull();
    expect(after.anonymizedAt).toBeDefined();
    expect(s.contactAccesses.length).toBe(seed.contactAccesses.length);
  });

  it('moderator hides a review text at the request of a deleted company; stars and the rating stay', () => {
    const seed = buildSeedState();
    const review = seed.reviews.find((r) => r.authorId === 'c03' && r.text)!;
    const s = ok(deleteAccount(as(seed, 'c03'), 'Rhein Spedition GmbH'));
    const before = computeRating(s, review.targetId, s.now);
    // only the moderator, only for a deleted company's request
    expect(hideReviewText(as(s, 'c01'), review.id, 'c03')).toEqual({ ok: false, error: 'not_allowed' });
    expect(hideReviewText(s, review.id, 'c01')).toEqual({ ok: false, error: 'not_allowed' });
    const hidden = ok(hideReviewText(s, review.id, 'c03'));
    const r = hidden.reviews.find((x) => x.id === review.id)!;
    expect(r).toMatchObject({ text: '', stars: review.stars, textHidden: { at: s.now, requestedBy: 'c03' } });
    expect(computeRating(hidden, review.targetId, hidden.now)).toEqual(before);
    expect(hidden.events.at(-1)?.reasonKey).toBe('event.review.textHidden');
    expect(hideReviewText(hidden, review.id, 'c03')).toEqual({ ok: false, error: 'not_found' }); // once
  });

  it('company name confirmation ignores case and extra spaces only', () => {
    const c = { legalName: 'Śląskie Kable sp. z o.o.' };
    expect(confirmsCompany(c, 'śląskie  kable SP. Z O.O.')).toBe(true);
    expect(confirmsCompany(c, 'Slaskie Kable sp. z o.o.')).toBe(false);
    expect(confirmsCompany(c, '   ')).toBe(false);
  });
});
