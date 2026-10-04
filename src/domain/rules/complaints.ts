// Complaints about listings and their consequences (TZ: "Against outdated data", "Opening a contact").
import { CONFIG } from '../config';
import { addDays, isBefore, monthKey, toMs } from '../time';
import type { AppState, Cents, Complaint, ComplaintType, ContactAccess, Id, IsoDate, Listing } from '../types';
import { findAccess } from './contactAccess';

export type ComplaintEligibility =
  | { ok: true }
  | { ok: false; reason: 'not_company' | 'own_listing' | 'no_access' | 'already_filed' };

/**
 * "Outdated" — any company. "Does not answer or wrong" — only after opening the owner's contact.
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
  if (type === 'no_response' && !findAccess(state, reporterId, listing.ownerId)) return { ok: false, reason: 'no_access' };
  return { ok: true };
}

/** Confirmed complaints about a company within the window, after its last contact confirmation. */
export function confirmedComplaintsInWindow(
  state: Pick<AppState, 'complaints' | 'companies'>,
  companyId: Id,
  now: IsoDate,
): Complaint[] {
  const since = addDays(now, -CONFIG.complaints.windowDays);
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

export function reachesHideThreshold(state: Pick<AppState, 'complaints' | 'companies'>, companyId: Id, now: IsoDate): boolean {
  return confirmedComplaintsInWindow(state, companyId, now).length >= CONFIG.complaints.hideThreshold;
}

/** What a confirmed "does not answer" complaint returns to the reporter (see DECISIONS "Refund"). */
export type Refund =
  | { kind: 'money'; amount: Cents }
  | { kind: 'free_quota' }
  | { kind: 'none'; reason: 'already_refunded' | 'quota_month_passed' | 'nothing_paid' | 'no_access' };

export function refundFor(
  state: Pick<AppState, 'contactAccesses' | 'transactions'>,
  access: ContactAccess | undefined,
  now: IsoDate,
): Refund {
  if (!access) return { kind: 'none', reason: 'no_access' };
  if (access.refundedAt) return { kind: 'none', reason: 'already_refunded' };
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
