// Contact access and payment rules (TZ: "Opening a contact and monetisation").
import { CONFIG } from '../config';
import { isBefore, monthKey } from '../time';
import type { AppState, Cents, ContactPackage, Id, IsoDate, Listing } from '../types';
import { balanceOf } from './ledger';
import { isExpired } from './lifetime';

export type ContactInput = Pick<AppState, 'companies' | 'contactAccesses' | 'transactions' | 'packages'>;

export function findAccess(input: Pick<AppState, 'contactAccesses'>, viewerId: Id, ownerId: Id) {
  return input.contactAccesses.find((a) => a.viewerId === viewerId && a.ownerId === ownerId);
}

/**
 * Free contacts used in the calendar month of `now`.
 * A free open refunded after a confirmed complaint gives the slot back (refunds can only happen
 * after opening, so "opened this month and refunded" means the slot returns in the same month).
 */
export function freeContactsUsed(input: Pick<AppState, 'contactAccesses'>, viewerId: Id, now: IsoDate): number {
  const month = monthKey(now);
  return input.contactAccesses.filter(
    (a) => a.viewerId === viewerId && a.paidWith === 'free_quota' && monthKey(a.openedAt) === month && !a.refundedAt,
  ).length;
}

export function freeContactsLeft(input: Pick<AppState, 'contactAccesses'>, viewerId: Id, now: IsoDate): number {
  return Math.max(0, CONFIG.freeContactsPerMonth - freeContactsUsed(input, viewerId, now));
}

export function activePackage(input: Pick<AppState, 'packages'>, companyId: Id, now: IsoDate): ContactPackage | undefined {
  return input.packages.find(
    (p) => p.companyId === companyId && !isBefore(now, p.validFrom) && isBefore(now, p.validTo) && p.used < p.size,
  );
}

/** What happens if the viewer presses "Open contact" on this listing now. */
export type ContactDecision =
  | { kind: 'own_listing' }
  | { kind: 'already_open' }
  | { kind: 'open_listing' }
  | { kind: 'free_quota'; freeLeftAfter: number }
  | { kind: 'package'; packageId: Id }
  | { kind: 'balance'; price: Cents }
  | { kind: 'insufficient_funds'; price: Cents; balance: Cents }
  | { kind: 'unavailable'; reason: 'not_a_company' | 'listing_inactive' };

/** Order: own → already open → open listing → free quota → package → balance. */
export function decideContact(input: ContactInput, viewerId: Id, listing: Listing, now: IsoDate): ContactDecision {
  if (!input.companies.some((c) => c.id === viewerId)) return { kind: 'unavailable', reason: 'not_a_company' };
  if (listing.ownerId === viewerId) return { kind: 'own_listing' };
  if (findAccess(input, viewerId, listing.ownerId)) return { kind: 'already_open' };
  if (listing.status !== 'active' || isExpired(listing, now)) return { kind: 'unavailable', reason: 'listing_inactive' };
  if (listing.isOpen) return { kind: 'open_listing' };
  const freeLeft = freeContactsLeft(input, viewerId, now);
  if (freeLeft > 0) return { kind: 'free_quota', freeLeftAfter: freeLeft - 1 };
  const pkg = activePackage(input, viewerId, now);
  if (pkg) return { kind: 'package', packageId: pkg.id };
  const price = CONFIG.prices.contact;
  const balance = balanceOf(input.transactions, viewerId);
  return balance >= price ? { kind: 'balance', price } : { kind: 'insufficient_funds', price, balance };
}

/** True when the viewer may see the contact details on this listing without further action. */
export function canSeeContact(input: ContactInput, viewerId: Id, listing: Listing): boolean {
  return listing.ownerId === viewerId || !!findAccess(input, viewerId, listing.ownerId);
}
