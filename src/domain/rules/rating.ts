// Rating model (TZ: "Rating model"). Pure functions of state + current date.
// Score 0..100 from weighted components; flags are reported separately and never enter the score.
import { CONFIG } from '../config';
import { daysBetween, monthsBetween, addDays, isBefore } from '../time';
import type {
  AppState,
  Company,
  Id,
  IsoDate,
  Rating,
  RatingComponent,
  RatingComponentKey,
  Review,
} from '../types';
import { activeFlags } from './flags';
import { recencyWeight, reviewWeight } from './reviewWeight';

export type RatingInput = Pick<AppState, 'companies' | 'reviews' | 'claims' | 'flags' | 'listings' | 'contactAccesses'>;

const R = CONFIG.rating;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export { recencyWeight };

/** Reviews that count: not voided, and the author is not under a "suspected linked" (yellow) flag. */
export function countedReviews(input: RatingInput, targetId: Id): Review[] {
  return input.reviews.filter(
    (r) =>
      r.targetId === targetId &&
      !r.voided &&
      !activeFlags(input.flags, r.authorId).some((f) => f.kind === 'suspected_linked'),
  );
}

/**
 * Weighted average of stars with a neutral prior (see DECISIONS "Review weight"):
 * low-weight reviews move the average less, even when they are the only ones.
 */
export function weightedAverage(items: { stars: number; weight: number }[]): number {
  const p = R.reviews.prior;
  let sum = p.stars * p.weight;
  let weights = p.weight;
  for (const x of items) {
    sum += x.stars * x.weight;
    weights += x.weight;
  }
  return sum / weights;
}

/**
 * Weight of each review about the target. Excluded reviews (voided, or the author is under review)
 * weigh 0 but still exist: the component stays available and falls back to the neutral prior,
 * so a flag never improves the target's score (see DECISIONS "Review weight").
 */
export function weightedReviews(input: RatingInput, targetId: Id, now: IsoDate) {
  const counted = new Set(countedReviews(input, targetId).map((r) => r.id));
  return input.reviews
    .filter((r) => r.targetId === targetId)
    .map((r) => ({ review: r, counted: counted.has(r.id), weight: counted.has(r.id) ? reviewWeight(input, r, now) : null }));
}

/** Reviews component, 0..100, or null when the company has no reviews at all. */
export function reviewsComponent(input: RatingInput, targetId: Id, now: IsoDate): number | null {
  const items = weightedReviews(input, targetId, now);
  if (items.length === 0) return null;
  const avg = weightedAverage(items.map((x) => ({ stars: x.review.stars, weight: x.weight?.total ?? 0 })));
  return ((avg - 1) / 4) * 100;
}

export function verificationComponent(company: Company, now: IsoDate): number {
  const v = R.verification;
  const record = company.verification.record;
  if (!record) return 0;
  const years = daysBetween(record.foundedAt, now) / 365;
  const age = clamp01((years - v.ageZeroYears) / (v.ageFullYears - v.ageZeroYears));
  const value =
    (record.status === 'active' ? v.activeStatus : 0) +
    age * v.age +
    (record.reportsFiled ? v.reports : 0) +
    (company.verification.matchesProfile ? v.profileMatch : 0);
  return value * 100;
}

export function claimsComponent(input: RatingInput, companyId: Id): number {
  const open = input.claims.filter((c) => c.targetId === companyId && c.status === 'open').length;
  return Math.max(0, 100 - open * R.claims.penaltyPerOpenClaim);
}

/** Activity and tenure; null during the first days on the platform. */
export function activityComponent(input: RatingInput, company: Company, now: IsoDate): number | null {
  const a = R.activity;
  if (daysBetween(company.joinedAt, now) < a.availableAfterDays) return null;
  const tenure = clamp01(monthsBetween(company.joinedAt, now) / a.tenureFullMonths);
  const windowStart = addDays(now, -a.regularityWindowDays);
  const own = input.listings.filter((l) => l.ownerId === company.id);
  const recent = own.filter((l) => !isBefore(l.createdAt, windowStart) && !isBefore(now, l.createdAt)).length;
  const regularity = clamp01(recent / a.regularityFullCount);
  const removed = own.filter((l) => l.status === 'removed' && l.removalReason);
  if (removed.length >= a.foundShareMinRemovals) {
    const found = removed.filter((l) => l.removalReason === 'found_on_platform').length / removed.length;
    return (tenure * a.tenure + regularity * a.regularity + found * a.foundShare) * 100;
  }
  return ((tenure * a.tenure + regularity * a.regularity) / (a.tenure + a.regularity)) * 100;
}

export function computeRating(input: RatingInput, companyId: Id, now: IsoDate): Rating {
  const company = input.companies.find((c) => c.id === companyId);
  if (!company) throw new Error(`Unknown company: ${companyId}`);

  const values: Record<RatingComponentKey, number | null> = {
    reviews: reviewsComponent(input, companyId, now),
    verification: verificationComponent(company, now),
    claims: claimsComponent(input, companyId),
    activity: activityComponent(input, company, now),
  };

  const keys = Object.keys(R.weights) as RatingComponentKey[];
  const availableWeight = keys.reduce((s, k) => s + (values[k] === null ? 0 : R.weights[k]), 0);
  const components: RatingComponent[] = keys.map((key) => {
    const value = values[key];
    return {
      key,
      value,
      weight: R.weights[key],
      effectiveWeight: value === null || availableWeight === 0 ? 0 : R.weights[key] / availableWeight,
    };
  });
  const score = Math.round(components.reduce((s, c) => s + (c.value ?? 0) * c.effectiveWeight, 0));

  const flags = activeFlags(input.flags, companyId);
  const counted = countedReviews(input, companyId).length;
  return {
    score,
    components,
    countedReviews: counted,
    isNewMember: counted < R.newMemberReviewThreshold,
    redFlags: flags.filter((f) => f.level === 'red'),
    yellowFlags: flags.filter((f) => f.level === 'yellow'),
  };
}

/** The single mark shown next to the score: a red flag, else a yellow flag, else "verified" or "not verified". */
export type PrimaryMark =
  | { kind: 'flag'; flag: Rating['redFlags'][number] }
  | { kind: 'verified' }
  | { kind: 'not_verified' };

export function primaryMark(rating: Rating, company: Company): PrimaryMark {
  const flag = rating.redFlags[0] ?? rating.yellowFlags[0];
  if (flag) return { kind: 'flag', flag };
  const record = company.verification.record;
  return record && record.status === 'active' && company.verification.matchesProfile
    ? { kind: 'verified' }
    : { kind: 'not_verified' };
}
