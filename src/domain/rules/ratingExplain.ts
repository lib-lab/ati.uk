// Explains each rating component as lines with points (TZ: "Transparency").
// Mirrors the formulas in rating.ts; a test checks that the points add up to the component values.
import { CONFIG } from '../config';
import { addDays, daysBetween, isBefore, monthsBetween } from '../time';
import type { Id, IsoDate, RatingComponentKey } from '../types';
import { computeRating, weightedAverage, weightedReviews, type RatingInput } from './rating';
import type { ReviewWeight } from './reviewWeight';

const R = CONFIG.rating;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface ExplainLine {
  /** i18n key under "explain.". */
  key: string;
  params: Record<string, string | number>;
  /** Points this line adds to the component value (0..100); null for information only. */
  points: number | null;
}

export interface ComponentExplanation {
  key: RatingComponentKey;
  value: number | null;
  weight: number;
  effectiveWeight: number;
  /** value × effectiveWeight: points this component adds to the score. */
  contribution: number;
  lines: ExplainLine[];
}

export interface RatingExplanation {
  score: number;
  components: ComponentExplanation[];
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function reviewsLines(input: RatingInput, id: Id, now: IsoDate): ExplainLine[] {
  const items = weightedReviews(input, id, now);
  if (items.length === 0) return [{ key: 'explain.reviews.none', params: {}, points: null }];
  const counted = items.filter((x) => x.counted);
  const avg = weightedAverage(items.map((x) => ({ stars: x.review.stars, weight: x.weight?.total ?? 0 })));
  const effective = counted.reduce((sum, x) => sum + x.weight!.total, 0);
  const lines: ExplainLine[] = [
    {
      key: 'explain.reviews.average',
      params: { avg: round1(avg), count: counted.length, effective: round1(effective) },
      points: ((avg - 1) / 4) * 100,
    },
    { key: 'explain.reviews.prior', params: { stars: R.reviews.prior.stars, weight: R.reviews.prior.weight }, points: null },
  ];
  const count = (pred: (w: ReviewWeight) => boolean) => counted.filter((x) => pred(x.weight!)).length;
  const old = count((w) => w.recency < 1);
  const free = count((w) => w.contactCost < 1);
  const newAuthors = count((w) => w.author < 1);
  const group = count((w) => w.independence < 1);
  if (old > 0) lines.push({ key: 'explain.reviews.old', params: { count: old, weight: R.reviews.oldWeight }, points: null });
  if (free > 0) lines.push({ key: 'explain.reviews.freeContact', params: { count: free, weight: R.reviews.contactCost.open_listing }, points: null });
  if (newAuthors > 0) lines.push({ key: 'explain.reviews.authors', params: { count: newAuthors, min: R.reviews.author.minWeight }, points: null });
  if (group > 0) lines.push({ key: 'explain.reviews.closedGroup', params: { count: group, weight: R.reviews.independence.groupWeight }, points: null });
  const voided = items.filter((x) => x.review.voided).length;
  const flaggedAuthors = items.filter((x) => !x.counted && !x.review.voided).length;
  if (flaggedAuthors > 0) lines.push({ key: 'explain.reviews.flaggedAuthors', params: { count: flaggedAuthors }, points: null });
  if (voided > 0) lines.push({ key: 'explain.reviews.voided', params: { count: voided }, points: null });
  return lines;
}

function verificationLines(input: RatingInput, id: Id, now: IsoDate): ExplainLine[] {
  const v = R.verification;
  const company = input.companies.find((c) => c.id === id)!;
  const record = company.verification.record;
  if (!record) return [{ key: 'explain.verification.notFound', params: {}, points: 0 }];
  const years = daysBetween(record.foundedAt, now) / 365;
  const age = clamp01((years - v.ageZeroYears) / (v.ageFullYears - v.ageZeroYears));
  return [
    { key: record.status === 'active' ? 'explain.verification.active' : 'explain.verification.inactive', params: { status: record.status }, points: record.status === 'active' ? v.activeStatus * 100 : 0 },
    { key: 'explain.verification.age', params: { years: round1(years), full: v.ageFullYears }, points: age * v.age * 100 },
    { key: record.reportsFiled ? 'explain.verification.reports' : 'explain.verification.noReports', params: {}, points: record.reportsFiled ? v.reports * 100 : 0 },
    { key: company.verification.matchesProfile ? 'explain.verification.match' : 'explain.verification.mismatch', params: {}, points: company.verification.matchesProfile ? v.profileMatch * 100 : 0 },
  ];
}

function claimsLines(input: RatingInput, id: Id): ExplainLine[] {
  const claims = input.claims.filter((c) => c.targetId === id);
  const open = claims.filter((c) => c.status === 'open').length;
  const penalty = Math.min(100, open * R.claims.penaltyPerOpenClaim);
  const lines: ExplainLine[] = [{ key: 'explain.claims.base', params: {}, points: 100 }];
  if (open > 0) lines.push({ key: 'explain.claims.open', params: { count: open, penalty: R.claims.penaltyPerOpenClaim }, points: -penalty });
  const closed = claims.length - open;
  if (closed > 0) lines.push({ key: 'explain.claims.closed', params: { count: closed }, points: null });
  return lines;
}

function activityLines(input: RatingInput, id: Id, now: IsoDate): ExplainLine[] {
  const a = R.activity;
  const company = input.companies.find((c) => c.id === id)!;
  const days = daysBetween(company.joinedAt, now);
  if (days < a.availableAfterDays) {
    return [{ key: 'explain.activity.tooNew', params: { days: Math.floor(days), min: a.availableAfterDays }, points: null }];
  }
  const months = monthsBetween(company.joinedAt, now);
  const tenure = clamp01(months / a.tenureFullMonths);
  const windowStart = addDays(now, -a.regularityWindowDays);
  const own = input.listings.filter((l) => l.ownerId === id);
  const recent = own.filter((l) => !isBefore(l.createdAt, windowStart) && !isBefore(now, l.createdAt)).length;
  const regularity = clamp01(recent / a.regularityFullCount);
  const removed = own.filter((l) => l.status === 'removed' && l.removalReason);
  const found = removed.filter((l) => l.removalReason === 'found_on_platform').length;
  const useShare = removed.length >= a.foundShareMinRemovals;
  // Without enough removals the other two parts are renormalised.
  const scale = useShare ? 1 : 1 / (a.tenure + a.regularity);
  const lines: ExplainLine[] = [
    { key: 'explain.activity.tenure', params: { months: Math.floor(months), full: a.tenureFullMonths }, points: tenure * a.tenure * scale * 100 },
    { key: 'explain.activity.regularity', params: { count: recent, days: a.regularityWindowDays, full: a.regularityFullCount }, points: regularity * a.regularity * scale * 100 },
  ];
  lines.push(
    useShare
      ? { key: 'explain.activity.found', params: { found, removed: removed.length }, points: (found / removed.length) * a.foundShare * 100 }
      : { key: 'explain.activity.foundUnavailable', params: { removed: removed.length, min: a.foundShareMinRemovals }, points: null },
  );
  return lines;
}

export function explainRating(input: RatingInput, companyId: Id, now: IsoDate): RatingExplanation {
  const rating = computeRating(input, companyId, now);
  const linesFor: Record<RatingComponentKey, () => ExplainLine[]> = {
    reviews: () => reviewsLines(input, companyId, now),
    verification: () => verificationLines(input, companyId, now),
    claims: () => claimsLines(input, companyId),
    activity: () => activityLines(input, companyId, now),
  };
  return {
    score: rating.score,
    components: rating.components.map((c) => ({
      ...c,
      contribution: (c.value ?? 0) * c.effectiveWeight,
      lines: linesFor[c.key](),
    })),
  };
}
