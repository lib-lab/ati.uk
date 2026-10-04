// Yellow flag only for a closed ring of companies without outside activity (TZ). A shared IP or
// device alone is normal and only lowers the weight of mutual reviews (see reviewWeight.ts).
import { CONFIG } from '../config';
import type { AppState, Id } from '../types';
import { reviewGroup } from './reviewWeight';

export interface Suspicion {
  companyId: Id;
  /** The other ring members. */
  ringWith: Id[];
}

export type DetectorInput = Pick<AppState, 'companies' | 'reviews' | 'contactAccesses' | 'claims'>;

/** Groups of ≥ ringMinSize companies whose interactions stay (almost) entirely inside the group. */
export function closedRings(state: DetectorInput): Id[][] {
  const d = CONFIG.detector;
  const rings = new Map<string, Id[]>();
  for (const r of state.reviews) {
    if (r.voided) continue;
    const g = reviewGroup(state, r.authorId, r.targetId);
    if (g.members.length < d.ringMinSize || g.closedShare < d.ringClosedShare) continue;
    const members = [...g.members].sort();
    rings.set(members.join(','), members);
  }
  return [...rings.values()];
}

export function detectSuspicions(state: DetectorInput): Suspicion[] {
  return closedRings(state).flatMap((ring) => ring.map((id) => ({ companyId: id, ringWith: ring.filter((x) => x !== id) })));
}
