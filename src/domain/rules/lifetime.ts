// Listing lifetime rules (TZ: "Listings" → lifetime).
import { CONFIG } from '../config';
import { addDays, addHours, endOfDay, isBefore } from '../time';
import type { IsoDate, Listing, ListingKind } from '../types';

/**
 * Cargo: active until the end of (last loading day + 1 day).
 * Truck: active until the end of (availability date + 3 days).
 */
export function computeExpiresAt(kind: ListingKind, dateFrom: IsoDate, dateTo?: IsoDate): IsoDate {
  if (kind === 'cargo') {
    const lastLoadingDay = dateTo ?? dateFrom;
    return endOfDay(addDays(lastLoadingDay, CONFIG.lifetime.cargoDaysAfterLoading));
  }
  return endOfDay(addDays(dateFrom, CONFIG.lifetime.truckDaysAfterAvailable));
}

export function isExpired(listing: Pick<Listing, 'expiresAt'>, now: IsoDate): boolean {
  return !isBefore(now, listing.expiresAt);
}

/** True when the owner should get the "expires in a day" reminder now. */
export function needsExpiryReminder(
  listing: Pick<Listing, 'status' | 'expiresAt' | 'reminderSentAt'>,
  now: IsoDate,
): boolean {
  if (listing.status !== 'active' || listing.reminderSentAt) return false;
  const remindFrom = addHours(listing.expiresAt, -CONFIG.lifetime.reminderHoursBefore);
  return !isBefore(now, remindFrom) && isBefore(now, listing.expiresAt);
}
