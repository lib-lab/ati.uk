// Who may leave reviews and claims (TZ: "Rating model", "Protection against manipulation").
import { CONFIG } from '../config';
import { addDays, isBefore } from '../time';
import type { AppState, Claim, Id, IsoDate, Review } from '../types';
import { findAccess } from './contactAccess';

export type ReviewInput = Pick<AppState, 'companies' | 'contactAccesses' | 'reviews'>;

export type Eligibility =
  | { ok: true }
  | { ok: false; reason: 'not_company' | 'self' | 'no_access' }
  | { ok: false; reason: 'too_soon'; nextAt: IsoDate };

/** Last review from author about target, if any (voided ones count too: the pair still used its slot). */
export function lastReview(input: Pick<AppState, 'reviews'>, authorId: Id, targetId: Id): Review | undefined {
  return input.reviews
    .filter((r) => r.authorId === authorId && r.targetId === targetId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/**
 * Review only after opening the target's contact, and at most once per 90 days
 * for the directed pair author → target.
 */
export function canReview(input: ReviewInput, authorId: Id, targetId: Id, now: IsoDate): Eligibility {
  if (!input.companies.some((c) => c.id === authorId)) return { ok: false, reason: 'not_company' };
  if (authorId === targetId) return { ok: false, reason: 'self' };
  if (!findAccess(input, authorId, targetId)) return { ok: false, reason: 'no_access' };
  const last = lastReview(input, authorId, targetId);
  if (last) {
    const nextAt = addDays(last.createdAt, CONFIG.reviews.minDaysBetweenPerPair);
    if (isBefore(now, nextAt)) return { ok: false, reason: 'too_soon', nextAt };
  }
  return { ok: true };
}

/** The reviewed company answers once. */
export function canReply(review: Review, actorId: Id): boolean {
  return review.targetId === actorId && !review.reply;
}

/** Claims need an opened contact too (the parties must have been in touch). */
export function canFileClaim(input: ReviewInput, claimantId: Id, targetId: Id): Eligibility {
  if (!input.companies.some((c) => c.id === claimantId)) return { ok: false, reason: 'not_company' };
  if (claimantId === targetId) return { ok: false, reason: 'self' };
  if (!findAccess(input, claimantId, targetId)) return { ok: false, reason: 'no_access' };
  return { ok: true };
}

/** The claimant (or the moderator) marks an open claim as settled. Rejecting is for the moderator only. */
export function canSettleClaim(claim: Claim, actorId: Id): boolean {
  return claim.status === 'open' && (claim.claimantId === actorId || actorId === 'moderator');
}
