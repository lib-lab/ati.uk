// Open a contact: create the access and charge according to decideContact, behind the
// anti-collection gate (daily limit, human check while slowed, block if signals persist).
import { CONFIG } from '../config';
import { logEvent, nextId } from '../events';
import { addNotification } from '../notifications';
import { collectionSignals, guardOf, hasHistory, openingGate, recovered } from '../rules/collection';
import { decideContact } from '../rules/contactAccess';
import type { AppState, CollectionGuard, ContactAccess, ContactOpening, ContactPaidWith, Id, LedgerTransaction } from '../types';
import { MODERATOR_ID } from '../types';
import type { CommandResult } from './result';

export interface OpenOptions {
  /** Opened from the listing card. Direct requests without viewing the card are a collection signal. */
  viaCard?: boolean;
  /** The "I am a human" check passed (required while slowed). */
  humanConfirmed?: boolean;
}

function recordOpening(state: AppState, viewerId: Id, ownerId: Id, listingId: Id, createdAccess: boolean, viaCard: boolean): AppState {
  const [s, id] = nextId(state, 'o');
  const opening: ContactOpening = { id, viewerId, ownerId, listingId, at: s.now, createdAccess, viaCard };
  return { ...s, contactOpenings: [...s.contactOpenings, opening] };
}

function setGuard(state: AppState, companyId: Id, guard: CollectionGuard): AppState {
  return { ...state, companies: state.companies.map((c) => (c.id === companyId ? { ...c, collection: guard } : c)) };
}

export function openContact(state: AppState, listingId: Id, options: OpenOptions = {}): CommandResult {
  const viaCard = options.viaCard ?? true;
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: 'listing_not_found' };
  const viewerId = state.actorId;
  const decision = decideContact(state, viewerId, listing, state.now);

  switch (decision.kind) {
    case 'own_listing':
      return { ok: true, state };
    case 'already_open': {
      // Free: record that the contact was revealed on this listing too (for change notifications).
      const seen = state.contactOpenings.some((o) => o.viewerId === viewerId && o.listingId === listing.id);
      return { ok: true, state: seen ? state : recordOpening(state, viewerId, listing.ownerId, listing.id, false, viaCard) };
    }
    case 'unavailable':
      return { ok: false, error: 'not_allowed' };
    case 'insufficient_funds':
      return { ok: false, error: 'insufficient_funds' };
  }

  // ----- anti-collection gate -----
  const company = state.companies.find((c) => c.id === viewerId)!;
  let guard = guardOf(company, state.now);
  if (guard.state === 'slowed' && recovered(state, viewerId, guard, state.now)) guard = { state: 'ok', since: state.now, reasons: [], failedChecks: 0 };
  const gate = openingGate(state, viewerId, state.now, !!options.humanConfirmed);
  if (gate.kind === 'blocked') return { ok: false, error: 'collection_blocked' };
  if (gate.kind === 'daily_limit') return { ok: false, error: 'daily_limit' };
  if (gate.kind === 'slow_down') return { ok: false, error: 'slow_down' };
  if (gate.kind === 'human_check') {
    // Counted: signals persist when attempts keep coming without the human check.
    const failed = { ...guard, failedChecks: guard.failedChecks + 1 };
    if (failed.failedChecks >= CONFIG.collection.failedChecksToBlock) {
      return { ok: false, error: 'collection_blocked', state: block(state, viewerId, { ...failed, reasons: [...failed.reasons, 'collection.signal.persisting'] }) };
    }
    return { ok: false, error: 'human_check_required', state: setGuard(state, viewerId, failed) };
  }

  // ----- the opening itself -----
  let s = state;
  let accessId: Id;
  [s, accessId] = nextId(s, 'a');
  const paidWith: ContactPaidWith = decision.kind;
  const access: ContactAccess = {
    id: accessId, viewerId, ownerId: listing.ownerId, firstListingId: listing.id, openedAt: s.now, paidWith,
    ...(decision.kind === 'package' ? { packageId: decision.packageId } : {}),
  };

  if (decision.kind === 'balance') {
    let txId: Id;
    [s, txId] = nextId(s, 't');
    const tx: LedgerTransaction = { id: txId, companyId: viewerId, type: 'contact', amount: -decision.price, createdAt: s.now, refId: accessId };
    access.transactionId = txId;
    s = { ...s, transactions: [...s.transactions, tx] };
    s = logEvent(s, {
      type: 'payment',
      actor: viewerId,
      subjectIds: [viewerId, listing.ownerId, accessId],
      reasonKey: 'event.payment.contact',
      params: { amount: decision.price, owner: listing.ownerId, listing: listing.id },
    });
  }
  if (decision.kind === 'package') {
    s = { ...s, packages: s.packages.map((p) => (p.id === decision.packageId ? { ...p, used: p.used + 1 } : p)) };
  }

  s = { ...s, contactAccesses: [...s.contactAccesses, access] };
  s = recordOpening(s, viewerId, listing.ownerId, listing.id, true, viaCard);
  s = logEvent(s, {
    type: 'contact_opened',
    actor: viewerId,
    subjectIds: [viewerId, listing.ownerId, listing.id],
    reasonKey: `event.contactOpened.${paidWith}`,
    params: { owner: listing.ownerId, listing: listing.id },
  });

  // ----- signals after the opening: slow down first -----
  if (guard.state === 'ok') {
    const signals = collectionSignals(s, viewerId, guard.since, s.now);
    if (signals.length > 0) {
      s = setGuard(s, viewerId, { state: 'slowed', since: s.now, reasons: signals, failedChecks: 0 });
      s = logEvent(s, { type: 'contact_collection', actor: 'system', subjectIds: [viewerId], reasonKey: 'event.collection.slowed', params: { company: viewerId } });
      s = addNotification(s, viewerId, 'collection_slowed', { perHour: CONFIG.collection.slowedPerHour });
    } else if (company.collection?.state === 'slowed') {
      s = setGuard(s, viewerId, guard); // recovered
    }
  } else if (guard.state === 'slowed') {
    // Passed the human check: count against the hourly cap; a passed check clears failed attempts.
    s = setGuard(s, viewerId, { ...guard, failedChecks: 0, openedWhileSlowed: [...(guard.openedWhileSlowed ?? []), s.now] });
  }
  return { ok: true, state: s };
}

function block(state: AppState, companyId: Id, guard: CollectionGuard): AppState {
  let s = setGuard(state, companyId, { ...guard, state: 'blocked', since: state.now });
  s = logEvent(s, { type: 'contact_collection', actor: 'system', subjectIds: [companyId], reasonKey: 'event.collection.blocked', params: { company: companyId } });
  return addNotification(s, companyId, 'collection_blocked', {});
}

/** The moderator lifts a collection block after a manual check. */
export function unblockCollection(state: AppState, companyId: Id): CommandResult {
  if (state.actorId !== MODERATOR_ID) return { ok: false, error: 'not_allowed' };
  const company = state.companies.find((c) => c.id === companyId);
  if (!company || company.collection?.state !== 'blocked') return { ok: false, error: 'not_found' };
  const s = setGuard(state, companyId, { state: 'ok', since: state.now, reasons: [], failedChecks: 0 });
  return { ok: true, state: logEvent(s, { type: 'contact_collection', actor: MODERATOR_ID, subjectIds: [companyId], reasonKey: 'event.collection.unblocked', params: { company: companyId } }) };
}

/** A company with history raises its daily limit on request, without review (TZ). */
export function requestHigherLimit(state: AppState): CommandResult {
  const company = state.companies.find((c) => c.id === state.actorId);
  if (!company) return { ok: false, error: 'not_allowed' };
  if (!hasHistory(state, company, state.now)) return { ok: false, error: 'no_history' };
  const limit = CONFIG.collection.raisedDailyOpenLimit;
  const s = { ...state, companies: state.companies.map((c) => (c.id === company.id ? { ...c, dailyOpenLimit: limit } : c)) };
  return { ok: true, state: logEvent(s, { type: 'contact_collection', actor: company.id, subjectIds: [company.id], reasonKey: 'event.collection.limitRaised', params: { limit } }) };
}
