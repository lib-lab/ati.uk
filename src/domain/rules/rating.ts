// Rating model (TZ: "Rating model"). Pure functions of state + current date.
// Score 0..100 from weighted components; flags are reported separately and never enter the score.
import { CONFIG } from '../config';
import { daysBetween, monthsBetween, addDays, isBefore } from '../time';
import type {
  AppState,
  Claim,
  Company,
  Id,
  IsoDate,
  Rating,
  RatingComponent,
  RatingComponentKey,
  Review,
} from '../types';
import { activeFlags } from './flags';
import { interactionWeight, recencyWeight, reviewWeight } from './reviewWeight';

export type RatingInput = Pick<AppState, 'companies' | 'reviews' | 'claims' | 'flags' | 'listings' | 'contactAccesses'>;

const R = CONFIG.rating;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export { recencyWeight };

/** A ring flag on the author excludes the author's reviews of the other ring members (TZ: "reviews inside the ring"). */
function excludedByRingFlag(input: Pick<AppState, 'flags'>, review: Review): boolean {
  return activeFlags(input.flags, review.authorId).some(
    (f) => f.kind === 'suspected_linked' && (!f.relatedIds || f.relatedIds.includes(review.targetId)),
  );
}

/** Reviews that count: not voided and not inside a flagged ring. */
export function countedReviews(input: Pick<AppState, 'reviews' | 'flags'>, targetId: Id): Review[] {
  return input.reviews.filter((r) => r.targetId === targetId && !r.voided && !excludedByRingFlag(input, r));
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

/**
 * Official check: the company is real and active, and the profile matches the registry.
 * Checks the registry does not provide are left out; age and reports are shown but not scored.
 * Not found in the registry → 0.
 */
export function verificationComponent(company: Company): number {
  const v = R.verification.shares;
  const record = company.verification.record;
  if (!record) return 0;
  let sum = v.profileMatch * (company.verification.matchesProfile ? 1 : 0);
  let shares = v.profileMatch;
  if (record.status !== undefined) {
    sum += v.activeStatus * (record.status === 'active' ? 1 : 0);
    shares += v.activeStatus;
  }
  return (sum / shares) * 100;
}

/** Claims that affect the score now: confirmed ones, and open ones younger than 30 days. */
export function activeClaims(input: Pick<AppState, 'claims'>, companyId: Id, now: IsoDate): Claim[] {
  const expiry = addDays(now, -R.claims.unconfirmedExpiryDays);
  return input.claims.filter(
    (c) => c.targetId === companyId && (c.status === 'confirmed' || (c.status === 'open' && !isBefore(c.createdAt, expiry))),
  );
}

/** 100 minus 25 points per claim, each claim weighted like a review (contact cost × author × independence). */
export function claimsComponent(input: RatingInput, companyId: Id, now: IsoDate): number {
  const penalty = activeClaims(input, companyId, now).reduce(
    (sum, c) => sum + R.claims.penaltyPerClaim * interactionWeight(input, c.claimantId, c.targetId, now),
    0,
  );
  return Math.max(0, 100 - penalty);
}

/** Counterparties of a contact with the company who later left a counted review about it. */
export function reviewedContacts(input: RatingInput, companyId: Id): Id[] {
  const counted = countedReviews(input, companyId);
  const out = new Set<Id>();
  for (const a of input.contactAccesses) {
    const other = a.viewerId === companyId ? a.ownerId : a.ownerId === companyId ? a.viewerId : null;
    if (!other) continue;
    if (counted.some((r) => r.authorId === other && !isBefore(r.createdAt, a.openedAt))) out.add(other);
  }
  return [...out];
}

/** Tenure and contacts that later received reviews; null during the first days on the platform. */
export function activityComponent(input: RatingInput, company: Company, now: IsoDate): number | null {
  const a = R.activity;
  if (daysBetween(company.joinedAt, now) < a.availableAfterDays) return null;
  const tenure = clamp01(monthsBetween(company.joinedAt, now) / a.tenureFullMonths);
  const reviewed = clamp01(reviewedContacts(input, company.id).length / a.reviewedContactsFull);
  return (a.tenureShare * tenure + (1 - a.tenureShare) * reviewed) * 100;
}

export function computeRating(input: RatingInput, companyId: Id, now: IsoDate): Rating {
  const company = input.companies.find((c) => c.id === companyId);
  if (!company) throw new Error(`Unknown company: ${companyId}`);

  const values: Record<RatingComponentKey, number | null> = {
    reviews: reviewsComponent(input, companyId, now),
    verification: verificationComponent(company),
    claims: claimsComponent(input, companyId, now),
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
  return record && (record.status === undefined || record.status === 'active') && company.verification.matchesProfile
    ? { kind: 'verified' }
    : { kind: 'not_verified' };
}
