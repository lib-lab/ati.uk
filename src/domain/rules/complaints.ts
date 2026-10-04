// Complaints about listings and their consequences (TZ: "Against outdated data", "Opening a contact").
import { CONFIG } from '../config';
import { addDays, isBefore, monthKey, toMs } from '../time';
import type { AppState, Cents, Complaint, ComplaintType, ContactAccess, Id, IsoDate, Listing } from '../types';
import { findAccess } from './contactAccess';

const C = CONFIG.complaints;

export type ComplaintEligibility =
  | { ok: true }
  | { ok: false; reason: 'not_company' | 'own_listing' | 'no_access' | 'already_filed' };

/**
 * "Outdated" — any company. "Does not answer" and "wrong data" — only after opening the owner's contact.
 * One complaint per listing per reporter.
 */
export function canComplain(
  state: Pick<AppState, 'companies' | 'contactAccesses' | 'complaints'>,
  reporterId: Id,
  listing: Listing,
  type: ComplaintType,
): ComplaintEligibility {
  if (!state.companies.some((c) => c.id === reporterId)) return { ok: false, reason: 'not_company' };
  if (listing.ownerId === reporterId) return { ok: false, reason: 'own_listing' };
  if (state.complaints.some((c) => c.reporterId === reporterId && c.listingId === listing.id)) {
    return { ok: false, reason: 'already_filed' };
  }
  if (type !== 'outdated' && !findAccess(state, reporterId, listing.ownerId)) return { ok: false, reason: 'no_access' };
  return { ok: true };
}

/** Refunded contacts of a company within the window ending now. */
export function refundsInWindow(state: Pick<AppState, 'contactAccesses'>, companyId: Id, now: IsoDate): number {
  const since = addDays(now, -C.windowDays);
  return state.contactAccesses.filter((a) => a.viewerId === companyId && a.refundedAt && !isBefore(a.refundedAt, since)).length;
}

/** Complaints from reporters with a high share of refunded contacts weigh less (TZ). */
export function complaintWeight(state: Pick<AppState, 'contactAccesses'>, reporterId: Id): number {
  const opened = state.contactAccesses.filter((a) => a.viewerId === reporterId);
  const refunded = opened.filter((a) => a.refundedAt).length;
  if (refunded < 2 || opened.length === 0) return 1; // one refund is not a pattern
  return refunded / opened.length > C.highRefundShare ? C.highRefundWeight : 1;
}

/** Confirmed complaints about a company within the window, after its last contact confirmation. */
export function confirmedComplaintsInWindow(
  state: Pick<AppState, 'complaints' | 'companies'>,
  companyId: Id,
  now: IsoDate,
): Complaint[] {
  const since = addDays(now, -C.windowDays);
  const confirmedAt = state.companies.find((c) => c.id === companyId)?.contactConfirmedAt;
  return state.complaints.filter(
    (c) =>
      c.targetId === companyId &&
      c.status === 'confirmed' &&
      !!c.resolvedAt &&
      !isBefore(c.resolvedAt, since) &&
      (!confirmedAt || toMs(c.resolvedAt) > toMs(confirmedAt)),
  );
}

export interface ComplaintShare {
  count: number;
  /** Sum of complaint weights. */
  weighted: number;
  /** Contacts of the company opened in the window. */
  contacts: number;
  share: number;
  hides: boolean;
}

/**
 * Listings are hidden when confirmed complaints / opened contacts in 30 days ≥ 20 % and there are
 * at least 3 complaints (TZ). Complaints can come without an opened contact ("outdated"), so the
 * denominator is never smaller than the number of complaints.
 */
export function complaintShare(state: Pick<AppState, 'complaints' | 'companies' | 'contactAccesses'>, companyId: Id, now: IsoDate): ComplaintShare {
  const since = addDays(now, -C.windowDays);
  const confirmedAt = state.companies.find((c) => c.id === companyId)?.contactConfirmedAt;
  const complaints = confirmedComplaintsInWindow(state, companyId, now);
  const weighted = complaints.reduce((sum, c) => sum + complaintWeight(state, c.reporterId), 0);
  const contacts = state.contactAccesses.filter(
    (a) => a.ownerId === companyId && !isBefore(a.openedAt, since) && (!confirmedAt || toMs(a.openedAt) > toMs(confirmedAt)),
  ).length;
  const share = complaints.length === 0 ? 0 : weighted / Math.max(contacts, complaints.length);
  return { count: complaints.length, weighted, contacts, share, hides: complaints.length >= C.hideMinCount && share >= C.hideShare };
}

/**
 * Independent companies with a confirmed "does not answer"/"wrong data" complaint about the target
 * in the window. Companies sharing a device count once; each counts with its complaint weight.
 */
export function independentReporters(state: Pick<AppState, 'complaints' | 'companies' | 'contactAccesses'>, targetId: Id, now: IsoDate) {
  const since = addDays(now, -C.windowDays);
  const reporters = [
    ...new Set(
      state.complaints
        .filter((c) => c.targetId === targetId && c.type !== 'outdated' && c.status === 'confirmed' && c.resolvedAt && !isBefore(c.resolvedAt, since))
        .map((c) => c.reporterId),
    ),
  ];
  const byDevice = new Map<string, number>();
  for (const r of reporters) {
    const device = state.companies.find((c) => c.id === r)?.deviceId ?? r;
    byDevice.set(device, Math.max(byDevice.get(device) ?? 0, complaintWeight(state, r)));
  }
  const weight = [...byDevice.values()].reduce((a, b) => a + b, 0);
  return { reporterIds: reporters, weight, enough: weight >= C.refundMinIndependentReporters };
}

/** What returning a contact's price would give (see DECISIONS "Refund"). */
export type Refund =
  | { kind: 'money'; amount: Cents }
  | { kind: 'free_quota' }
  | { kind: 'none'; reason: 'already_refunded' | 'quota_month_passed' | 'nothing_paid' | 'no_access' | 'limit_reached' };

export function refundFor(
  state: Pick<AppState, 'contactAccesses' | 'transactions'>,
  access: ContactAccess | undefined,
  now: IsoDate,
): Refund {
  if (!access) return { kind: 'none', reason: 'no_access' };
  if (access.refundedAt) return { kind: 'none', reason: 'already_refunded' };
  if (refundsInWindow(state, access.viewerId, now) >= C.refundLimitPerWindow) return { kind: 'none', reason: 'limit_reached' };
  switch (access.paidWith) {
    case 'balance': {
      const tx = state.transactions.find((t) => t.id === access.transactionId);
      return tx ? { kind: 'money', amount: -tx.amount } : { kind: 'none', reason: 'nothing_paid' };
    }
    case 'free_quota':
      return monthKey(access.openedAt) === monthKey(now) ? { kind: 'free_quota' } : { kind: 'none', reason: 'quota_month_passed' };
    case 'package': // returned to the package in E11
    case 'open_listing':
      return { kind: 'none', reason: 'nothing_paid' };
  }
}

/**
 * Who gets a refund when a complaint is confirmed now:
 * "wrong data" — the reporter (objective); "does not answer" — every independent reporter once
 * there are enough of them; "outdated" — nobody.
 */
export type RefundPlan = { kind: 'refund'; reporterIds: Id[] } | { kind: 'wait'; weight: number; needed: number } | { kind: 'none' };

export function refundPlan(state: Pick<AppState, 'complaints' | 'companies' | 'contactAccesses'>, complaint: Complaint, now: IsoDate): RefundPlan {
  if (complaint.type === 'outdated') return { kind: 'none' };
  if (complaint.type === 'wrong_contact') return { kind: 'refund', reporterIds: [complaint.reporterId] };
  const asIfConfirmed = {
    ...state,
    complaints: state.complaints.map((c) => (c.id === complaint.id ? { ...c, status: 'confirmed' as const, resolvedAt: now } : c)),
  };
  const ind = independentReporters(asIfConfirmed, complaint.targetId, now);
  return ind.enough ? { kind: 'refund', reporterIds: ind.reporterIds } : { kind: 'wait', weight: ind.weight, needed: C.refundMinIndependentReporters };
}
