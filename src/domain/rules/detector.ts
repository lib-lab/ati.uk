// Linked-accounts detector (TZ: "Protection against manipulation"): behavioural signals
// that give a yellow flag and a manual review by the moderator.
import { CONFIG } from '../config';
import { daysBetween } from '../time';
import type { AppState, Id, Review } from '../types';

/**
 * Partners who worked together often review each other honestly, so a mutual review alone is not
 * suspicious. Reciprocal top marks written within a few days of each other are (see DECISIONS).
 */
export function isReciprocalPraise(a: Review, b: Review): boolean {
  const d = CONFIG.detector;
  return a.stars >= d.praiseStars && b.stars >= d.praiseStars && Math.abs(daysBetween(a.createdAt, b.createdAt)) <= d.mutualWithinDays;
}

export type SignalKind = 'shared_device' | 'mutual_reviews' | 'reviews_without_listings';

export interface Signal {
  kind: SignalKind;
  /** The other company for pair signals. */
  withId?: Id;
}

export interface Suspicion {
  companyId: Id;
  signals: Signal[];
}

export function detectLinkedAccounts(state: Pick<AppState, 'companies' | 'reviews' | 'listings'>): Suspicion[] {
  const result: Suspicion[] = [];
  for (const c of state.companies) {
    const signals: Signal[] = [];
    for (const other of state.companies) {
      if (other.id !== c.id && other.deviceId === c.deviceId) signals.push({ kind: 'shared_device', withId: other.id });
    }
    const written = state.reviews.filter((r) => r.authorId === c.id && !r.voided);
    for (const r of written) {
      const back = state.reviews.some((x) => x.authorId === r.targetId && x.targetId === c.id && !x.voided && isReciprocalPraise(r, x));
      if (back && !signals.some((s) => s.kind === 'mutual_reviews' && s.withId === r.targetId)) {
        signals.push({ kind: 'mutual_reviews', withId: r.targetId });
      }
    }
    if (written.length > 0 && !state.listings.some((l) => l.ownerId === c.id)) signals.push({ kind: 'reviews_without_listings' });
    if (signals.length > 0) result.push({ companyId: c.id, signals });
  }
  return result;
}
