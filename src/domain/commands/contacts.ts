// Open a contact: create the access and charge according to decideContact.
import { logEvent, nextId } from '../events';
import { decideContact } from '../rules/contactAccess';
import type { AppState, ContactAccess, ContactPaidWith, Id, LedgerTransaction } from '../types';
import type { CommandResult } from './result';

export function openContact(state: AppState, listingId: Id): CommandResult {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: 'listing_not_found' };
  const viewerId = state.actorId;
  const decision = decideContact(state, viewerId, listing, state.now);

  switch (decision.kind) {
    case 'own_listing':
    case 'already_open':
      return { ok: true, state }; // nothing to pay, nothing to record
    case 'unavailable':
      return { ok: false, error: 'not_allowed' };
    case 'insufficient_funds':
      return { ok: false, error: 'insufficient_funds' };
  }

  let s = state;
  let accessId: Id;
  [s, accessId] = nextId(s, 'a');
  const paidWith: ContactPaidWith = decision.kind;
  const access: ContactAccess = {
    id: accessId,
    viewerId,
    ownerId: listing.ownerId,
    firstListingId: listing.id,
    openedAt: s.now,
    paidWith,
  };

  if (decision.kind === 'balance') {
    let txId: Id;
    [s, txId] = nextId(s, 't');
    const tx: LedgerTransaction = {
      id: txId,
      companyId: viewerId,
      type: 'contact',
      amount: -decision.price,
      createdAt: s.now,
      refId: accessId,
    };
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
  s = logEvent(s, {
    type: 'contact_opened',
    actor: viewerId,
    subjectIds: [viewerId, listing.ownerId, listing.id],
    reasonKey: `event.contactOpened.${paidWith}`,
    params: { owner: listing.ownerId, listing: listing.id },
  });
  return { ok: true, state: s };
}
