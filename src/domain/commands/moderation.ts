// Complaints, refunds, moderation of claims and flags, closed-ring detector, data mismatch escalation.
import { CONFIG } from '../config';
import { logEvent, nextId } from '../events';
import { addNotification } from '../notifications';
import { withRatingEvents } from '../ratingEvents';
import { canComplain, complaintShare, refundFor, refundPlan } from '../rules/complaints';
import { findAccess } from '../rules/contactAccess';
import { detectSuspicions, type Suspicion } from '../rules/detector';
import { activeFlags, FLAG_LEVEL } from '../rules/flags';
import { addDays, isBefore } from '../time';
import type { AppState, Complaint, ComplaintType, Flag, FlagKind, Id } from '../types';
import { MODERATOR_ID } from '../types';
import { routeLabel } from './listings';
import type { CommandResult } from './result';
import type { TimeProcess } from './time';

const isModerator = (s: AppState) => s.actorId === MODERATOR_ID;
const MAX_TEXT = 1000;

// ---------- Complaints ----------

export function fileComplaint(state: AppState, listingId: Id, type: ComplaintType): CommandResult {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: 'listing_not_found' };
  if (!canComplain(state, state.actorId, listing, type).ok) return { ok: false, error: 'complaint_not_allowed' };
  const [s0, id] = nextId(state, 'cp');
  const complaint: Complaint = {
    id, reporterId: state.actorId, listingId, targetId: listing.ownerId, type, status: 'pending', createdAt: s0.now,
  };
  let s = logEvent({ ...s0, complaints: [...s0.complaints, complaint] }, {
    type: 'complaint_filed',
    actor: state.actorId,
    subjectIds: [state.actorId, listing.ownerId, listingId, id],
    reasonKey: `event.complaint.filed.${type}`,
    params: { reporter: state.actorId, target: listing.ownerId, listing: listingId, route: routeLabel(listing) },
  });
  // The company learns about the complaint and can answer before the decision (TZ).
  s = addNotification(s, listing.ownerId, 'complaint_received', { variant: type, listing: listingId, route: routeLabel(listing) });
  return { ok: true, state: s };
}

/** The company answers a complaint about its listing once, before the moderator decides. */
export function respondToComplaint(state: AppState, complaintId: Id, text: string): CommandResult {
  const c = state.complaints.find((x) => x.id === complaintId);
  if (!c) return { ok: false, error: 'not_found' };
  if (c.targetId !== state.actorId || c.status !== 'pending' || c.response) return { ok: false, error: 'not_allowed' };
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return { ok: false, error: 'invalid_claim' };
  const s = { ...state, complaints: state.complaints.map((x) => (x.id === c.id ? { ...x, response: { text: trimmed, createdAt: state.now } } : x)) };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'complaint_filed',
      actor: state.actorId,
      subjectIds: [c.targetId, c.reporterId, c.listingId, c.id],
      reasonKey: 'event.complaint.response',
      params: { target: c.targetId, reporter: c.reporterId, listing: c.listingId },
    }),
  };
}

/**
 * Refunds a company's contact with the target (money or free quota), within the per-account limit;
 * logs and notifies. `cause` selects the texts: a confirmed complaint or a listing edited after opening.
 */
export function refundContact(state: AppState, reporterId: Id, targetId: Id, refId: Id, cause: 'complaint' | 'edit' = 'complaint'): AppState {
  const access = findAccess(state, reporterId, targetId);
  const refund = refundFor(state, access, state.now);
  if (refund.kind === 'none') {
    if (refund.reason !== 'limit_reached') return state;
    return logEvent(state, {
      type: 'refund',
      actor: cause === 'complaint' ? MODERATOR_ID : reporterId,
      subjectIds: [reporterId, targetId, refId],
      reasonKey: 'event.refund.limit',
      params: { target: targetId, limit: CONFIG.complaints.refundLimitPerWindow, days: CONFIG.complaints.windowDays },
    });
  }
  let s: AppState = { ...state, contactAccesses: state.contactAccesses.map((a) => (a.id === access!.id ? { ...a, refundedAt: state.now } : a)) };
  if (refund.kind === 'money') {
    let txId: Id;
    [s, txId] = nextId(s, 't');
    s = { ...s, transactions: [...s.transactions, { id: txId, companyId: reporterId, type: 'refund', amount: refund.amount, createdAt: s.now, refId }] };
    if (cause === 'complaint') {
      s = { ...s, complaints: s.complaints.map((c) => (c.reporterId === reporterId && c.targetId === targetId && c.status === 'confirmed' && !c.refundTransactionId ? { ...c, refundTransactionId: txId } : c)) };
    }
  }
  const suffix = cause === 'edit' ? 'Edit' : '';
  s = logEvent(s, {
    type: 'refund',
    actor: cause === 'complaint' ? MODERATOR_ID : reporterId,
    subjectIds: [reporterId, targetId, refId],
    reasonKey: refund.kind === 'money' ? `event.refund.money${suffix}` : `event.refund.quota${suffix}`,
    params: refund.kind === 'money' ? { amount: refund.amount, target: targetId } : { target: targetId },
  });
  return addNotification(
    s,
    reporterId,
    'refund',
    refund.kind === 'money' ? { variant: `money${suffix}`, amount: refund.amount, target: targetId } : { variant: `quota${suffix}`, target: targetId },
  );
}

function resolveComplaint(state: AppState, complaintId: Id, status: 'confirmed' | 'rejected'): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const c = state.complaints.find((x) => x.id === complaintId);
  if (!c) return { ok: false, error: 'not_found' };
  if (c.status !== 'pending') return { ok: false, error: 'not_allowed' };

  const plan = status === 'confirmed' ? refundPlan(state, c, state.now) : { kind: 'none' as const };
  let s: AppState = { ...state, complaints: state.complaints.map((x) => (x.id === c.id ? { ...c, status, resolvedAt: state.now } : x)) };
  s = logEvent(s, {
    type: 'complaint_resolved',
    actor: MODERATOR_ID,
    subjectIds: [c.reporterId, c.targetId, c.listingId, c.id],
    reasonKey: `event.complaint.${status}`,
    params: { type: c.type, reporter: c.reporterId, target: c.targetId, listing: c.listingId },
  });
  s = addNotification(s, c.reporterId, 'complaint_resolved', { variant: status, target: c.targetId, listing: c.listingId });

  if (plan.kind === 'refund') for (const reporterId of plan.reporterIds) s = refundContact(s, reporterId, c.targetId, c.id);

  // Share of confirmed complaints from opened contacts above the threshold → listings hidden
  // until the owner confirms the contact data (TZ).
  const target = s.companies.find((x) => x.id === c.targetId);
  if (status === 'confirmed' && target && !target.listingsHiddenUntilContactConfirmed && complaintShare(s, c.targetId, s.now).hides) {
    const share = complaintShare(s, c.targetId, s.now);
    s = { ...s, companies: s.companies.map((x) => (x.id === c.targetId ? { ...x, listingsHiddenUntilContactConfirmed: true } : x)) };
    s = logEvent(s, {
      type: 'flag_set',
      actor: 'system',
      subjectIds: [c.targetId],
      reasonKey: 'event.listingsHidden',
      params: { target: c.targetId, count: share.count, contacts: share.contacts, share: Math.round(share.share * 100) },
    });
    s = addNotification(s, c.targetId, 'listings_hidden', {});
  }
  return { ok: true, state: s };
}

export const confirmComplaint = (state: AppState, id: Id) => resolveComplaint(state, id, 'confirmed');
export const rejectComplaint = (state: AppState, id: Id) => resolveComplaint(state, id, 'rejected');

/**
 * The owner confirms the contact data is up to date: listings visible again, older complaints stop
 * counting. An inactive (hidden) company returns the same way, without a new registry check (TZ).
 */
export function confirmContactData(state: AppState): CommandResult {
  const company = state.companies.find((c) => c.id === state.actorId);
  if (!company) return { ok: false, error: 'not_allowed' };
  const wasHidden = company.status === 'deactivated';
  let s: AppState = {
    ...state,
    companies: state.companies.map((c) =>
      c.id === company.id
        ? { ...c, listingsHiddenUntilContactConfirmed: false, contactConfirmedAt: state.now, status: 'active', inactivityWarnedAt: undefined, lastLoginAt: state.now }
        : c,
    ),
  };
  s = logEvent(s, {
    type: wasHidden ? 'company_reactivated' : 'flag_resolved',
    actor: company.id,
    subjectIds: [company.id],
    reasonKey: wasHidden ? 'event.company.reactivated' : 'event.contactConfirmed',
    params: { target: company.id },
  });
  return { ok: true, state: s };
}

// ---------- Claims ----------

/** The moderator confirms a claim: it keeps counting after 30 days, until settled or rejected. */
export function confirmClaim(state: AppState, claimId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return { ok: false, error: 'not_found' };
  if (claim.status !== 'open') return { ok: false, error: 'not_allowed' };
  let s: AppState = { ...state, claims: state.claims.map((c) => (c.id === claimId ? { ...c, status: 'confirmed', confirmedAt: state.now } : c)) };
  s = logEvent(s, {
    type: 'claim_resolved',
    actor: MODERATOR_ID,
    subjectIds: [claim.claimantId, claim.targetId, claim.id],
    reasonKey: 'event.claim.confirmed',
    params: { claimant: claim.claimantId, target: claim.targetId },
  });
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: 'event.rating.claimConfirmed', params: { claimant: claim.claimantId }, actor: MODERATOR_ID }) };
}

export function rejectClaim(state: AppState, claimId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return { ok: false, error: 'not_found' };
  if (claim.status !== 'open' && claim.status !== 'confirmed') return { ok: false, error: 'not_allowed' };
  let s: AppState = {
    ...state,
    claims: state.claims.map((c) => (c.id === claimId ? { ...c, status: 'rejected', resolvedAt: state.now } : c)),
  };
  s = logEvent(s, {
    type: 'claim_resolved',
    actor: MODERATOR_ID,
    subjectIds: [claim.claimantId, claim.targetId, claim.id],
    reasonKey: 'event.claim.rejected',
    params: { claimant: claim.claimantId, target: claim.targetId },
  });
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: 'event.rating.claimRejected', params: { claimant: claim.claimantId }, actor: MODERATOR_ID }) };
}

// ---------- Flags ----------

export function addFlag(
  state: AppState,
  companyId: Id,
  kind: FlagKind,
  source: Flag['source'],
  extra: Pick<Flag, 'note' | 'relatedIds' | 'dueAt'> = {},
): AppState {
  const [s, id] = nextId(state, 'f');
  const flag: Flag = { id, companyId, kind, level: FLAG_LEVEL[kind], source, createdAt: s.now, ...extra };
  let out = logEvent({ ...s, flags: [...s.flags, flag] }, {
    type: 'flag_set',
    actor: source === 'moderator' ? MODERATOR_ID : 'system',
    subjectIds: [companyId, id],
    reasonKey: `event.flag.set.${kind}`,
    params: { target: companyId, note: extra.note ?? '' },
  });
  out = addNotification(out, companyId, 'flag_set', { variant: kind });
  return out;
}

/** Moderator sets "blocked" (red) or "under review" (yellow). Registry flags come from the registry only. */
export function setFlag(state: AppState, companyId: Id, kind: 'fraud_blocked' | 'suspected_linked', note?: string): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  if (!state.companies.some((c) => c.id === companyId)) return { ok: false, error: 'company_not_found' };
  if (activeFlags(state.flags, companyId).some((f) => f.kind === kind)) return { ok: false, error: 'not_allowed' };
  const s = addFlag(state, companyId, kind, 'moderator', { note });
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: `event.rating.flag.${kind}`, actor: MODERATOR_ID }) };
}

export function closeFlag(state: AppState, flag: Flag, actor: Id, reasonKey: string): AppState {
  const s: AppState = { ...state, flags: state.flags.map((f) => (f.id === flag.id ? { ...f, resolvedAt: state.now } : f)) };
  return logEvent(s, { type: 'flag_resolved', actor, subjectIds: [flag.companyId, flag.id], reasonKey, params: { target: flag.companyId } });
}

/** Moderator removes a "blocked" or "under review" flag (e.g. suspicion not confirmed). */
export function resolveFlag(state: AppState, flagId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const flag = state.flags.find((f) => f.id === flagId);
  if (!flag || flag.resolvedAt) return { ok: false, error: 'not_found' };
  if (flag.source === 'registry') return { ok: false, error: 'not_allowed' };
  const s = closeFlag(state, flag, MODERATOR_ID, `event.flag.resolved.${flag.kind}`);
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: `event.rating.flagResolved.${flag.kind}`, actor: MODERATOR_ID }) };
}

/**
 * Confirmed manipulation: the yellow ring flag becomes a red "blocked" flag and the company's reviews
 * of the other ring members are voided for good (all its reviews if the flag has no ring).
 */
export function confirmFraud(state: AppState, flagId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const flag = state.flags.find((f) => f.id === flagId);
  if (!flag || flag.resolvedAt || flag.kind !== 'suspected_linked') return { ok: false, error: 'not_allowed' };
  let s: AppState = { ...state, flags: state.flags.map((f) => (f.id === flagId ? { ...f, resolvedAt: state.now } : f)) };
  const inScope = (targetId: Id) => !flag.relatedIds || flag.relatedIds.includes(targetId);
  const voided = s.reviews.filter((r) => r.authorId === flag.companyId && !r.voided && inScope(r.targetId)).length;
  s = { ...s, reviews: s.reviews.map((r) => (r.authorId === flag.companyId && inScope(r.targetId) ? { ...r, voided: true } : r)) };
  s = addFlag(s, flag.companyId, 'fraud_blocked', 'moderator', { note: `Confirmed manipulation; ${voided} reviews voided` });
  return {
    ok: true,
    state: withRatingEvents(state, s, { reasonKey: 'event.rating.fraudConfirmed', params: { author: flag.companyId, count: voided }, actor: MODERATOR_ID }),
  };
}

/** The company fixes its profile to match the registry; the "clarify your data" flag is closed. */
export function fixProfileData(state: AppState): CommandResult {
  const company = state.companies.find((c) => c.id === state.actorId);
  const record = company?.verification.record;
  if (!company || !record) return { ok: false, error: 'not_allowed' };
  let s: AppState = {
    ...state,
    companies: state.companies.map((c) =>
      c.id === company.id ? { ...c, legalName: record.legalName, verification: { ...c.verification, matchesProfile: true, checkedAt: state.now } } : c,
    ),
  };
  s = logEvent(s, {
    type: 'profile_updated',
    actor: company.id,
    subjectIds: [company.id],
    reasonKey: 'event.profile.fixed',
    params: { target: company.id, name: record.legalName },
  });
  for (const f of activeFlags(s.flags, company.id).filter((x) => x.kind === 'data_mismatch')) {
    s = closeFlag(s, f, company.id, 'event.flag.resolved.data_mismatch');
  }
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: 'event.rating.profileFixed', actor: company.id }) };
}

// ---------- Detector ----------

/** Yellow flags for closed rings. Companies the moderator already cleared are not flagged again. */
export function applyDetector(state: AppState, suspicions: Suspicion[] = detectSuspicions(state)): AppState {
  let s = state;
  for (const sus of suspicions) {
    if (s.flags.some((f) => f.companyId === sus.companyId && f.kind === 'suspected_linked')) continue; // active, or cleared
    if (activeFlags(s.flags, sus.companyId).some((f) => f.kind === 'fraud_blocked')) continue;
    s = addFlag(s, sus.companyId, 'suspected_linked', 'detector', { note: `closed ring: ${sus.ringWith.join(', ')}`, relatedIds: sus.ringWith });
  }
  return s;
}

export function runDetector(state: AppState): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const after = applyDetector(state);
  return { ok: true, state: withRatingEvents(state, after, { reasonKey: 'event.rating.flag.suspected_linked', actor: MODERATOR_ID }) };
}

const crossesDay = (from: string, to: string) => from.slice(0, 10) !== to.slice(0, 10);

/** Daily: the detector runs once per shift that crosses a day boundary. */
export const detectorProcess: TimeProcess = {
  reasonKey: 'event.rating.flag.suspected_linked',
  run: (state, from, to) => (crossesDay(from, to) ? applyDetector(state) : state),
};

/** "Clarify your data" (yellow) becomes "Data not confirmed" (red) after the grace period (TZ). */
export const dataMismatchProcess: TimeProcess = {
  reasonKey: 'event.flag.escalated',
  run(state, _from, to) {
    let s = state;
    for (const f of state.flags) {
      if (f.kind !== 'data_mismatch' || f.resolvedAt || f.level !== 'yellow') continue;
      const due = f.dueAt ?? addDays(f.createdAt, CONFIG.dataMismatchGraceDays);
      if (isBefore(to, due)) continue;
      s = { ...s, flags: s.flags.map((x) => (x.id === f.id ? { ...x, level: 'red', escalatedAt: to } : x)) };
      s = logEvent(s, {
        type: 'flag_set',
        actor: 'system',
        subjectIds: [f.companyId, f.id],
        reasonKey: 'event.flag.escalated',
        params: { target: f.companyId, days: CONFIG.dataMismatchGraceDays },
      });
      s = addNotification(s, f.companyId, 'flag_escalated', { variant: 'data_mismatch' });
    }
    return s;
  },
};
