// Saved searches (TZ: "Search and subscriptions").
import type { AppState, Id, IsoDate, Listing, Notification, SearchFilters, Subscription } from '../types';
import { computeRating } from './rating';
import { isVisibleInSearch, matchesFilters, type RatingOf, type SearchInput } from './search';

/** Filters without empty values, arrays sorted: two subscriptions with the same meaning compare equal. */
export function normalizeFilters(f: SearchFilters): SearchFilters {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f).sort(([a], [b]) => a.localeCompare(b))) {
    if (v === undefined || v === '' || v === false || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = Array.isArray(v) ? [...v].sort() : v;
  }
  return out as unknown as SearchFilters;
}

export function sameFilters(a: SearchFilters, b: SearchFilters): boolean {
  return JSON.stringify(normalizeFilters(a)) === JSON.stringify(normalizeFilters(b));
}

/**
 * A listing matches a subscription when it is visible in search right now, is not the subscriber's
 * own, and passes the saved filters (rating filters included, as in search).
 */
export function subscriptionMatches(state: SearchInput, sub: Subscription, listing: Listing, now: IsoDate, ratingOf?: RatingOf): boolean {
  if (listing.ownerId === sub.companyId) return false;
  if (!isVisibleInSearch(state, listing, now)) return false;
  return matchesFilters(listing, sub.filters, ratingOf ?? ((id: Id) => computeRating(state, id, now)));
}

/** Already reported or waiting for the digest: a listing is never reported twice per subscription. */
export function alreadyMatched(sub: Subscription, listingId: Id): boolean {
  return sub.notifiedListingIds.includes(listingId) || sub.pendingListingIds.includes(listingId);
}

export const SUBSCRIPTION_NOTIFICATIONS: Notification['type'][] = ['subscription_match', 'subscription_digest'];

/** Subscription notifications are also sent by e-mail (TZ); these still wait for the mail channel. */
export function emailsDue(state: Pick<AppState, 'notifications'>): Notification[] {
  return state.notifications.filter((n) => SUBSCRIPTION_NOTIFICATIONS.includes(n.type) && !n.emailedAt);
}
