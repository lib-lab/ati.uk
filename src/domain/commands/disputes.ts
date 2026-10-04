// "Dispute" (TZ: "Disputes"): any rating event, flag, complaint or claim can be disputed by the
// company it concerns; until the moderator decides, the subject is marked as disputed.
import { logEvent, nextId } from '../events';
import { addNotification } from '../notifications';
import { withRatingEvents } from '../ratingEvents';
import type { AppState, Dispute, DisputeSubject, Id } from '../types';
import { MODERATOR_ID } from '../types';
import type { CommandResult } from './result';

const MAX_TEXT = 1000;

/** The company a subject concerns: only it may dispute. */
export function disputeOwner(state: AppState, type: DisputeSubject, subjectId: Id): Id | undefined {
  switch (type) {
    case 'event': {
      const e = state.events.find((x) => x.id === subjectId);
      return e?.type === 'rating_changed' ? e.subjectIds[0] : undefined;
    }
    case 'flag':
      return state.flags.find((f) => f.id === subjectId && !f.resolvedAt)?.companyId;
    case 'complaint':
      return state.complaints.find((c) => c.id === subjectId && c.status !== 'rejected')?.targetId;
    case 'claim': {
      const c = state.claims.find((x) => x.id === subjectId);
      return c && (c.status === 'open' || c.status === 'confirmed') ? c.targetId : undefined;
    }
  }
}

export function openDisputeFor(state: Pick<AppState, 'disputes'>, type: DisputeSubject, subjectId: Id): Dispute | undefined {
  return state.disputes.find((d) => d.subjectType === type && d.subjectId === subjectId && d.status === 'open');
}

export function canDispute(state: AppState, type: DisputeSubject, subjectId: Id, actorId: Id): boolean {
  return disputeOwner(state, type, subjectId) === actorId && !openDisputeFor(state, type, subjectId);
}

export function openDispute(state: AppState, type: DisputeSubject, subjectId: Id, text: string): CommandResult {
  if (!canDispute(state, type, subjectId, state.actorId)) return { ok: false, error: 'not_allowed' };
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return { ok: false, error: 'invalid_claim' };
  const [s0, id] = nextId(state, 'd');
  const dispute: Dispute = { id, companyId: state.actorId, subjectType: type, subjectId, text: trimmed, status: 'open', createdAt: s0.now };
  return {
    ok: true,
    state: logEvent({ ...s0, disputes: [...s0.disputes, dispute] }, {
      type: 'dispute_opened',
      actor: state.actorId,
      subjectIds: [state.actorId, subjectId, id],
      reasonKey: `event.dispute.opened.${type}`,
      params: { company: state.actorId, subject: subjectId },
    }),
  };
}

/**
 * Accepting a dispute undoes what can be undone: the flag is removed, the complaint and the claim
 * are rejected. A disputed rating event is only marked; its cause is handled with the other tools.
 * Refunds already paid are not taken back.
 */
export function resolveDispute(state: AppState, disputeId: Id, accept: boolean): CommandResult {
  if (state.actorId !== MODERATOR_ID) return { ok: false, error: 'not_allowed' };
  const d = state.disputes.find((x) => x.id === disputeId);
  if (!d || d.status !== 'open') return { ok: false, error: 'not_found' };
  let s: AppState = {
    ...state,
    disputes: state.disputes.map((x) => (x.id === d.id ? { ...x, status: accept ? 'accepted' : 'rejected', resolvedAt: state.now } : x)),
  };
  if (accept) {
    if (d.subjectType === 'flag') {
      s = { ...s, flags: s.flags.map((f) => (f.id === d.subjectId && !f.resolvedAt ? { ...f, resolvedAt: s.now } : f)) };
    }
    if (d.subjectType === 'complaint') {
      s = { ...s, complaints: s.complaints.map((c) => (c.id === d.subjectId ? { ...c, status: 'rejected', resolvedAt: s.now } : c)) };
    }
    if (d.subjectType === 'claim') {
      s = { ...s, claims: s.claims.map((c) => (c.id === d.subjectId ? { ...c, status: 'rejected', resolvedAt: s.now } : c)) };
    }
  }
  s = logEvent(s, {
    type: 'dispute_resolved',
    actor: MODERATOR_ID,
    subjectIds: [d.companyId, d.subjectId, d.id],
    reasonKey: accept ? `event.dispute.accepted.${d.subjectType}` : 'event.dispute.rejected',
    params: { company: d.companyId, subject: d.subjectId },
  });
  s = addNotification(s, d.companyId, 'dispute_resolved', { variant: accept ? 'accepted' : 'rejected', subject: d.subjectId });
  return { ok: true, state: withRatingEvents(state, s, { reasonKey: `event.rating.disputeAccepted.${d.subjectType}`, actor: MODERATOR_ID }) };
}
