// Posting rules: who may post what, and which fields are required (TZ: "Listings").
import { CONFIG } from '../config';
import { addDays, endOfDay, isBefore, startOfDay, toMs } from '../time';
import type { BodyType, Company, Destination, IsoDate, Listing, ListingKind, LoadingMethod, Place, Rate, Role } from '../types';
import { computeExpiresAt } from './lifetime';

/** What a company fills in the posting form. */
export interface ListingDraft {
  kind: ListingKind;
  contactPersonId: string;
  from: Place;
  to: Destination;
  dateFrom: IsoDate;
  dateTo?: IsoDate;
  bodyTypes: BodyType[];
  weightT: number;
  volumeM3?: number;
  loadingMethods: LoadingMethod[];
  rate: Rate;
  comment?: string;
  cargoName?: string;
  packaging?: string;
  pieces?: number;
}

/** Shipper posts cargo, carrier posts trucks, forwarder posts both. */
export function canPost(role: Role, kind: ListingKind): boolean {
  return role === 'forwarder' || (role === 'shipper' ? kind === 'cargo' : kind === 'truck');
}

export function postableKinds(role: Role): ListingKind[] {
  return (['cargo', 'truck'] as ListingKind[]).filter((k) => canPost(role, k));
}

export type DraftField =
  | 'contactPersonId'
  | 'from'
  | 'to'
  | 'dateFrom'
  | 'dateTo'
  | 'bodyTypes'
  | 'weightT'
  | 'volumeM3'
  | 'rate'
  | 'cargoName'
  | 'packaging'
  | 'pieces';

/** Field → i18n error key. Empty object means the draft is valid. */
export type DraftErrors = Partial<Record<DraftField, string>>;

export function validateDraft(draft: ListingDraft, owner: Company, now: IsoDate): DraftErrors {
  const e: DraftErrors = {};
  if (!owner.contactPersons.some((p) => p.id === draft.contactPersonId)) e.contactPersonId = 'draft.required';
  if (!draft.from.cityId) e.from = 'draft.required';
  if (!('any' in draft.to) && !draft.to.cityId) e.to = 'draft.required';
  if ('any' in draft.to && draft.kind === 'cargo') e.to = 'draft.cargoNeedsDestination';
  if (!('any' in draft.to) && draft.to.cityId && draft.to.cityId === draft.from.cityId) e.to = 'draft.sameCity';
  if (!draft.dateFrom) e.dateFrom = 'draft.required';
  else if (isBefore(draft.dateFrom, startOfDay(now))) e.dateFrom = 'draft.dateInPast';
  if (draft.dateTo) {
    if (draft.kind !== 'cargo') e.dateTo = 'draft.rangeCargoOnly';
    else if (draft.dateFrom && isBefore(draft.dateTo, draft.dateFrom)) e.dateTo = 'draft.rangeOrder';
  }
  if (draft.bodyTypes.length === 0) e.bodyTypes = 'draft.required';
  else if (draft.kind === 'truck' && draft.bodyTypes.length > 1) e.bodyTypes = 'draft.truckOneBody';
  if (!(draft.weightT > 0)) e.weightT = 'draft.positive';
  if (draft.volumeM3 !== undefined && !(draft.volumeM3 > 0)) e.volumeM3 = 'draft.positive';
  if (draft.rate.mode === 'fixed' && !(draft.rate.amount !== undefined && draft.rate.amount > 0)) e.rate = 'draft.positive';
  if (draft.kind === 'cargo') {
    if (!draft.cargoName?.trim()) e.cargoName = 'draft.required';
    if (!draft.packaging?.trim()) e.packaging = 'draft.required';
    if (!(draft.pieces !== undefined && Number.isInteger(draft.pieces) && draft.pieces >= 1)) e.pieces = 'draft.positiveInteger';
  }
  return e;
}

/** Turns a valid draft into a listing. */
export function listingFromDraft(draft: ListingDraft, id: string, ownerId: string, now: IsoDate): Listing {
  const base = {
    id,
    ownerId,
    contactPersonId: draft.contactPersonId,
    from: draft.from,
    to: draft.to,
    dateFrom: draft.dateFrom,
    bodyTypes: draft.bodyTypes,
    weightT: draft.weightT,
    volumeM3: draft.volumeM3,
    loadingMethods: draft.loadingMethods.length ? draft.loadingMethods : (['rear'] as LoadingMethod[]),
    rate: { ...draft.rate, currency: CONFIG.currency },
    comment: draft.comment?.trim() || undefined,
    createdAt: now,
    expiresAt: computeExpiresAt(draft.kind, draft.dateFrom, draft.kind === 'cargo' ? draft.dateTo : undefined),
    status: 'active' as const,
    isOpen: false,
  };
  if (draft.kind === 'cargo') {
    return {
      ...base,
      kind: 'cargo',
      dateTo: draft.dateTo,
      cargoName: draft.cargoName!.trim(),
      packaging: draft.packaging!.trim(),
      pieces: draft.pieces!,
    };
  }
  return { ...base, kind: 'truck' };
}

/**
 * Expiry after "Extend": the normal lifetime from the (possibly moved) dates, but at least
 * until the end of today + the kind's lifetime days (see DECISIONS "Extension").
 */
export function extendedExpiry(kind: ListingKind, dateFrom: IsoDate, dateTo: IsoDate | undefined, now: IsoDate): IsoDate {
  const byDates = computeExpiresAt(kind, dateFrom, dateTo);
  const days = kind === 'cargo' ? CONFIG.lifetime.cargoDaysAfterLoading : CONFIG.lifetime.truckDaysAfterAvailable;
  const fromNow = endOfDay(addDays(now, days));
  return toMs(byDates) > toMs(fromNow) ? byDates : fromNow;
}
