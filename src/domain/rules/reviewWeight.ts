// Review weight (see DECISIONS "Review weight"). By default we trust users; doubtful reviews
// are not flagged but weigh less. Weight = recency × contact cost × author × independence.
import { CONFIG } from '../config';
import { monthsBetween } from '../time';
import type { AppState, Id, IsoDate, Review } from '../types';

export type WeightInput = Pick<AppState, 'companies' | 'reviews' | 'claims' | 'listings' | 'contactAccesses'>;

const W = CONFIG.rating.reviews;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export interface ReviewWeight {
  recency: number;
  contactCost: number;
  author: number;
  independence: number;
  total: number;
}

export function recencyWeight(review: Pick<Review, 'createdAt'>, now: IsoDate): number {
  return monthsBetween(review.createdAt, now) > W.oldAfterMonths ? W.oldWeight : 1;
}

/** Full weight after a paid contact; less after a free one (open listing) or a refunded one. */
export function contactCostWeight(input: Pick<AppState, 'contactAccesses'>, review: Review): number {
  const access = input.contactAccesses.find((a) => a.viewerId === review.authorId && a.ownerId === review.targetId);
  if (!access) return W.contactCost.open_listing; // should not happen: reviews need an opened contact
  if (access.refundedAt) return W.contactCost.refunded;
  return W.contactCost[access.paidWith];
}

/** 0..1: how established the author is on the platform. */
export function authorStanding(input: WeightInput, authorId: Id, now: IsoDate): number {
  const a = W.author;
  const company = input.companies.find((c) => c.id === authorId);
  if (!company) return 0;
  const tenure = clamp01(monthsBetween(company.joinedAt, now) / a.fullTenureMonths);
  const activityCount =
    input.listings.filter((l) => l.ownerId === authorId).length +
    input.contactAccesses.filter((x) => x.viewerId === authorId).length;
  const activity = clamp01(activityCount / a.fullActivity);
  return a.tenureShare * tenure + (1 - a.tenureShare) * activity;
}

/** From minWeight (no history) to 1 (established author). */
export function authorWeight(input: WeightInput, authorId: Id, now: IsoDate): number {
  return W.author.minWeight + (1 - W.author.minWeight) * authorStanding(input, authorId, now);
}

// ---------- Independence ----------

interface Edge {
  a: Id;
  b: Id;
}

/** Every interaction between two companies: reviews, opened contacts, claims. */
export function interactionEdges(input: Pick<AppState, 'reviews' | 'contactAccesses' | 'claims'>): Edge[] {
  return [
    ...input.reviews.filter((r) => !r.voided).map((r) => ({ a: r.authorId, b: r.targetId })),
    ...input.contactAccesses.map((x) => ({ a: x.viewerId, b: x.ownerId })),
    ...input.claims.map((c) => ({ a: c.claimantId, b: c.targetId })),
  ];
}

/** Companies a company exchanged reviews with (either direction). */
export function reviewPartners(input: Pick<AppState, 'reviews'>, id: Id): Set<Id> {
  const out = new Set<Id>();
  for (const r of input.reviews) {
    if (r.voided) continue;
    if (r.authorId === id) out.add(r.targetId);
    if (r.targetId === id) out.add(r.authorId);
  }
  return out;
}

export interface ReviewGroup {
  members: Id[];
  /** Share of the members' interactions that stay inside the group (0..1). */
  closedShare: number;
}

/** The group of a review A→B: A, B and their common review partners. */
export function reviewGroup(input: Pick<AppState, 'reviews' | 'contactAccesses' | 'claims'>, a: Id, b: Id): ReviewGroup {
  const pa = reviewPartners(input, a);
  const pb = reviewPartners(input, b);
  const members = new Set<Id>([a, b, ...[...pa].filter((x) => pb.has(x))]);
  return { members: [...members], closedShare: closedShare(input, members) };
}

export function closedShare(input: Pick<AppState, 'reviews' | 'contactAccesses' | 'claims'>, members: Set<Id>): number {
  let touching = 0;
  let inside = 0;
  for (const e of interactionEdges(input)) {
    const ia = members.has(e.a);
    const ib = members.has(e.b);
    if (ia || ib) touching++;
    if (ia && ib) inside++;
  }
  return touching === 0 ? 0 : inside / touching;
}

/** True when the review is inside a small closed group. */
export function isInClosedGroup(input: Pick<AppState, 'reviews' | 'contactAccesses' | 'claims'>, review: Review): boolean {
  const g = reviewGroup(input, review.authorId, review.targetId);
  const ind = W.independence;
  return g.members.length <= ind.maxGroupSize && g.closedShare >= ind.closedShare;
}

export function independenceWeight(input: Pick<AppState, 'reviews' | 'contactAccesses' | 'claims'>, review: Review): number {
  return isInClosedGroup(input, review) ? W.independence.groupWeight : 1;
}

export function reviewWeight(input: WeightInput, review: Review, now: IsoDate): ReviewWeight {
  const recency = recencyWeight(review, now);
  const contactCost = contactCostWeight(input, review);
  const author = authorWeight(input, review.authorId, now);
  const independence = independenceWeight(input, review);
  return { recency, contactCost, author, independence, total: recency * contactCost * author * independence };
}
