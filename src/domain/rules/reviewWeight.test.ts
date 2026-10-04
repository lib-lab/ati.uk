import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { CONFIG } from '../config';
import { company, cargo, emptyState, NOW, review } from '../testing/fixtures';
import { addDays } from '../time';
import type { ContactAccess } from '../types';
import { computeRating, reviewsComponent, weightedAverage } from './rating';
import { authorWeight, contactCostWeight, independenceWeight, isInClosedGroup, reviewGroup, reviewWeight } from './reviewWeight';

const W = CONFIG.rating.reviews;
const access = (viewerId: string, ownerId: string, paidWith: ContactAccess['paidWith'] = 'balance', extra: Partial<ContactAccess> = {}): ContactAccess => ({
  id: `a-${viewerId}-${ownerId}`, viewerId, ownerId, firstListingId: '', openedAt: addDays(NOW, -20), paidWith, ...extra,
});

describe('contact cost', () => {
  it('full after a paid (or quota/package) contact, reduced after an open listing or a refund', () => {
    const r = review('a', 't', 5);
    expect(contactCostWeight({ contactAccesses: [access('a', 't', 'balance')] }, r)).toBe(1);
    expect(contactCostWeight({ contactAccesses: [access('a', 't', 'free_quota')] }, r)).toBe(W.contactCost.free_quota);
    expect(contactCostWeight({ contactAccesses: [access('a', 't', 'open_listing')] }, r)).toBe(W.contactCost.open_listing);
    expect(contactCostWeight({ contactAccesses: [access('a', 't', 'balance', { refundedAt: NOW })] }, r)).toBe(W.contactCost.refunded);
  });
});

describe('author weight', () => {
  it('a brand-new company without listings gets the minimum; it grows with tenure and activity', () => {
    const fresh = company('a', { joinedAt: NOW });
    const base = emptyState({ companies: [fresh] });
    expect(authorWeight(base, 'a', NOW)).toBeCloseTo(W.author.minWeight, 6);
    const later = addDays(NOW, 400); // > 12 months
    const active = { ...base, listings: Array.from({ length: W.author.fullActivity }, (_, i) => cargo(`l${i}`, 'a')) };
    expect(authorWeight(base, 'a', later)).toBeCloseTo(W.author.minWeight + (1 - W.author.minWeight) * W.author.tenureShare, 6);
    expect(authorWeight(active, 'a', later)).toBeCloseTo(1, 6);
  });
});

describe('independence', () => {
  const ring = ['r1', 'r2', 'r3'];
  const ringState = () =>
    emptyState({
      companies: [...ring, 'p', 'q', 'x', 'y'].map((id) => company(id)),
      reviews: ring.flatMap((a) => ring.filter((b) => b !== a).map((b) => review(a, b, 5))),
      contactAccesses: ring.flatMap((a) => ring.filter((b) => b !== a).map((b) => access(a, b))),
    });

  it('reviews inside a small closed group weigh less', () => {
    const s = ringState();
    const g = reviewGroup(s, 'r1', 'r2');
    expect(g.members.sort()).toEqual(ring);
    expect(g.closedShare).toBe(1);
    expect(independenceWeight(s, s.reviews[0]!)).toBe(W.independence.groupWeight);
  });

  it('honest partners who review each other and work with others keep full weight', () => {
    const s = emptyState({
      companies: ['p', 'q', 'x', 'y', 'z'].map((id) => company(id)),
      reviews: [review('p', 'q', 5, 3), review('q', 'p', 5, 2)],
      contactAccesses: [access('p', 'q'), access('q', 'p'), access('p', 'x'), access('p', 'y'), access('z', 'q'), access('x', 'q')],
    });
    expect(isInClosedGroup(s, s.reviews[0]!)).toBe(false);
    expect(independenceWeight(s, s.reviews[0]!)).toBe(1);
  });

  it('seed: no review outside the ring and the QuickRate pair is treated as a closed group', () => {
    const seed = buildSeedState();
    const suspicious = new Set(['c13', 'c14', 'c19', 'c20', 'c21']);
    for (const r of seed.reviews) {
      if (suspicious.has(r.authorId)) continue;
      expect(isInClosedGroup(seed, r)).toBe(false);
    }
    expect(seed.reviews.filter((r) => ['c19', 'c20', 'c21'].includes(r.authorId)).every((r) => isInClosedGroup(seed, r))).toBe(true);
  });
});

describe('review weight in the score', () => {
  it('the neutral prior keeps few low-weight reviews away from the top', () => {
    expect(weightedAverage([])).toBe(W.prior.stars);
    const strong = weightedAverage([{ stars: 5, weight: 1 }, { stars: 5, weight: 1 }]);
    const weak = weightedAverage([{ stars: 5, weight: 0.1 }, { stars: 5, weight: 0.1 }]);
    expect(strong).toBeGreaterThan(weak);
    expect(weak).toBeLessThan(3.5);
  });

  it('ring members score much lower on reviews than an established company with the same stars', () => {
    const seed = buildSeedState();
    const ringReviews = reviewsComponent(seed, 'c19', seed.now)!;
    expect(ringReviews).toBeLessThan(65);
    const w = reviewWeight(seed, seed.reviews.find((r) => r.targetId === 'c19')!, seed.now);
    expect(w.independence).toBe(W.independence.groupWeight);
    expect(w.author).toBeLessThan(1);
    expect(computeRating(seed, 'c19', seed.now).isNewMember).toBe(true);
  });

  it('a yellow flag never raises the score of the companies its authors reviewed', () => {
    const seed = buildSeedState();
    const before = computeRating(seed, 'c19', seed.now).score;
    const flagged = {
      ...seed,
      flags: [...seed.flags, ...['c19', 'c20', 'c21'].map((id) => ({
        id: `y-${id}`, companyId: id, kind: 'suspected_linked' as const, level: 'yellow' as const, source: 'detector' as const, createdAt: seed.now,
      }))],
    };
    const after = computeRating(flagged, 'c19', seed.now);
    expect(after.countedReviews).toBe(0);
    expect(after.components.find((c) => c.key === 'reviews')!.value).toBe(50);
    expect(after.score).toBeLessThanOrEqual(before);
  });
});
