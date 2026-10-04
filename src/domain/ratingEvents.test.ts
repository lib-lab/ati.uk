import { describe, expect, it } from 'vitest';
import { company, emptyState, review } from './testing/fixtures';
import { withRatingEvents } from './ratingEvents';

describe('withRatingEvents', () => {
  const before = emptyState({ companies: ['a', 'b', 'c', 'd', 't'].map((id) => company(id)) });

  it('logs nothing when no score changes', () => {
    expect(withRatingEvents(before, before, { reasonKey: 'x' })).toBe(before);
  });

  it('logs before/after, the changed component and the cause', () => {
    const after = { ...before, reviews: [review('a', 't', 1)] };
    const s = withRatingEvents(before, after, { reasonKey: 'event.rating.review', params: { stars: 1, author: 'a' }, actor: 'a' });
    expect(s.events).toHaveLength(1);
    const e = s.events[0]!;
    expect(e).toMatchObject({ type: 'rating_changed', actor: 'a', subjectIds: ['t'], reasonKey: 'event.rating.review' });
    expect(e.rating!.after).toBeLessThan(e.rating!.before);
    const changed = e.rating!.components;
    // The reviews component became available; the others changed weight but not value.
    expect(changed.map((c) => c.key)).toEqual(['reviews']);
    expect(changed[0]!.before).toBeNull();
    // one weak 1★ review pulled towards the neutral prior: below the middle, above 0
    expect(changed[0]!.after).toBeGreaterThan(0);
    expect(changed[0]!.after).toBeLessThan(50);
  });
});
