import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { addDays } from '../time';
import { cargo, company, emptyState, NOW, review } from '../testing/fixtures';
import type { Claim, Flag } from '../types';
import {
  activityComponent,
  claimsComponent,
  computeRating,
  primaryMark,
  reviewsComponent,
  verificationComponent,
} from './rating';

const flag = (companyId: string, kind: Flag['kind'], level: Flag['level']): Flag => ({
  id: `f-${companyId}-${kind}`, companyId, kind, level, source: 'moderator', createdAt: NOW,
});
const claim = (targetId: string, status: Claim['status']): Claim => ({
  id: `cl-${targetId}-${status}-${Math.random()}`, claimantId: 'x', targetId, text: '', status, createdAt: NOW,
});

/**
 * Authors with full weight: 20+ months on the platform, 20 listings, paid contact of the target,
 * and contacts with outside companies (so they are not a closed group).
 */
function trusted(authors: string[], target = 't') {
  const outside = ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7'];
  return emptyState({
    companies: [...authors, target, ...outside].map((id) => company(id)),
    listings: authors.flatMap((a) => Array.from({ length: 20 }, (_, i) => cargo(`${a}-l${i}`, a))),
    contactAccesses: authors.flatMap((a) => [
      { id: `${a}-t`, viewerId: a, ownerId: target, firstListingId: '', openedAt: NOW, paidWith: 'balance' as const },
      ...outside.map((o) => ({ id: `${a}-${o}`, viewerId: a, ownerId: o, firstListingId: '', openedAt: NOW, paidWith: 'balance' as const })),
    ]),
  });
}

describe('reviews component', () => {
  it('maps the weighted average (with the neutral 3★ prior) to 0..100', () => {
    const s = trusted(['a', 'b']);
    s.reviews = [review('a', 't', 5), review('b', 't', 3)];
    // (5 + 3 + 3×1) / 3 = 3.667 → 66.67
    expect(reviewsComponent(s, 't', NOW)).toBeCloseTo(66.67, 1);
  });

  it('is unavailable without counted reviews', () => {
    expect(reviewsComponent(emptyState({ companies: [company('t')] }), 't', NOW)).toBeNull();
  });

  it('gives reviews older than 12 months half the weight', () => {
    const s = trusted(['a', 'b']);
    s.reviews = [review('a', 't', 5, 10), review('b', 't', 1, 400)];
    // (5×1 + 1×0.5 + 3×1) / 2.5 = 3.4 → 60
    expect(reviewsComponent(s, 't', NOW)).toBeCloseTo(60, 5);
  });

  it('gives reviews from authors with a yellow flag and voided reviews weight 0', () => {
    const s = emptyState({
      companies: [company('a'), company('b'), company('t')],
      reviews: [review('a', 't', 1), { ...review('b', 't', 1), voided: true }],
      flags: [flag('a', 'suspected_linked', 'yellow')],
    });
    // weight 0: the component stays available at the neutral prior (50), never "no data"
    expect(reviewsComponent(s, 't', NOW)).toBe(50);
    expect(computeRating(s, 't', NOW).countedReviews).toBe(0);
  });
});

describe('verification component', () => {
  it('is 100 for an old, active, reporting, matching company', () => {
    expect(verificationComponent(company('a'), NOW)).toBe(100);
  });

  it('scales age linearly between 1 and 5 years', () => {
    const c = company('a');
    const young = { ...c, verification: { ...c.verification, record: { ...c.verification.record!, foundedAt: addDays(NOW, -365 * 3) } } };
    // 40 + 25*0.5 + 15 + 20
    expect(verificationComponent(young, NOW)).toBeCloseTo(87.5, 5);
  });

  it('drops status and match for a liquidated, mismatching company', () => {
    const c = company('a');
    const bad = {
      ...c,
      verification: { ...c.verification, matchesProfile: false, record: { ...c.verification.record!, status: 'liquidated' as const } },
    };
    expect(verificationComponent(bad, NOW)).toBe(40);
  });

  it('is 0 when the registry did not find the company', () => {
    const c = company('a');
    expect(verificationComponent({ ...c, verification: { ...c.verification, record: null, matchesProfile: false } }, NOW)).toBe(0);
  });
});

describe('claims component', () => {
  it('only open claims lower the value', () => {
    const s = emptyState({ claims: [claim('t', 'open'), claim('t', 'settled'), claim('t', 'rejected'), claim('other', 'open')] });
    expect(claimsComponent(s, 't')).toBe(75);
  });
  it('never goes below 0', () => {
    const s = emptyState({ claims: Array.from({ length: 6 }, () => claim('t', 'open')) });
    expect(claimsComponent(s, 't')).toBe(0);
  });
});

describe('activity component', () => {
  it('is unavailable in the first 30 days', () => {
    expect(activityComponent(emptyState(), company('n', { joinedAt: addDays(NOW, -10) }), NOW)).toBeNull();
  });

  it('uses tenure, regularity and found-on-platform share', () => {
    const c = company('a', { joinedAt: addDays(NOW, -365 * 3) }); // tenure capped at 1
    const removed = (id: string, reason: 'found_on_platform' | 'not_relevant') =>
      cargo(id, 'a', { status: 'removed', removalReason: reason, createdAt: addDays(NOW, -200) });
    const listings = [
      ...Array.from({ length: 5 }, (_, i) => cargo(`r${i}`, 'a', { createdAt: addDays(NOW, -i - 1) })), // 5 recent → 0.5
      removed('x1', 'found_on_platform'), removed('x2', 'found_on_platform'), removed('x3', 'not_relevant'), removed('x4', 'not_relevant'),
    ];
    // 1*0.5 + 0.5*0.3 + 0.5*0.2 = 0.75
    expect(activityComponent(emptyState({ listings }), c, NOW)).toBeCloseTo(75, 5);
  });

  it('renormalises without enough removals', () => {
    const c = company('a', { joinedAt: addDays(NOW, -365 * 3) });
    // tenure 1, regularity 0 → 0.5 / 0.8
    expect(activityComponent(emptyState(), c, NOW)).toBeCloseTo(62.5, 5);
  });
});

describe('computeRating', () => {
  it('renormalises weights over available components (cold start)', () => {
    const newbie = company('n', { joinedAt: addDays(NOW, -5) });
    const r = computeRating(emptyState({ companies: [newbie] }), 'n', NOW);
    const byKey = Object.fromEntries(r.components.map((c) => [c.key, c]));
    expect(byKey.reviews!.value).toBeNull();
    expect(byKey.activity!.value).toBeNull();
    expect(byKey.verification!.effectiveWeight).toBeCloseTo(30 / 50, 5);
    expect(byKey.claims!.effectiveWeight).toBeCloseTo(20 / 50, 5);
    expect(r.score).toBe(100);
    expect(r.isNewMember).toBe(true);
  });

  it('marks companies with fewer than 3 counted reviews as new members', () => {
    const s = emptyState({
      companies: [company('a'), company('b'), company('c'), company('t')],
      reviews: [review('a', 't', 5), review('b', 't', 5)],
    });
    expect(computeRating(s, 't', NOW).isNewMember).toBe(true);
    s.reviews.push(review('c', 't', 5));
    expect(computeRating(s, 't', NOW).isNewMember).toBe(false);
  });

  it('keeps flags out of the score', () => {
    const base = emptyState({ companies: [company('t')] });
    const flagged = { ...base, flags: [flag('t', 'fraud_blocked', 'red')] };
    expect(computeRating(flagged, 't', NOW).score).toBe(computeRating(base, 't', NOW).score);
    expect(computeRating(flagged, 't', NOW).redFlags).toHaveLength(1);
  });

  it('primary mark: red flag beats yellow, otherwise verified', () => {
    const c = company('t');
    const s = emptyState({ companies: [c], flags: [flag('t', 'suspected_linked', 'yellow'), flag('t', 'liquidated', 'red')] });
    const mark = primaryMark(computeRating(s, 't', NOW), c);
    expect(mark.kind === 'flag' && mark.flag.kind).toBe('liquidated');
    expect(primaryMark(computeRating(emptyState({ companies: [c] }), 't', NOW), c)).toEqual({ kind: 'verified' });
  });
});

describe('seed archetypes rate as expected', () => {
  const s = buildSeedState();
  const score = (id: string) => computeRating(s, id, s.now).score;

  it('reliable companies score higher than ones with open claims or mixed reviews', () => {
    expect(score('c01')).toBeGreaterThan(score('c09'));
    expect(score('c01')).toBeGreaterThan(score('c10'));
  });

  it('newcomers are new members and have no reviews component', () => {
    const r = computeRating(s, 'c06', s.now);
    expect(r.isNewMember).toBe(true);
    expect(r.components.find((c) => c.key === 'reviews')!.value).toBeNull();
  });

  it('linked accounts do not count each other’s reviews', () => {
    expect(computeRating(s, 'c13', s.now).countedReviews).toBe(0);
  });
});
