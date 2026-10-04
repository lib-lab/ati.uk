// Posting and managing own listings; listing-related time processes.
import { CONFIG } from '../config';
import { logEvent, nextId } from '../events';
import { getCity } from '../geo/cities';
import { addNotification } from '../notifications';
import { withRatingEvents } from '../ratingEvents';
import { balanceOf } from '../rules/ledger';
import { isExpired, needsExpiryReminder } from '../rules/lifetime';
import { canPost, extendedExpiry, listingFromDraft, validateDraft, type ListingDraft } from '../rules/listingDraft';
import { hasPriority } from '../rules/search';
import { isBefore, startOfDay } from '../time';
import type { AppState, Cents, Id, IsoDate, Listing, RemovalReason, RouteTemplate, TransactionType } from '../types';
import type { CommandResult } from './result';
import type { TimeProcess } from './time';

/** "Warsaw → Berlin" for notifications and events. */
export function routeLabel(l: Pick<Listing, 'from' | 'to'>): string {
  return `${getCity(l.from.cityId).name} → ${'any' in l.to ? '*' : getCity(l.to.cityId).name}`;
}

function actorCompany(state: AppState) {
  return state.companies.find((c) => c.id === state.actorId);
}

/** Finds the actor's own listing. */
function ownListing(state: AppState, listingId: Id): Listing | 'not_found' | 'not_allowed' {
  const l = state.listings.find((x) => x.id === listingId);
  if (!l) return 'not_found';
  return l.ownerId === state.actorId ? l : 'not_allowed';
}

function replaceListing(state: AppState, listing: Listing): AppState {
  return { ...state, listings: state.listings.map((l) => (l.id === listing.id ? listing : l)) };
}

/** Debits the balance; null when funds are insufficient. */
function charge(state: AppState, companyId: Id, amount: Cents, type: TransactionType, refId: Id): AppState | null {
  if (balanceOf(state.transactions, companyId) < amount) return null;
  const [s, txId] = nextId(state, 't');
  return {
    ...s,
    transactions: [...s.transactions, { id: txId, companyId, type, amount: -amount, createdAt: s.now, refId }],
  };
}

export function postListing(state: AppState, draft: ListingDraft): CommandResult {
  const owner = actorCompany(state);
  if (!owner) return { ok: false, error: 'not_allowed' };
  if (!canPost(owner.role, draft.kind)) return { ok: false, error: 'role_cannot_post' };
  if (Object.keys(validateDraft(draft, owner, state.now)).length > 0) return { ok: false, error: 'invalid_listing' };
  const [s0, id] = nextId(state, 'l');
  const listing = listingFromDraft(draft, id, owner.id, s0.now);
  let s: AppState = { ...s0, listings: [...s0.listings, listing] };
  s = logEvent(s, {
    type: 'listing_created',
    actor: owner.id,
    subjectIds: [owner.id, id],
    reasonKey: 'event.listing.created',
    params: { listing: id, route: routeLabel(listing) },
  });
  s = withRatingEvents(state, s, { reasonKey: 'event.rating.listingPosted', params: { listing: id }, actor: owner.id });
  return { ok: true, state: s };
}

/**
 * Extend an active or expired listing. Optionally move the loading/availability date.
 * Priority does not carry over; "open" stays (see DECISIONS "Extension").
 */
export function extendListing(state: AppState, listingId: Id, newDateFrom?: IsoDate): CommandResult {
  const l = ownListing(state, listingId);
  if (l === 'not_found') return { ok: false, error: 'listing_not_found' };
  if (l === 'not_allowed') return { ok: false, error: 'not_allowed' };
  if (l.status === 'removed') return { ok: false, error: 'listing_not_active' };
  if (newDateFrom && isBefore(newDateFrom, startOfDay(state.now))) return { ok: false, error: 'invalid_listing' };

  let dateFrom = l.dateFrom;
  let dateTo = l.kind === 'cargo' ? l.dateTo : undefined;
  if (newDateFrom) {
    // Keep the length of a loading range when the start moves.
    if (dateTo) dateTo = new Date(Date.parse(dateTo) + (Date.parse(newDateFrom) - Date.parse(dateFrom))).toISOString();
    dateFrom = newDateFrom;
  }
  const updated: Listing = {
    ...l,
    dateFrom,
    ...(l.kind === 'cargo' ? { dateTo } : {}),
    expiresAt: extendedExpiry(l.kind, dateFrom, dateTo, state.now),
    status: 'active',
    priorityUntil: undefined,
    reminderSentAt: undefined,
  } as Listing;
  const s = logEvent(replaceListing(state, updated), {
    type: 'listing_extended',
    actor: state.actorId,
    subjectIds: [l.ownerId, l.id],
    reasonKey: 'event.listing.extended',
    params: { listing: l.id, route: routeLabel(l), until: updated.expiresAt },
  });
  return { ok: true, state: s };
}

export function removeListing(state: AppState, listingId: Id, reason: RemovalReason): CommandResult {
  const l = ownListing(state, listingId);
  if (l === 'not_found') return { ok: false, error: 'listing_not_found' };
  if (l === 'not_allowed') return { ok: false, error: 'not_allowed' };
  if (l.status !== 'active') return { ok: false, error: 'listing_not_active' };
  let s = replaceListing(state, { ...l, status: 'removed', removalReason: reason, removedAt: state.now, priorityUntil: undefined });
  s = logEvent(s, {
    type: 'listing_removed',
    actor: state.actorId,
    subjectIds: [l.ownerId, l.id],
    reasonKey: `event.listing.removed.${reason}`,
    params: { listing: l.id, route: routeLabel(l) },
  });
  // The removal reason is a metric only and does not enter the rating (TZ).
  return { ok: true, state: s };
}

/** "Open" listing: contact visible to everyone for free. Paid once, kept on extension. */
export function makeListingOpen(state: AppState, listingId: Id): CommandResult {
  const l = ownListing(state, listingId);
  if (l === 'not_found') return { ok: false, error: 'listing_not_found' };
  if (l === 'not_allowed') return { ok: false, error: 'not_allowed' };
  if (l.status !== 'active' || isExpired(l, state.now)) return { ok: false, error: 'listing_not_active' };
  if (l.isOpen) return { ok: false, error: 'already_open' };
  const charged = charge(state, l.ownerId, CONFIG.prices.openListing, 'open_listing', l.id);
  if (!charged) return { ok: false, error: 'insufficient_funds' };
  const s = logEvent(replaceListing(charged, { ...l, isOpen: true }), {
    type: 'payment',
    actor: l.ownerId,
    subjectIds: [l.ownerId, l.id],
    reasonKey: 'event.payment.openListing',
    params: { amount: CONFIG.prices.openListing, listing: l.id, route: routeLabel(l) },
  });
  return { ok: true, state: s };
}

/** Priority placement until the end of the current lifetime. */
export function buyPriority(state: AppState, listingId: Id): CommandResult {
  const l = ownListing(state, listingId);
  if (l === 'not_found') return { ok: false, error: 'listing_not_found' };
  if (l === 'not_allowed') return { ok: false, error: 'not_allowed' };
  if (l.status !== 'active' || isExpired(l, state.now)) return { ok: false, error: 'listing_not_active' };
  if (hasPriority(l, state.now)) return { ok: false, error: 'already_priority' };
  const charged = charge(state, l.ownerId, CONFIG.prices.priority, 'priority', l.id);
  if (!charged) return { ok: false, error: 'insufficient_funds' };
  const s = logEvent(replaceListing(charged, { ...l, priorityUntil: l.expiresAt }), {
    type: 'payment',
    actor: l.ownerId,
    subjectIds: [l.ownerId, l.id],
    reasonKey: 'event.payment.priority',
    params: { amount: CONFIG.prices.priority, listing: l.id, route: routeLabel(l), until: l.expiresAt },
  });
  return { ok: true, state: s };
}

// ---------- Route templates ----------

/** Templates keep the route and cargo/vehicle parameters; dates are filled in each time. */
export type TemplateFields = Omit<ListingDraft, 'dateFrom' | 'dateTo'>;

export function saveTemplate(state: AppState, name: string, fields: TemplateFields): CommandResult {
  const owner = actorCompany(state);
  if (!owner || !name.trim()) return { ok: false, error: 'not_allowed' };
  const [s, id] = nextId(state, 'rt');
  const template: RouteTemplate = { id, companyId: owner.id, kind: fields.kind, name: name.trim(), fields };
  return { ok: true, state: { ...s, templates: [...s.templates, template] } };
}

export function deleteTemplate(state: AppState, templateId: Id): CommandResult {
  const t = state.templates.find((x) => x.id === templateId);
  if (!t) return { ok: false, error: 'template_not_found' };
  if (t.companyId !== state.actorId) return { ok: false, error: 'not_allowed' };
  return { ok: true, state: { ...state, templates: state.templates.filter((x) => x.id !== templateId) } };
}

// ---------- Time processes ----------

/** Owner gets one reminder per lifetime, within the last 24 hours. */
export const expiryReminderProcess: TimeProcess = {
  reasonKey: 'event.listing.reminder',
  run(state, _from, to) {
    let s = state;
    for (const l of state.listings) {
      if (!needsExpiryReminder(l, to)) continue;
      s = replaceListing(s, { ...l, reminderSentAt: to });
      s = addNotification(s, l.ownerId, 'expiry_reminder', { listing: l.id, route: routeLabel(l), until: l.expiresAt });
    }
    return s;
  },
};

/** Active listings past their lifetime become "expired"; the owner is notified. */
export const expiryProcess: TimeProcess = {
  reasonKey: 'event.listing.expired',
  run(state, _from, to) {
    let s = state;
    for (const l of state.listings) {
      if (l.status !== 'active' || !isExpired(l, to)) continue;
      s = replaceListing(s, { ...l, status: 'expired', priorityUntil: undefined });
      s = logEvent(s, {
        type: 'listing_expired',
        actor: 'system',
        subjectIds: [l.ownerId, l.id],
        reasonKey: 'event.listing.expired',
        params: { listing: l.id, route: routeLabel(l) },
      });
      s = addNotification(s, l.ownerId, 'listing_expired', { listing: l.id, route: routeLabel(l) });
    }
    return s;
  },
};
