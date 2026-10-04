// Saved searches and their notifications (TZ: "Search and subscriptions"):
// "instantly" — a notification per matching listing; "hourly" — one digest per hour.
import { logEvent, nextId } from '../events';
import { addNotification } from '../notifications';
import { computeRating } from '../rules/rating';
import { alreadyMatched, normalizeFilters, sameFilters, SUBSCRIPTION_NOTIFICATIONS, subscriptionMatches } from '../rules/subscriptions';
import { addHours, isBefore } from '../time';
import type { AppState, Id, Rating, SearchFilters, Subscription, SubscriptionFrequency } from '../types';
import { routeLabel } from './listings';
import type { CommandResult } from './result';
import type { TimeProcess } from './time';

function actorCompany(state: AppState) {
  return state.companies.find((c) => c.id === state.actorId && c.status !== 'deleted');
}

function ownSubscription(state: AppState, id: Id): Subscription | undefined {
  return state.subscriptions.find((x) => x.id === id && x.companyId === state.actorId);
}

/** "Save as subscription": the current filters, one button (TZ). The same filters twice are refused. */
export function saveSubscription(state: AppState, filters: SearchFilters, frequency: SubscriptionFrequency): CommandResult {
  const company = actorCompany(state);
  if (!company) return { ok: false, error: 'not_allowed' };
  if (state.subscriptions.some((x) => x.companyId === company.id && sameFilters(x.filters, filters))) {
    return { ok: false, error: 'subscription_exists' };
  }
  const [s, id] = nextId(state, 's');
  const sub: Subscription = {
    id, companyId: company.id, filters: normalizeFilters(filters), frequency, createdAt: s.now, pendingListingIds: [], notifiedListingIds: [],
  };
  return {
    ok: true,
    state: logEvent({ ...s, subscriptions: [...s.subscriptions, sub] }, {
      type: 'subscription_saved', actor: company.id, subjectIds: [company.id, id], reasonKey: `event.subscription.saved.${frequency}`, params: { subscription: id },
    }),
  };
}

export function setSubscriptionFrequency(state: AppState, id: Id, frequency: SubscriptionFrequency): CommandResult {
  const sub = ownSubscription(state, id);
  if (!sub) return { ok: false, error: 'not_found' };
  if (sub.frequency === frequency) return { ok: true, state };
  // Listings waiting for the digest are still delivered by the next digest.
  const s = { ...state, subscriptions: state.subscriptions.map((x) => (x.id === id ? { ...x, frequency } : x)) };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'subscription_saved', actor: sub.companyId, subjectIds: [sub.companyId, id], reasonKey: `event.subscription.frequency.${frequency}`, params: { subscription: id },
    }),
  };
}

export function deleteSubscription(state: AppState, id: Id): CommandResult {
  const sub = ownSubscription(state, id);
  if (!sub) return { ok: false, error: 'not_found' };
  const s = { ...state, subscriptions: state.subscriptions.filter((x) => x.id !== id) };
  return {
    ok: true,
    state: logEvent(s, { type: 'subscription_deleted', actor: sub.companyId, subjectIds: [sub.companyId, id], reasonKey: 'event.subscription.deleted', params: { subscription: id } }),
  };
}

function cachedRating(state: AppState) {
  const cache = new Map<Id, Rating>();
  return (id: Id) => {
    if (!cache.has(id)) cache.set(id, computeRating(state, id, state.now));
    return cache.get(id)!;
  };
}

/**
 * Check a listing against other companies' subscriptions: after posting and after a key edit
 * (a listing that starts to match after an edit is reported; one already reported is not, see
 * DECISIONS "Subscriptions"). One notification per company even if several subscriptions match.
 */
export function notifySubscribers(state: AppState, listingId: Id): AppState {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) return state;
  const ratingOf = cachedRating(state);
  const matched = state.subscriptions.filter(
    (x) => !alreadyMatched(x, listingId) && subscriptionMatches(state, x, listing, state.now, ratingOf),
  );
  if (matched.length === 0) return state;

  const instantCompanies = new Set(matched.filter((x) => x.frequency === 'instant').map((x) => x.companyId));
  const notifiedBefore = (companyId: Id) =>
    state.subscriptions.some((x) => x.companyId === companyId && x.notifiedListingIds.includes(listingId));
  let s: AppState = {
    ...state,
    subscriptions: state.subscriptions.map((x) => {
      if (!matched.includes(x)) return x;
      // A company told instantly does not get the same listing again in its digest.
      return instantCompanies.has(x.companyId)
        ? { ...x, notifiedListingIds: [...x.notifiedListingIds, listingId] }
        : { ...x, pendingListingIds: [...x.pendingListingIds, listingId] };
    }),
  };
  for (const companyId of instantCompanies) {
    if (notifiedBefore(companyId)) continue;
    const sub = matched.find((x) => x.companyId === companyId && x.frequency === 'instant')!;
    s = addNotification(s, companyId, 'subscription_match', { listing: listingId, route: routeLabel(listing), subscription: sub.id });
  }
  return s;
}

/**
 * Hourly digest: a subscription with pending listings is delivered once an hour has passed since
 * its last digest (or its creation). Listings that no longer match (expired, removed, edited) are
 * dropped. One digest per company.
 */
export const subscriptionDigestProcess: TimeProcess = {
  reasonKey: 'event.subscription.digest',
  run(state, _from, to) {
    const due = state.subscriptions.filter(
      (x) => x.pendingListingIds.length > 0 && !isBefore(to, addHours(x.lastDigestAt ?? x.createdAt, 1)),
    );
    if (due.length === 0) return state;
    const ratingOf = cachedRating(state);
    let s = state;
    for (const companyId of [...new Set(due.map((x) => x.companyId))]) {
      const subs = due.filter((x) => x.companyId === companyId);
      const delivered = new Set<Id>();
      const toldBefore = new Set(state.subscriptions.filter((x) => x.companyId === companyId).flatMap((x) => x.notifiedListingIds));
      for (const sub of subs) {
        for (const id of sub.pendingListingIds) {
          const l = state.listings.find((x) => x.id === id);
          if (l && !toldBefore.has(id) && subscriptionMatches(state, sub, l, to, ratingOf)) delivered.add(id);
        }
      }
      s = {
        ...s,
        subscriptions: s.subscriptions.map((x) =>
          subs.some((d) => d.id === x.id)
            ? { ...x, pendingListingIds: [], lastDigestAt: to, notifiedListingIds: [...x.notifiedListingIds, ...x.pendingListingIds.filter((id) => delivered.has(id))] }
            : x,
        ),
      };
      if (delivered.size === 0) continue;
      const ids = [...delivered];
      const routes = ids.map((id) => routeLabel(state.listings.find((l) => l.id === id)!));
      s = addNotification(s, companyId, 'subscription_digest', { count: ids.length, listings: ids.join(', '), routes: routes.join('; ') });
    }
    return s;
  },
};

/**
 * The mail channel accepted the e-mail copies of these notifications (the UI calls the adapter,
 * then this command, like a top-up). Each e-mail is written to the event log.
 */
export function recordEmailsSent(state: AppState, notificationIds: Id[]): CommandResult {
  let s = state;
  for (const id of notificationIds) {
    const n = s.notifications.find((x) => x.id === id);
    if (!n || n.emailedAt || !SUBSCRIPTION_NOTIFICATIONS.includes(n.type)) continue;
    s = { ...s, notifications: s.notifications.map((x) => (x.id === id ? { ...x, emailedAt: s.now } : x)) };
    s = logEvent(s, {
      type: 'email_sent',
      actor: 'system',
      subjectIds: [n.companyId, n.id],
      reasonKey: n.type === 'subscription_match' ? 'event.email.match' : 'event.email.digest',
      params: n.type === 'subscription_match' ? { company: n.companyId, listing: n.params.listing! } : { company: n.companyId, count: n.params.count! },
    });
  }
  return { ok: true, state: s };
}
