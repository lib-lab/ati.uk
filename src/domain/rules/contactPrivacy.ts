// Contact data is not available before opening (TZ: "Against collecting contacts", "Personal data").
// In the prototype the whole state lives in the browser, so this is enforced as a domain access rule:
// the UI reads listings only through publicListing() and contacts only through revealContact().
import type { AppState, ContactPerson, Id, IsoDate, Listing } from '../types';
import { findAccess } from './contactAccess';

/** A listing without its contact person: what search results and the card get. */
export type PublicListing = Listing extends infer L ? (L extends Listing ? Omit<L, 'contactPersonId'> : never) : never;

export function publicListing(l: Listing): PublicListing {
  const { contactPersonId: _hidden, ...rest } = l;
  return rest as PublicListing;
}

export function hasConsent(p: ContactPerson): boolean {
  return !p.consent.withdrawnAt;
}

export type RevealResult =
  | { ok: true; person: Pick<ContactPerson, 'name' | 'phone'>; since?: IsoDate }
  | { ok: false; reason: 'not_opened' | 'no_consent' | 'deleted' | 'not_found' };

/**
 * The only way to get a contact: own listing, or an opened contact of the owner. Only a person who
 * gave consent is shown (the listing's person, otherwise another consenting person of the company).
 */
export function revealContact(state: Pick<AppState, 'listings' | 'companies' | 'contactAccesses'>, viewerId: Id, listingId: Id): RevealResult {
  const listing = state.listings.find((l) => l.id === listingId);
  const owner = listing && state.companies.find((c) => c.id === listing.ownerId);
  if (!listing || !owner) return { ok: false, reason: 'not_found' };
  if (owner.status === 'deleted') return { ok: false, reason: 'deleted' };
  const access = findAccess(state, viewerId, owner.id);
  if (owner.id !== viewerId && !access) return { ok: false, reason: 'not_opened' };
  const person = [owner.contactPersons.find((p) => p.id === listing.contactPersonId), ...owner.contactPersons].find((p) => p && hasConsent(p));
  if (!person) return { ok: false, reason: 'no_consent' };
  return { ok: true, person: { name: person.name, phone: person.phone }, since: access?.openedAt };
}
