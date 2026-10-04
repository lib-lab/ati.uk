import { describe, expect, it } from 'vitest';
import { computeRating } from '../rules/rating';
import { canReview } from '../rules/reviews';
import { company, emptyState, NOW, review } from '../testing/fixtures';
import { addDays } from '../time';
import type { AppState, ContactAccess } from '../types';
import { fileClaim, postReview, replyToReview, settleClaim } from './reviews';

const access = (viewerId: string, ownerId: string): ContactAccess => ({
  id: `a-${viewerId}-${ownerId}`, viewerId, ownerId, firstListingId: '', openedAt: addDays(NOW, -5), paidWith: 'balance',
});

const base = (): AppState =>
  emptyState({
    companies: ['a', 'b', 't'].map((id) => company(id)),
    contactAccesses: [access('a', 't')],
    actorId: 'a',
  });

const ok = (r: ReturnType<typeof postReview>) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};

describe('canReview', () => {
  it('needs an opened contact of the target, and not oneself', () => {
    const s = base();
    expect(canReview(s, 'a', 't', NOW)).toEqual({ ok: true });
    expect(canReview(s, 'b', 't', NOW)).toEqual({ ok: false, reason: 'no_access' });
    expect(canReview(s, 'a', 'a', NOW)).toEqual({ ok: false, reason: 'self' });
    expect(canReview(s, 'moderator', 't', NOW)).toEqual({ ok: false, reason: 'not_company' });
  });

  it('access is directional: the target cannot review the viewer back without its own access', () => {
    expect(canReview(base(), 't', 'a', NOW)).toEqual({ ok: false, reason: 'no_access' });
  });

  it('allows one review per directed pair per 90 days', () => {
    const s = { ...base(), reviews: [review('a', 't', 5, 30)] };
    const res = canReview(s, 'a', 't', NOW);
    expect(res).toEqual({ ok: false, reason: 'too_soon', nextAt: addDays(addDays(NOW, -30), 90) });
    expect(canReview(s, 'a', 't', addDays(NOW, 60))).toEqual({ ok: true });
  });
});

describe('postReview', () => {
  it('adds the review, logs it and the rating change with the cause', () => {
    const s = ok(postReview(base(), 't', 1, 'Late'));
    expect(s.reviews).toHaveLength(1);
    expect(s.events.find((e) => e.type === 'review_posted')).toMatchObject({ params: { stars: 1, author: 'a', target: 't' } });
    const rating = s.events.find((e) => e.type === 'rating_changed' && e.subjectIds[0] === 't');
    expect(rating).toMatchObject({ reasonKey: 'event.rating.review', params: { stars: 1, author: 'a' } });
    expect(rating!.rating!.after).toBeLessThan(rating!.rating!.before);
  });

  it('refuses without access, twice within 90 days, or with invalid stars', () => {
    expect(postReview({ ...base(), actorId: 'b' }, 't', 5, '')).toEqual({ ok: false, error: 'review_not_allowed' });
    const s = ok(postReview(base(), 't', 5, ''));
    expect(postReview(s, 't', 4, '')).toEqual({ ok: false, error: 'review_too_soon' });
    expect(postReview(base(), 't', 6 as 5, '')).toEqual({ ok: false, error: 'invalid_review' });
  });
});

describe('replyToReview', () => {
  it('only the reviewed company, only once', () => {
    let s = ok(postReview(base(), 't', 3, 'ok'));
    const id = s.reviews[0]!.id;
    expect(replyToReview(s, id, 'Thanks')).toEqual({ ok: false, error: 'not_allowed' }); // actor is the author
    s = ok(replyToReview({ ...s, actorId: 't' }, id, 'Thanks'));
    expect(s.reviews[0]!.reply).toEqual({ text: 'Thanks', createdAt: NOW });
    expect(replyToReview(s, id, 'Again')).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('claims', () => {
  it('an open claim lowers the score; settling restores it', () => {
    const before = computeRating(base(), 't', NOW).score;
    let s = ok(fileClaim(base(), 't', 'Unpaid invoice'));
    const claim = s.claims[0]!;
    expect(claim).toMatchObject({ claimantId: 'a', targetId: 't', status: 'open' });
    expect(computeRating(s, 't', NOW).score).toBeLessThan(before);
    expect(s.events.find((e) => e.type === 'rating_changed')).toMatchObject({ reasonKey: 'event.rating.claimOpened' });

    expect(settleClaim({ ...s, actorId: 't' }, claim.id)).toEqual({ ok: false, error: 'not_allowed' }); // target cannot settle
    s = ok(settleClaim(s, claim.id));
    expect(s.claims[0]).toMatchObject({ status: 'settled', resolvedAt: NOW });
    expect(computeRating(s, 't', NOW).score).toBe(before);
    expect(s.events.at(-1)).toMatchObject({ type: 'rating_changed', reasonKey: 'event.rating.claimSettled' });
    expect(settleClaim(s, claim.id)).toEqual({ ok: false, error: 'not_allowed' }); // already settled
  });

  it('needs an opened contact and a text; the moderator may settle', () => {
    expect(fileClaim({ ...base(), actorId: 'b' }, 't', 'x')).toEqual({ ok: false, error: 'claim_not_allowed' });
    expect(fileClaim(base(), 't', '  ')).toEqual({ ok: false, error: 'invalid_claim' });
    const s = ok(fileClaim(base(), 't', 'x'));
    expect(settleClaim({ ...s, actorId: 'moderator' }, s.claims[0]!.id).ok).toBe(true);
  });
});
