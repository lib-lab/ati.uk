// Turns rating differences between two states into rating_changed events with a reason.
// Commands call this at the end, passing the state before the change and the cause.
import { logEvent } from './events';
import { computeRating } from './rules/rating';
import type { AppState, ComponentChange, Id, Rating } from './types';

export interface RatingCause {
  reasonKey: string;
  params?: Record<string, string | number>;
  actor?: Id;
}

const EPSILON = 0.05;

function contribution(r: Rating, key: ComponentChange['key']): number {
  const c = r.components.find((x) => x.key === key)!;
  return (c.value ?? 0) * c.effectiveWeight;
}

/** Component-level differences between two ratings of the same company. */
export function diffRating(before: Rating, after: Rating): ComponentChange[] {
  return after.components
    .map((a) => {
      const b = before.components.find((x) => x.key === a.key)!;
      return {
        key: a.key,
        before: b.value,
        after: a.value,
        contributionDelta: contribution(after, a.key) - contribution(before, a.key),
      };
    })
    .filter(
      (c) =>
        (c.before === null) !== (c.after === null) ||
        (c.before !== null && c.after !== null && Math.abs(c.after - c.before) >= EPSILON),
    );
}

/**
 * Appends one rating_changed event per company whose score changed between `before` and `after`.
 * Ratings are computed at each state's own `now`.
 */
export function withRatingEvents(before: AppState, after: AppState, cause: RatingCause): AppState {
  let s = after;
  for (const company of after.companies) {
    if (!before.companies.some((c) => c.id === company.id)) continue;
    const rb = computeRating(before, company.id, before.now);
    const ra = computeRating(after, company.id, after.now);
    if (rb.score === ra.score) continue;
    s = logEvent(s, {
      type: 'rating_changed',
      actor: cause.actor ?? 'system',
      subjectIds: [company.id],
      reasonKey: cause.reasonKey,
      params: cause.params ?? {},
      rating: { before: rb.score, after: ra.score, components: diffRating(rb, ra) },
    });
  }
  return s;
}
