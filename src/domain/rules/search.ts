// Search over listings (TZ: "Search and subscriptions").
// One template for both sides: carriers search cargo, shippers search trucks.
import { cityDistanceKm, roadDistanceKm } from '../geo/distance';
import { endOfDay, startOfDay, toMs } from '../time';
import type { AppState, Company, Id, IsoDate, Listing, Rating, SearchFilters, SortKey } from '../types';
import { isBlocked } from './flags';
import { isExpired } from './lifetime';
import { computeRating, type RatingInput } from './rating';

export type SearchInput = RatingInput;
export type RatingOf = (companyId: Id) => Rating;

/** Owner's listings are hidden from everyone but the owner. */
export function ownerListingsHidden(company: Company, flags: AppState['flags']): boolean {
  return company.status === 'deactivated' || company.listingsHiddenUntilContactConfirmed || isBlocked(flags, company.id);
}

export function isVisibleInSearch(state: Pick<AppState, 'companies' | 'flags'>, listing: Listing, now: IsoDate): boolean {
  if (listing.status !== 'active' || isExpired(listing, now)) return false;
  const owner = state.companies.find((c) => c.id === listing.ownerId);
  return !!owner && !ownerListingsHidden(owner, state.flags);
}

/** Exact city when the radius is empty or 0, otherwise straight-line distance within the radius. */
function nearCity(cityId: Id, filterCityId: Id, radiusKm?: number): boolean {
  if (!radiusKm) return cityId === filterCityId;
  return cityDistanceKm(cityId, filterCityId) <= radiusKm;
}

/**
 * Time window of a listing for date filtering.
 * Cargo: the loading day or range. Truck: from the availability date until the listing expires.
 */
export function listingWindow(l: Listing): [IsoDate, IsoDate] {
  if (l.kind === 'truck') return [startOfDay(l.dateFrom), l.expiresAt];
  return [startOfDay(l.dateFrom), endOfDay(l.dateTo ?? l.dateFrom)];
}

function overlapsDates(l: Listing, from?: IsoDate, to?: IsoDate): boolean {
  if (!from && !to) return true;
  const [ls, le] = listingWindow(l);
  const fs = from ? toMs(startOfDay(from)) : -Infinity;
  const fe = to ? toMs(endOfDay(to)) : Infinity;
  return toMs(ls) <= fe && toMs(le) >= fs;
}

function inRange(value: number | undefined, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === undefined) return false; // a range filter needs the value to be known
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/** All listing-level filters. Rating filters need `ratingOf`; without it they are ignored. */
export function matchesFilters(listing: Listing, f: SearchFilters, ratingOf?: RatingOf): boolean {
  if (listing.kind !== f.kind) return false;
  if (f.fromCityId && !nearCity(listing.from.cityId, f.fromCityId, f.fromRadiusKm)) return false;
  if (f.toCityId && !('any' in listing.to) && !nearCity(listing.to.cityId, f.toCityId, f.toRadiusKm)) return false;
  if (!overlapsDates(listing, f.dateFrom, f.dateTo)) return false;
  if (f.bodyTypes?.length && !listing.bodyTypes.some((b) => f.bodyTypes!.includes(b))) return false;
  if (!inRange(listing.weightT, f.weightMin, f.weightMax)) return false;
  if (!inRange(listing.volumeM3, f.volumeMin, f.volumeMax)) return false;
  if (f.loadingMethods?.length && !listing.loadingMethods.some((m) => f.loadingMethods!.includes(m))) return false;
  if (ratingOf && (f.minRating !== undefined || f.noRedFlags)) {
    const r = ratingOf(listing.ownerId);
    if (f.minRating !== undefined && r.score < f.minRating) return false;
    if (f.noRedFlags && r.redFlags.length > 0) return false;
  }
  return true;
}

export function hasPriority(listing: Listing, now: IsoDate): boolean {
  return !!listing.priorityUntil && toMs(now) < toMs(listing.priorityUntil);
}

/** Rate per km in cents, or null without a fixed rate or a known destination. */
export function ratePerKm(l: Listing): number | null {
  if (l.rate.mode !== 'fixed' || l.rate.amount === undefined || 'any' in l.to) return null;
  const km = roadDistanceKm(l.from.cityId, l.to.cityId);
  return km > 0 ? l.rate.amount / km : null;
}

/** Nulls last, regardless of direction. */
function byNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

/** Priority listings always first; then the chosen key; ties by loading date, then newest first. */
export function comparator(sort: SortKey, now: IsoDate, ratingOf: RatingOf) {
  const key = (a: Listing, b: Listing): number => {
    switch (sort) {
      case 'loading_date':
        return 0;
      case 'rate_per_km':
        return byNullable(ratePerKm(a), ratePerKm(b), -1);
      case 'rating':
        return ratingOf(b.ownerId).score - ratingOf(a.ownerId).score;
      case 'freshness':
        return toMs(b.createdAt) - toMs(a.createdAt);
    }
  };
  return (a: Listing, b: Listing): number =>
    Number(hasPriority(b, now)) - Number(hasPriority(a, now)) ||
    key(a, b) ||
    toMs(a.dateFrom) - toMs(b.dateFrom) ||
    toMs(b.createdAt) - toMs(a.createdAt);
}

export interface SearchOptions {
  sort?: SortKey;
  /** Defaults to computeRating on the given state; the UI passes a cached version. */
  ratingOf?: RatingOf;
}

export function searchListings(state: SearchInput, filters: SearchFilters, now: IsoDate, options: SearchOptions = {}): Listing[] {
  const ratingOf = options.ratingOf ?? ((id: Id) => computeRating(state, id, now));
  return state.listings
    .filter((l) => isVisibleInSearch(state, l, now) && matchesFilters(l, filters, ratingOf))
    .sort(comparator(options.sort ?? 'loading_date', now, ratingOf));
}

export function countVisible(state: Pick<AppState, 'companies' | 'flags' | 'listings'>, kind: Listing['kind'], now: IsoDate): number {
  return state.listings.filter((l) => l.kind === kind && isVisibleInSearch(state, l, now)).length;
}
