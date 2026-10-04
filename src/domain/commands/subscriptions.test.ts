import { describe, expect, it } from 'vitest';
import { emailsDue, sameFilters } from '../rules/subscriptions';
import { cargoDraft, company, emptyState, NOW } from '../testing/fixtures';
import { addHours } from '../time';

const addMinutes = (iso: string, minutes: number) => addHours(iso, minutes / 60);
import type { AppState, SearchFilters } from '../types';
import { draftOf, editListing, postListing, removeListing } from './listings';
import type { CommandResult } from './result';
import { deleteSubscription, recordEmailsSent, saveSubscription, setSubscriptionFrequency } from './subscriptions';
import { advanceTime } from './time';

const ok = (r: CommandResult): AppState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const as = (s: AppState, actorId: string): AppState => ({ ...s, actorId });
const notes = (s: AppState, companyId: string) => s.notifications.filter((n) => n.companyId === companyId);

/** Shipper "o" posts cargo; carrier "c" and forwarder "f" subscribe. */
function market(): AppState {
  return emptyState({ companies: [company('o', { role: 'shipper' }), company('c', { role: 'carrier' }), company('f')] });
}
const WARSAW_TENT: SearchFilters = { kind: 'cargo', fromCityId: 'warsaw', bodyTypes: ['tent'] };
const post = (s: AppState, overrides = {}) => ok(postListing(as(s, 'o'), cargoDraft(overrides)));
const lastListing = (s: AppState) => s.listings.at(-1)!;

describe('saving subscriptions', () => {
  it('saves the current filters with a frequency; the same filters twice are refused', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    expect(s.subscriptions).toHaveLength(1);
    expect(s.subscriptions[0]).toMatchObject({ companyId: 'c', frequency: 'instant', pendingListingIds: [], notifiedListingIds: [] });
    // empty values and order do not make a different subscription
    const same = { kind: 'cargo', bodyTypes: ['tent'], fromCityId: 'warsaw', toCityId: undefined, loadingMethods: [] } as SearchFilters;
    expect(sameFilters(same, WARSAW_TENT)).toBe(true);
    expect(saveSubscription(s, same, 'hourly')).toEqual({ ok: false, error: 'subscription_exists' });
    // another company may save the same filters
    s = ok(saveSubscription(as(s, 'f'), WARSAW_TENT, 'hourly'));
    expect(s.subscriptions).toHaveLength(2);
  });

  it('only the owner changes the frequency or deletes; the moderator cannot subscribe', () => {
    const s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    const id = s.subscriptions[0]!.id;
    expect(setSubscriptionFrequency(as(s, 'f'), id, 'hourly')).toEqual({ ok: false, error: 'not_found' });
    expect(ok(setSubscriptionFrequency(s, id, 'hourly')).subscriptions[0]!.frequency).toBe('hourly');
    expect(deleteSubscription(as(s, 'f'), id)).toEqual({ ok: false, error: 'not_found' });
    expect(ok(deleteSubscription(s, id)).subscriptions).toEqual([]);
    expect(saveSubscription(as(s, 'moderator'), WARSAW_TENT, 'instant')).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('matching new listings', () => {
  it('instantly: a matching listing notifies the subscriber with a link; a non-matching or own listing does not', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    s = ok(saveSubscription(as(s, 'o'), WARSAW_TENT, 'instant')); // the owner's own subscription
    s = post(s);
    const id = lastListing(s).id;
    expect(notes(s, 'c')).toEqual([expect.objectContaining({ type: 'subscription_match', params: expect.objectContaining({ listing: id }) })]);
    expect(notes(s, 'o')).toEqual([]);
    s = post(s, { from: { cityId: 'prague' } }); // wrong city
    s = post(s, { bodyTypes: ['reefer'] }); // wrong body
    expect(notes(s, 'c')).toHaveLength(1);
  });

  it('several subscriptions of one company give one notification per listing', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    s = ok(saveSubscription(s, { kind: 'cargo', fromCityId: 'warsaw' }, 'hourly'));
    s = post(s);
    expect(notes(s, 'c')).toHaveLength(1);
    s = ok(advanceTime(s, addHours(NOW, 2)));
    expect(notes(s, 'c')).toHaveLength(1); // not repeated in the digest
  });

  it('hourly digest: two matching listings → one notification after an hour; nothing before', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'hourly'));
    s = post(s);
    const first = lastListing(s).id;
    s = post(s, { weightT: 12 });
    const second = lastListing(s).id;
    expect(notes(s, 'c')).toEqual([]);
    expect(s.subscriptions[0]!.pendingListingIds).toEqual([first, second]);
    s = ok(advanceTime(s, addMinutes(NOW, 30)));
    expect(notes(s, 'c')).toEqual([]);
    s = ok(advanceTime(s, addHours(NOW, 1)));
    expect(notes(s, 'c')).toEqual([expect.objectContaining({ type: 'subscription_digest', params: expect.objectContaining({ count: 2, listings: `${first}, ${second}` }) })]);
    expect(s.subscriptions[0]).toMatchObject({ pendingListingIds: [], notifiedListingIds: [first, second], lastDigestAt: addHours(NOW, 1) });
    // the next digest needs another hour since the last one
    s = post(s, { weightT: 14 });
    s = ok(advanceTime(s, addMinutes(s.now, 30)));
    expect(notes(s, 'c')).toHaveLength(1);
    s = ok(advanceTime(s, addMinutes(s.now, 30)));
    expect(notes(s, 'c')).toHaveLength(2);
  });

  it('the digest drops listings removed before it is sent', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'hourly'));
    s = post(s);
    s = ok(removeListing(as(s, 'o'), lastListing(s).id, 'found_elsewhere'));
    s = ok(advanceTime(s, addHours(NOW, 2)));
    expect(notes(s, 'c')).toEqual([]);
    expect(s.subscriptions[0]!.pendingListingIds).toEqual([]);
  });

  it('a key edit that makes a listing match notifies; a reported listing is not reported again after edits', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    s = post(s, { from: { cityId: 'prague' } });
    const l = lastListing(s);
    expect(notes(s, 'c')).toEqual([]);
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(l), from: { cityId: 'warsaw' } }));
    expect(notes(s, 'c')).toHaveLength(1);
    s = ok(editListing(as(s, 'o'), l.id, { ...draftOf(lastListing(s)), weightT: 15 }));
    expect(notes(s, 'c').filter((n) => n.type === 'subscription_match')).toHaveLength(1);
  });

  it('rating filters of the subscription apply as in search; hidden owners do not notify', () => {
    let s = ok(saveSubscription(as(market(), 'c'), { ...WARSAW_TENT, onlyRated: true }, 'instant'));
    s = post(s); // "o" has no reviews: a new member
    expect(notes(s, 'c')).toEqual([]);
    let blocked = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    blocked = { ...blocked, companies: blocked.companies.map((c) => (c.id === 'o' ? { ...c, listingsHiddenUntilContactConfirmed: true } : c)) };
    blocked = post(blocked);
    expect(notes(blocked, 'c')).toEqual([]);
  });
});

describe('e-mail copies', () => {
  it('subscription notifications wait for the mail channel; sending is logged once', () => {
    let s = ok(saveSubscription(as(market(), 'c'), WARSAW_TENT, 'instant'));
    s = post(s);
    const due = emailsDue(s);
    expect(due.map((n) => n.type)).toEqual(['subscription_match']);
    s = ok(recordEmailsSent(s, due.map((n) => n.id)));
    expect(emailsDue(s)).toEqual([]);
    expect(s.events.at(-1)).toMatchObject({ type: 'email_sent', reasonKey: 'event.email.match' });
    const events = s.events.length;
    s = ok(recordEmailsSent(s, due.map((n) => n.id)));
    expect(s.events).toHaveLength(events);
  });
});
