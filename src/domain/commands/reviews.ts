// Reviews, replies and claims. Every change that moves a score is logged with its cause.
import { logEvent, nextId } from '../events';
import { withRatingEvents } from '../ratingEvents';
import { canFileClaim, canReply, canReview, canSettleClaim } from '../rules/reviews';
import type { AppState, Claim, Id, Review } from '../types';
import type { CommandResult } from './result';

const MAX_TEXT = 1000;

export function postReview(state: AppState, targetId: Id, stars: Review['stars'], text: string): CommandResult {
  const authorId = state.actorId;
  if (!state.companies.some((c) => c.id === targetId)) return { ok: false, error: 'company_not_found' };
  if (![1, 2, 3, 4, 5].includes(stars) || text.length > MAX_TEXT) return { ok: false, error: 'invalid_review' };
  const eligibility = canReview(state, authorId, targetId, state.now);
  if (!eligibility.ok) return { ok: false, error: eligibility.reason === 'too_soon' ? 'review_too_soon' : 'review_not_allowed' };

  const [s0, id] = nextId(state, 'r');
  const review: Review = { id, authorId, targetId, stars, text: text.trim(), createdAt: s0.now };
  let s: AppState = { ...s0, reviews: [...s0.reviews, review] };
  s = logEvent(s, {
    type: 'review_posted',
    actor: authorId,
    subjectIds: [authorId, targetId, id],
    reasonKey: 'event.review.posted',
    params: { stars, author: authorId, target: targetId },
  });
  s = withRatingEvents(state, s, { reasonKey: 'event.rating.review', params: { stars, author: authorId }, actor: authorId });
  return { ok: true, state: s };
}

export function replyToReview(state: AppState, reviewId: Id, text: string): CommandResult {
  const review = state.reviews.find((r) => r.id === reviewId);
  if (!review) return { ok: false, error: 'not_allowed' };
  if (!canReply(review, state.actorId)) return { ok: false, error: 'not_allowed' };
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return { ok: false, error: 'invalid_review' };
  const s = {
    ...state,
    reviews: state.reviews.map((r) => (r.id === reviewId ? { ...r, reply: { text: trimmed, createdAt: state.now } } : r)),
  };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'review_posted',
      actor: state.actorId,
      subjectIds: [review.targetId, review.authorId, review.id],
      reasonKey: 'event.review.reply',
      params: { author: review.authorId },
    }),
  };
}

export function fileClaim(state: AppState, targetId: Id, text: string): CommandResult {
  const claimantId = state.actorId;
  if (!state.companies.some((c) => c.id === targetId)) return { ok: false, error: 'company_not_found' };
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT) return { ok: false, error: 'invalid_claim' };
  if (!canFileClaim(state, claimantId, targetId).ok) return { ok: false, error: 'claim_not_allowed' };

  const [s0, id] = nextId(state, 'cl');
  const claim: Claim = { id, claimantId, targetId, text: trimmed, status: 'open', createdAt: s0.now };
  let s: AppState = { ...s0, claims: [...s0.claims, claim] };
  s = logEvent(s, {
    type: 'claim_filed',
    actor: claimantId,
    subjectIds: [claimantId, targetId, id],
    reasonKey: 'event.claim.filed',
    params: { claimant: claimantId, target: targetId },
  });
  s = withRatingEvents(state, s, { reasonKey: 'event.rating.claimOpened', params: { claimant: claimantId }, actor: claimantId });
  return { ok: true, state: s };
}

export function settleClaim(state: AppState, claimId: Id): CommandResult {
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) return { ok: false, error: 'not_allowed' };
  if (!canSettleClaim(claim, state.actorId)) return { ok: false, error: 'not_allowed' };
  let s: AppState = {
    ...state,
    claims: state.claims.map((c) => (c.id === claimId ? { ...c, status: 'settled', resolvedAt: state.now } : c)),
  };
  s = logEvent(s, {
    type: 'claim_resolved',
    actor: state.actorId,
    subjectIds: [claim.claimantId, claim.targetId, claim.id],
    reasonKey: 'event.claim.settled',
    params: { claimant: claim.claimantId, target: claim.targetId },
  });
  s = withRatingEvents(state, s, { reasonKey: 'event.rating.claimSettled', params: { claimant: claim.claimantId }, actor: state.actorId });
  return { ok: true, state: s };
}
