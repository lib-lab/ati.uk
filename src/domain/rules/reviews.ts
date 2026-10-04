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

/** True when one of the two companies opened the other's contact (either direction). */
export function areContactParties(input: Pick<AppState, 'contactAccesses'>, a: Id, b: Id): boolean {
  return !!findAccess(input, a, b) || !!findAccess(input, b, a);
}

/**
 * Both sides of a contact may review each other (the one who opened it and the one whose contact
 * was opened), at most once per 90 days per directed pair author → target.
 */
export function canReview(input: ReviewInput, authorId: Id, targetId: Id, now: IsoDate): Eligibility {
  if (!input.companies.some((c) => c.id === authorId)) return { ok: false, reason: 'not_company' };
  if (authorId === targetId) return { ok: false, reason: 'self' };
  if (!areContactParties(input, authorId, targetId)) return { ok: false, reason: 'no_access' };
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

/** Only a side of a contact may file a claim (TZ). */
export function canFileClaim(input: ReviewInput, claimantId: Id, targetId: Id): Eligibility {
  if (!input.companies.some((c) => c.id === claimantId)) return { ok: false, reason: 'not_company' };
  if (claimantId === targetId) return { ok: false, reason: 'self' };
  if (!areContactParties(input, claimantId, targetId)) return { ok: false, reason: 'no_access' };
  return { ok: true };
}

const isLive = (claim: Claim) => claim.status === 'open' || claim.status === 'confirmed';

/** The claimant (or the moderator) marks a claim as settled. Rejecting is for the moderator only. */
export function canSettleClaim(claim: Claim, actorId: Id): boolean {
  return isLive(claim) && (claim.claimantId === actorId || actorId === 'moderator');
}

/** The accused company answers once. */
export function canReplyToClaim(claim: Claim, actorId: Id): boolean {
  return claim.targetId === actorId && !claim.reply;
}
