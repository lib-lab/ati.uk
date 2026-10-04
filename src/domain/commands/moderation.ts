// Complaints, refunds, moderation of claims and flags, linked-accounts detector.
import { logEvent, nextId } from '../events';
import { addNotification } from '../notifications';
import { withRatingEvents } from '../ratingEvents';
import { canComplain, reachesHideThreshold, refundFor } from '../rules/complaints';
import { findAccess } from '../rules/contactAccess';
import { detectLinkedAccounts, type Suspicion } from '../rules/detector';
import { activeFlags, FLAG_LEVEL } from '../rules/flags';
import type { AppState, Complaint, ComplaintType, Flag, FlagKind, Id } from '../types';
import { MODERATOR_ID } from '../types';
import { routeLabel } from './listings';
import type { CommandResult } from './result';
import type { TimeProcess } from './time';

const isModerator = (s: AppState) => s.actorId === MODERATOR_ID;

// ---------- Complaints ----------

export function fileComplaint(state: AppState, listingId: Id, type: ComplaintType): CommandResult {
  const listing = state.listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: 'listing_not_found' };
  if (!canComplain(state, state.actorId, listing, type).ok) return { ok: false, error: 'complaint_not_allowed' };
  const [s0, id] = nextId(state, 'cp');
  const complaint: Complaint = {
    id, reporterId: state.actorId, listingId, targetId: listing.ownerId, type, status: 'pending', createdAt: s0.now,
  };
  const s = logEvent({ ...s0, complaints: [...s0.complaints, complaint] }, {
    type: 'complaint_filed',
    actor: state.actorId,
    subjectIds: [state.actorId, listing.ownerId, listingId],
    reasonKey: `event.complaint.filed.${type}`,
    params: { reporter: state.actorId, target: listing.ownerId, listing: listingId, route: routeLabel(listing) },
  });
  return { ok: true, state: s };
}

function resolveComplaint(state: AppState, complaintId: Id, status: 'confirmed' | 'rejected'): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const c = state.complaints.find((x) => x.id === complaintId);
  if (!c) return { ok: false, error: 'not_found' };
  if (c.status !== 'pending') return { ok: false, error: 'not_allowed' };

  let resolved: Complaint = { ...c, status, resolvedAt: state.now };
  let s: AppState = state;

  // Refund for a confirmed "does not answer or wrong" complaint.
  if (status === 'confirmed' && c.type === 'no_response') {
    const access = findAccess(state, c.reporterId, c.targetId);
    const refund = refundFor(state, access, state.now);
    if (access && (refund.kind === 'money' || refund.kind === 'free_quota')) {
      s = { ...s, contactAccesses: s.contactAccesses.map((a) => (a.id === access.id ? { ...a, refundedAt: s.now } : a)) };
      if (refund.kind === 'money') {
        let txId: Id;
        [s, txId] = nextId(s, 't');
        s = { ...s, transactions: [...s.transactions, { id: txId, companyId: c.reporterId, type: 'refund', amount: refund.amount, createdAt: s.now, refId: c.id }] };
        resolved = { ...resolved, refundTransactionId: txId };
      }
      s = logEvent(s, {
        type: 'refund',
        actor: MODERATOR_ID,
        subjectIds: [c.reporterId, c.targetId, c.id],
        reasonKey: refund.kind === 'money' ? 'event.refund.money' : 'event.refund.quota',
        params: refund.kind === 'money' ? { amount: refund.amount, target: c.targetId } : { target: c.targetId },
      });
      s = addNotification(
        s,
        c.reporterId,
        'refund',
        refund.kind === 'money' ? { variant: 'money', amount: refund.amount, target: c.targetId } : { variant: 'quota', target: c.targetId },
      );
    }
  }

  s = { ...s, complaints: s.complaints.map((x) => (x.id === c.id ? resolved : x)) };
  s = logEvent(s, {
    type: 'complaint_resolved',
    actor: MODERATOR_ID,
    subjectIds: [c.reporterId, c.targetId, c.listingId, c.id],
    reasonKey: `event.complaint.${status}`,
    params: { type: c.type, reporter: c.reporterId, target: c.targetId, listing: c.listingId },
  });
  s = addNotification(s, c.reporterId, 'complaint_resolved', { variant: status, target: c.targetId, listing: c.listingId });

  // 3 confirmed complaints in 30 days → listings hidden until the owner confirms contact data.
  const target = s.companies.find((x) => x.id === c.targetId);
  if (status === 'confirmed' && target && !target.listingsHiddenUntilContactConfirmed && reachesHideThreshold(s, c.targetId, s.now)) {
    s = { ...s, companies: s.companies.map((x) => (x.id === c.targetId ? { ...x, listingsHiddenUntilContactConfirmed: true } : x)) };
    s = logEvent(s, {
      type: 'flag_set',
      actor: 'system',
      subjectIds: [c.targetId],
      reasonKey: 'event.listingsHidden',
      params: { target: c.targetId },
    });
    s = addNotification(s, c.targetId, 'listings_hidden', {});
  }
  return { ok: true, state: s };
}

export const confirmComplaint = (state: AppState, id: Id) => resolveComplaint(state, id, 'confirmed');
export const rejectComplaint = (state: AppState, id: Id) => resolveComplaint(state, id, 'rejected');

/** The owner confirms the contact data is up to date: listings visible again, older complaints stop counting. */
export function confirmContactData(state: AppState): CommandResult {
  const company = state.companies.find((c) => c.id === state.actorId);
  if (!company) return { ok: false, error: 'not_allowed' };
  const s = {
    ...state,
    companies: state.companies.map((c) =>
      c.id === company.id ? { ...c, listingsHiddenUntilContactConfirmed: false, contactConfirmedAt: state.now } : c,
    ),
  };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'flag_resolved',
      actor: company.id,
      subjectIds: [company.id],
      reasonKey: 'event.contactConfirmed',
      params: { target: company.id },
    }),
  };
}

// ---------- Claims ----------

export function rejectClaim(state: AppState, claimId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return { ok: false, error: 'not_found' };
  if (claim.status !== 'open') return { ok: false, error: 'not_allowed' };
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

function addFlag(state: AppState, companyId: Id, kind: FlagKind, source: Flag['source'], note?: string): AppState {
  const [s, id] = nextId(state, 'f');
  const flag: Flag = { id, companyId, kind, level: FLAG_LEVEL[kind], source, createdAt: s.now, note };
  return logEvent({ ...s, flags: [...s.flags, flag] }, {
    type: 'flag_set',
    actor: source === 'moderator' ? MODERATOR_ID : 'system',
    subjectIds: [companyId, id],
    reasonKey: `event.flag.set.${kind}`,
    params: { target: companyId, note: note ?? '' },
  });
}

/** Moderator sets "blocked" (red) or "under review" (yellow). Registry flags come from the registry only. */
export function setFlag(state: AppState, companyId: Id, kind: 'fraud_blocked' | 'suspected_linked', note?: string): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  if (!state.companies.some((c) => c.id === companyId)) return { ok: false, error: 'company_not_found' };
  if (activeFlags(state.flags, companyId).some((f) => f.kind === kind)) return { ok: false, error: 'not_allowed' };
  const s = addFlag(state, companyId, kind, 'moderator', note);
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: `event.rating.flag.${kind}`, actor: MODERATOR_ID }) };
}

/** Moderator removes a "blocked" or "under review" flag (e.g. suspicion not confirmed). */
export function resolveFlag(state: AppState, flagId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const flag = state.flags.find((f) => f.id === flagId);
  if (!flag || flag.resolvedAt) return { ok: false, error: 'not_found' };
  if (flag.source === 'registry') return { ok: false, error: 'not_allowed' };
  let s: AppState = { ...state, flags: state.flags.map((f) => (f.id === flagId ? { ...f, resolvedAt: state.now } : f)) };
  s = logEvent(s, {
    type: 'flag_resolved',
    actor: MODERATOR_ID,
    subjectIds: [flag.companyId, flag.id],
    reasonKey: `event.flag.resolved.${flag.kind}`,
    params: { target: flag.companyId },
  });
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: `event.rating.flagResolved.${flag.kind}`, actor: MODERATOR_ID }) };
}

/**
 * Confirmed manipulation: the yellow flag becomes a red "blocked" flag and every review
 * written by this company is voided for good.
 */
export function confirmFraud(state: AppState, flagId: Id): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const flag = state.flags.find((f) => f.id === flagId);
  if (!flag || flag.resolvedAt || flag.kind !== 'suspected_linked') return { ok: false, error: 'not_allowed' };
  let s: AppState = { ...state, flags: state.flags.map((f) => (f.id === flagId ? { ...f, resolvedAt: state.now } : f)) };
  const voided = s.reviews.filter((r) => r.authorId === flag.companyId && !r.voided).length;
  s = { ...s, reviews: s.reviews.map((r) => (r.authorId === flag.companyId ? { ...r, voided: true } : r)) };
  s = addFlag(s, flag.companyId, 'fraud_blocked', 'moderator', `Confirmed manipulation; ${voided} reviews voided`);
  return {
    ok: true,
    state: withRatingEvents(state, s, { reasonKey: 'event.rating.fraudConfirmed', params: { author: flag.companyId, count: voided }, actor: MODERATOR_ID }),
  };
}

// ---------- Detector ----------

/** Yellow flags for new suspicions. Companies the moderator already cleared are not flagged again. */
export function applyDetector(state: AppState, suspicions: Suspicion[] = detectLinkedAccounts(state)): AppState {
  let s = state;
  for (const sus of suspicions) {
    const flags = s.flags.filter((f) => f.companyId === sus.companyId && f.kind === 'suspected_linked');
    if (flags.length > 0) continue; // active, or resolved earlier by the moderator
    if (activeFlags(s.flags, sus.companyId).some((f) => f.kind === 'fraud_blocked')) continue;
    const note = sus.signals.map((x) => (x.withId ? `${x.kind}:${x.withId}` : x.kind)).join(', ');
    s = addFlag(s, sus.companyId, 'suspected_linked', 'detector', note);
  }
  return s;
}

export function runDetector(state: AppState): CommandResult {
  if (!isModerator(state)) return { ok: false, error: 'not_allowed' };
  const after = applyDetector(state);
  return { ok: true, state: withRatingEvents(state, after, { reasonKey: 'event.rating.flag.suspected_linked', actor: MODERATOR_ID }) };
}

/** Daily: the detector runs once per shift that crosses a day boundary. */
export const detectorProcess: TimeProcess = {
  reasonKey: 'event.rating.flag.suspected_linked',
  run(state, from, to) {
    return from.slice(0, 10) === to.slice(0, 10) ? state : applyDetector(state);
  },
};
