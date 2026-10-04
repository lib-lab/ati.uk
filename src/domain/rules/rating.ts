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

export type RatingInput = Pick<AppState, 'companies' | 'reviews' | 'claims' | 'flags' | 'listings'>;

const R = CONFIG.rating;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Reviews that count: not voided, and the author is not under a "suspected linked" (yellow) flag. */
export function countedReviews(input: RatingInput, targetId: Id): Review[] {
  return input.reviews.filter(
    (r) =>
      r.targetId === targetId &&
      !r.voided &&
      !activeFlags(input.flags, r.authorId).some((f) => f.kind === 'suspected_linked'),
  );
}

export function recencyWeight(review: Pick<Review, 'createdAt'>, now: IsoDate): number {
  const months = monthsBetween(review.createdAt, now);
  return months > R.reviews.oldAfterMonths ? R.reviews.oldWeight : 1;
}

/**
 * Reviews component, 0..100, or null without counted reviews.
 * withAuthorWeight=false is used to get an author's own score without recursion.
 */
export function reviewsComponent(input: RatingInput, targetId: Id, now: IsoDate, withAuthorWeight = true): number | null {
  const reviews = countedReviews(input, targetId);
  if (reviews.length === 0) return null;
  let sum = 0;
  let weights = 0;
  for (const r of reviews) {
    let w = recencyWeight(r, now);
    if (withAuthorWeight) w *= authorWeight(input, r.authorId, now);
    sum += r.stars * w;
    weights += w;
  }
  const avg = sum / weights;
  return ((avg - 1) / 4) * 100;
}

/** Authors with a high score weigh more. Their score is computed without author weights (no recursion). */
export function authorWeight(input: RatingInput, authorId: Id, now: IsoDate): number {
  const score = computeRating(input, authorId, now, { withAuthorWeight: false }).score;
  return score >= R.reviews.highRatedAuthorScore ? R.reviews.highRatedAuthorWeight : 1;
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

export interface RatingOptions {
  withAuthorWeight?: boolean;
}

export function computeRating(input: RatingInput, companyId: Id, now: IsoDate, options: RatingOptions = {}): Rating {
  const company = input.companies.find((c) => c.id === companyId);
  if (!company) throw new Error(`Unknown company: ${companyId}`);
  const withAuthorWeight = options.withAuthorWeight ?? true;

  const values: Record<RatingComponentKey, number | null> = {
    reviews: reviewsComponent(input, companyId, now, withAuthorWeight),
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
