// Search over listings (TZ: "Search and subscriptions").
// Step E2 covers: kind, from/to city, body types, weight range, sort by loading date.
// Radius, dates, volume, loading method, rating filters and other sorts come in E4.
import { toMs } from '../time';
import type { AppState, Company, IsoDate, Listing, SearchFilters } from '../types';
import { isBlocked } from './flags';
import { isExpired } from './lifetime';

/** Owner's listings are hidden from everyone but the owner. */
export function ownerListingsHidden(company: Company, flags: AppState['flags']): boolean {
  return company.status === 'deactivated' || company.listingsHiddenUntilContactConfirmed || isBlocked(flags, company.id);
}

export function isVisibleInSearch(state: Pick<AppState, 'companies' | 'flags'>, listing: Listing, now: IsoDate): boolean {
  if (listing.status !== 'active' || isExpired(listing, now)) return false;
  const owner = state.companies.find((c) => c.id === listing.ownerId);
  return !!owner && !ownerListingsHidden(owner, state.flags);
}

export function matchesFilters(listing: Listing, f: SearchFilters): boolean {
  if (listing.kind !== f.kind) return false;
  if (f.fromCityId && listing.from.cityId !== f.fromCityId) return false;
  if (f.toCityId && !('any' in listing.to) && listing.to.cityId !== f.toCityId) return false;
  if (f.bodyTypes?.length && !listing.bodyTypes.some((b) => f.bodyTypes!.includes(b))) return false;
  if (f.weightMin !== undefined && listing.weightT < f.weightMin) return false;
  if (f.weightMax !== undefined && listing.weightT > f.weightMax) return false;
  return true;
}

export function hasPriority(listing: Listing, now: IsoDate): boolean {
  return !!listing.priorityUntil && toMs(now) < toMs(listing.priorityUntil);
}

/** Priority listings first, then by loading date ascending, then newest first. */
export function compareByLoadingDate(now: IsoDate) {
  return (a: Listing, b: Listing): number =>
    Number(hasPriority(b, now)) - Number(hasPriority(a, now)) ||
    toMs(a.dateFrom) - toMs(b.dateFrom) ||
    toMs(b.createdAt) - toMs(a.createdAt);
}

export function searchListings(
  state: Pick<AppState, 'companies' | 'flags' | 'listings'>,
  filters: SearchFilters,
  now: IsoDate,
): Listing[] {
  return state.listings
    .filter((l) => isVisibleInSearch(state, l, now) && matchesFilters(l, filters))
    .sort(compareByLoadingDate(now));
}

export function countVisible(state: Pick<AppState, 'companies' | 'flags' | 'listings'>, kind: Listing['kind'], now: IsoDate): number {
  return state.listings.filter((l) => l.kind === kind && isVisibleInSearch(state, l, now)).length;
}
