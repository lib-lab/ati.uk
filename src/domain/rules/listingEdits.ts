// Editing a listing after contacts were opened (TZ): edits are allowed, every change goes to the
// visible history, and a key-field change soon after an opening lets the viewer get a refund.
import { CONFIG } from '../config';
import { getCity } from '../geo/cities';
import { addHours, isBefore, toMs } from '../time';
import type { AppState, Id, Listing, ListingChange } from '../types';
import type { ListingDraft } from './listingDraft';

/** Fields whose change can turn a listing into a different offer. */
export const KEY_FIELDS = ['route', 'dates', 'bodyTypes', 'weightT', 'rate'] as const;

const place = (cityId: string) => (cityId ? getCity(cityId).name : '');

function snapshot(l: Pick<ListingDraft, 'from' | 'to' | 'dateFrom' | 'dateTo' | 'bodyTypes' | 'weightT' | 'volumeM3' | 'loadingMethods' | 'rate' | 'comment' | 'cargoName' | 'packaging' | 'pieces' | 'contactPersonId'>) {
  return {
    route: `${place(l.from.cityId)}${l.from.address ? ` (${l.from.address})` : ''} → ${'any' in l.to ? '*' : place(l.to.cityId)}`,
    dates: `${l.dateFrom.slice(0, 10)}${l.dateTo ? ` – ${l.dateTo.slice(0, 10)}` : ''}`,
    bodyTypes: [...l.bodyTypes].sort().join(', '),
    weightT: `${l.weightT} t`,
    rate: l.rate.mode === 'fixed' ? `${(l.rate.amount ?? 0) / 100} ${l.rate.currency}${l.rate.vatIncluded ? ' incl. VAT' : ''}${l.rate.paymentMethod ? `, ${l.rate.paymentMethod}` : ''}` : 'on request',
    volumeM3: l.volumeM3 === undefined ? '' : `${l.volumeM3} m³`,
    loadingMethods: [...l.loadingMethods].sort().join(', '),
    cargo: l.cargoName ? `${l.cargoName}, ${l.packaging}, ${l.pieces}` : '',
    comment: l.comment ?? '',
    contactPerson: l.contactPersonId,
  };
}

export function listingDiff(before: Listing, after: ListingDraft): ListingChange['fields'] {
  const b = snapshot(before.kind === 'cargo' ? { ...before } : { ...before, dateTo: undefined });
  const a = snapshot({ ...after, comment: after.comment?.trim() || undefined });
  return (Object.keys(b) as (keyof typeof b)[]).filter((k) => b[k] !== a[k]).map((k) => ({ field: k, before: b[k], after: a[k] }));
}

export function isKeyChange(fields: ListingChange['fields']): boolean {
  return fields.some((f) => (KEY_FIELDS as readonly string[]).includes(f.field));
}

/**
 * The viewer may get a refund when they paid for the contact by opening it on this listing and a key
 * field of this listing changed within 24 hours after that opening.
 */
export function editRefund(
  state: Pick<AppState, 'contactAccesses' | 'listingChanges'>,
  viewerId: Id,
  listingId: Id,
): { change: ListingChange } | null {
  const access = state.contactAccesses.find((a) => a.viewerId === viewerId && a.firstListingId === listingId);
  // Open listings are free; returning a contact to a package comes with packages (E11).
  if (!access || access.refundedAt || access.paidWith === 'open_listing' || access.paidWith === 'package') return null;
  const until = addHours(access.openedAt, CONFIG.editRefundHours);
  // The simulated clock does not move between clicks, so a change at the very moment of the opening counts.
  const change = state.listingChanges.find(
    (c) => c.listingId === listingId && c.key && toMs(c.at) >= toMs(access.openedAt) && !isBefore(until, c.at),
  );
  return change ? { change } : null;
}

