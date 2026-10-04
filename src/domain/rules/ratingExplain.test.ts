import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { computeRating } from './rating';
import { explainRating } from './ratingExplain';

const seed = buildSeedState();

describe('explainRating', () => {
  it.each(seed.companies.map((c) => c.id))('points add up to component values and contributions to the score (%s)', (id) => {
    const rating = computeRating(seed, id, seed.now);
    const ex = explainRating(seed, id, seed.now);
    for (const c of ex.components) {
      const points = c.lines.reduce((s, l) => s + (l.points ?? 0), 0);
      const value = rating.components.find((x) => x.key === c.key)!.value;
      if (value === null) {
        expect(c.lines.every((l) => l.points === null)).toBe(true);
      } else {
        expect(points).toBeCloseTo(value, 6);
      }
    }
    const total = ex.components.reduce((s, c) => s + c.contribution, 0);
    expect(Math.round(total)).toBe(ex.score);
  });

  it('explains each claim with its weight (Danube Haulage: 2 recent open claims)', () => {
    const claims = explainRating(seed, 'c09', seed.now).components.find((c) => c.key === 'claims')!;
    const open = claims.lines.filter((l) => l.key === 'explain.claims.open');
    expect(open).toHaveLength(2);
    for (const l of open) {
      expect(l.points!).toBeLessThan(0);
      expect(l.points!).toBeGreaterThanOrEqual(-25);
    }
    expect(claims.value!).toBeLessThan(100);
  });

  it('an unconfirmed claim older than 30 days is listed as no longer counting (Fast Profit Freight)', () => {
    const claims = explainRating(seed, 'c18', seed.now).components.find((c) => c.key === 'claims')!;
    expect(claims.lines.map((l) => l.key)).toContain('explain.claims.expired');
  });

  it('newcomer: reviews and activity unavailable, weights 60/40', () => {
    const ex = explainRating(seed, 'c06', seed.now);
    const by = Object.fromEntries(ex.components.map((c) => [c.key, c]));
    expect(by.reviews!.value).toBeNull();
    expect(by.activity!.value).toBeNull();
    expect(Math.round(by.verification!.effectiveWeight * 100)).toBe(60);
    expect(Math.round(by.claims!.effectiveWeight * 100)).toBe(40);
    expect(by.activity!.lines[0]!.key).toBe('explain.activity.tooNew');
  });

  it('a shared device: the mutual review counts with reduced weight, no flag', () => {
    const reviews = explainRating(seed, 'c13', seed.now).components.find((c) => c.key === 'reviews')!;
    expect(reviews.lines.map((l) => l.key)).toContain('explain.reviews.sharedDevice');
    expect(reviews.lines.map((l) => l.key)).not.toContain('explain.reviews.flaggedAuthors');
  });
});
