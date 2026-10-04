// Explains each rating component as lines with points (TZ: "Transparency").
// Mirrors the formulas in rating.ts; a test checks that the points add up to the component values.
import { CONFIG } from '../config';
import { daysBetween, monthsBetween } from '../time';
import type { Id, IsoDate, RatingComponentKey } from '../types';
import { activeClaims, computeRating, reviewedContacts, weightedAverage, weightedReviews, type RatingInput } from './rating';
import { interactionWeight, type ReviewWeight } from './reviewWeight';

const R = CONFIG.rating;

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
  const device = count((w) => w.sharedDevice < 1);
  if (old > 0) lines.push({ key: 'explain.reviews.old', params: { count: old, weight: R.reviews.oldWeight }, points: null });
  if (free > 0) lines.push({ key: 'explain.reviews.freeContact', params: { count: free, weight: R.reviews.contactCost.open_listing }, points: null });
  if (newAuthors > 0) lines.push({ key: 'explain.reviews.authors', params: { count: newAuthors, min: R.reviews.author.minWeight }, points: null });
  if (group > 0) lines.push({ key: 'explain.reviews.closedGroup', params: { count: group, weight: R.reviews.independence.groupWeight }, points: null });
  if (device > 0) lines.push({ key: 'explain.reviews.sharedDevice', params: { count: device, weight: R.reviews.independence.sharedDeviceMutualWeight }, points: null });
  const voided = items.filter((x) => x.review.voided).length;
  const flaggedAuthors = items.filter((x) => !x.counted && !x.review.voided).length;
  if (flaggedAuthors > 0) lines.push({ key: 'explain.reviews.flaggedAuthors', params: { count: flaggedAuthors }, points: null });
  if (voided > 0) lines.push({ key: 'explain.reviews.voided', params: { count: voided }, points: null });
  return lines;
}

function verificationLines(input: RatingInput, id: Id, now: IsoDate): ExplainLine[] {
  const v = R.verification.shares;
  const company = input.companies.find((c) => c.id === id)!;
  const record = company.verification.record;
  if (!record) return [{ key: 'explain.verification.notFound', params: {}, points: 0 }];
  const statusAvailable = record.status !== undefined;
  const shares = v.profileMatch + (statusAvailable ? v.activeStatus : 0);
  const lines: ExplainLine[] = [];
  if (statusAvailable) {
    lines.push({
      key: record.status === 'active' ? 'explain.verification.active' : 'explain.verification.inactive',
      params: { status: record.status ?? '' },
      points: record.status === 'active' ? (v.activeStatus / shares) * 100 : 0,
    });
  } else {
    lines.push({ key: 'explain.verification.statusUnavailable', params: {}, points: null });
  }
  lines.push({
    key: company.verification.matchesProfile ? 'explain.verification.match' : 'explain.verification.mismatch',
    params: {},
    points: company.verification.matchesProfile ? (v.profileMatch / shares) * 100 : 0,
  });
  const years = Math.round((daysBetween(record.foundedAt, now) / 365) * 10) / 10;
  lines.push({ key: 'explain.verification.notScored', params: { years, reports: record.reportsFiled ? 'yes' : 'no' }, points: null });
  return lines;
}

function claimsLines(input: RatingInput, id: Id, now: IsoDate): ExplainLine[] {
  const all = input.claims.filter((c) => c.targetId === id);
  const active = activeClaims(input, id, now);
  const lines: ExplainLine[] = [{ key: 'explain.claims.base', params: {}, points: 100 }];
  let total = 0;
  for (const c of active) {
    const w = interactionWeight(input, c.claimantId, c.targetId, now);
    const penalty = Math.min(100 - total, R.claims.penaltyPerClaim * w);
    total += penalty;
    lines.push({
      key: c.status === 'confirmed' ? 'explain.claims.confirmed' : 'explain.claims.open',
      params: { claimant: c.claimantId, weight: round1(w), days: R.claims.unconfirmedExpiryDays },
      points: -penalty,
    });
  }
  const expired = all.filter((c) => c.status === 'open' && !active.includes(c)).length;
  if (expired > 0) lines.push({ key: 'explain.claims.expired', params: { count: expired, days: R.claims.unconfirmedExpiryDays }, points: null });
  const closed = all.filter((c) => c.status === 'settled' || c.status === 'rejected').length;
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
  const tenure = Math.min(1, months / a.tenureFullMonths);
  const reviewed = reviewedContacts(input, id).length;
  return [
    { key: 'explain.activity.tenure', params: { months: Math.floor(months), full: a.tenureFullMonths }, points: tenure * a.tenureShare * 100 },
    {
      key: 'explain.activity.reviewedContacts',
      params: { count: reviewed, full: a.reviewedContactsFull },
      points: Math.min(1, reviewed / a.reviewedContactsFull) * (1 - a.tenureShare) * 100,
    },
    { key: 'explain.activity.notScored', params: {}, points: null },
  ];
}

export function explainRating(input: RatingInput, companyId: Id, now: IsoDate): RatingExplanation {
  const rating = computeRating(input, companyId, now);
  const linesFor: Record<RatingComponentKey, () => ExplainLine[]> = {
    reviews: () => reviewsLines(input, companyId, now),
    verification: () => verificationLines(input, companyId, now),
    claims: () => claimsLines(input, companyId, now),
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
