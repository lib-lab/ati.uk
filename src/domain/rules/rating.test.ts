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
  const withRecord = (patch: Partial<NonNullable<ReturnType<typeof company>['verification']['record']>>, matches = true) => {
    const c = company('a');
    return { ...c, verification: { ...c.verification, matchesProfile: matches, record: { ...c.verification.record!, ...patch } } };
  };

  it('is 100 for an active company whose profile matches the registry', () => {
    expect(verificationComponent(company('a'))).toBe(100);
  });

  it('age and reports do not affect the score', () => {
    expect(verificationComponent(withRecord({ foundedAt: addDays(NOW, -100), reportsFiled: false }))).toBe(100);
  });

  it('liquidated or mismatching loses the corresponding half', () => {
    expect(verificationComponent(withRecord({ status: 'liquidated' }))).toBe(50);
    expect(verificationComponent(withRecord({}, false))).toBe(50);
  });

  it('a check the registry does not provide does not lower the score', () => {
    expect(verificationComponent(withRecord({ status: undefined }))).toBe(100);
    expect(verificationComponent(withRecord({ status: undefined }, false))).toBe(0);
  });

  it('is 0 when the registry did not find the company', () => {
    const c = company('a');
    expect(verificationComponent({ ...c, verification: { ...c.verification, record: null, matchesProfile: false } })).toBe(0);
  });
});

describe('claims component', () => {
  /** Claimant "x" with full weight: paid contact of the target, tenure, activity, outside contacts. */
  const base = (claims: Claim[]) => {
    const s = trusted(['x']);
    return { ...s, claims };
  };

  it('a confirmed or a recent open claim of full weight costs 25; settled and rejected do not count', () => {
    expect(claimsComponent(base([claim('t', 'open')]), 't', NOW)).toBeCloseTo(75, 6);
    expect(claimsComponent(base([claim('t', 'confirmed')]), 't', NOW)).toBeCloseTo(75, 6);
    expect(claimsComponent(base([claim('t', 'settled'), claim('t', 'rejected')]), 't', NOW)).toBe(100);
  });

  it('an unconfirmed claim stops counting after 30 days; a confirmed one keeps counting', () => {
    const old = (status: Claim['status']) => ({ ...claim('t', status), createdAt: addDays(NOW, -31) });
    expect(claimsComponent(base([old('open')]), 't', NOW)).toBe(100);
    expect(claimsComponent(base([old('confirmed')]), 't', NOW)).toBeCloseTo(75, 6);
  });

  it('a claim weighs like a review: a newcomer with a free contact costs less', () => {
    const s = emptyState({
      companies: [company('x', { joinedAt: NOW }), company('t')],
      contactAccesses: [{ id: 'a', viewerId: 'x', ownerId: 't', firstListingId: '', openedAt: NOW, paidWith: 'open_listing' }],
      claims: [claim('t', 'open')],
    });
    const value = claimsComponent(s, 't', NOW);
    expect(value).toBeGreaterThan(75);
    expect(value).toBeLessThan(100);
  });

  it('never goes below 0', () => {
    expect(claimsComponent(base(Array.from({ length: 6 }, () => claim('t', 'confirmed'))), 't', NOW)).toBe(0);
  });
});

describe('activity component', () => {
  it('is unavailable in the first 30 days', () => {
    expect(activityComponent(emptyState(), company('n', { joinedAt: addDays(NOW, -10) }), NOW)).toBeNull();
  });

  it('tenure plus contacts that later received reviews; listings do not count', () => {
    const c = company('a', { joinedAt: addDays(NOW, -365 * 3) }); // tenure capped at 1
    const s = emptyState({
      companies: [c, ...['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => company(id))],
      listings: Array.from({ length: 30 }, (_, i) => cargo(`l${i}`, 'a')),
      contactAccesses: ['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => ({ id: `a-${p}`, viewerId: p, ownerId: 'a', firstListingId: '', openedAt: addDays(NOW, -20), paidWith: 'balance' as const })),
      reviews: [review('p1', 'a', 5), review('p2', 'a', 2), { ...review('p3', 'a', 4), createdAt: addDays(NOW, -40) }],
    });
    // reviewed contacts: p1, p2 (p3 reviewed before the contact) → 2 of 10 → 0.5×1 + 0.5×0.2 = 0.6
    expect(activityComponent(s, c, NOW)).toBeCloseTo(60, 5);
    expect(activityComponent({ ...s, listings: [] }, c, NOW)).toBeCloseTo(60, 5);
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

  it('companies sharing a device keep their reviews (no flag), with reduced weight', () => {
    const r = computeRating(s, 'c13', s.now);
    expect(r.countedReviews).toBe(1);
    expect(r.yellowFlags).toHaveLength(0);
  });
});
