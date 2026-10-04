// Strong signals only (see DECISIONS "Review weight" and "Detector"). Mutual reviews of
// honest partners are not a signal: doubtful reviews lose weight instead of getting a flag.
import { CONFIG } from '../config';
import { monthsBetween } from '../time';
import type { AppState, Id, IsoDate } from '../types';
import { reviewGroup } from './reviewWeight';

export type SignalKind = 'shared_device' | 'closed_ring';

export interface Signal {
  kind: SignalKind;
  /** Other companies involved: the device sharer, or the other ring members. */
  withIds: Id[];
}

export interface Suspicion {
  companyId: Id;
  signals: Signal[];
}

export type DetectorInput = Pick<AppState, 'companies' | 'reviews' | 'contactAccesses' | 'claims'>;

/** Groups of ≥ ringMinSize new companies whose interactions stay (almost) entirely inside the group. */
export function closedRings(state: DetectorInput, now: IsoDate): Id[][] {
  const d = CONFIG.detector;
  const isNew = (id: Id) => {
    const c = state.companies.find((x) => x.id === id);
    return !!c && monthsBetween(c.joinedAt, now) < d.ringNewMonths;
  };
  const rings = new Map<string, Id[]>();
  for (const r of state.reviews) {
    if (r.voided) continue;
    const g = reviewGroup(state, r.authorId, r.targetId);
    if (g.members.length < d.ringMinSize || g.closedShare < d.ringClosedShare || !g.members.every(isNew)) continue;
    const members = [...g.members].sort();
    rings.set(members.join(','), members);
  }
  return [...rings.values()];
}

export function detectSuspicions(state: DetectorInput, now: IsoDate): Suspicion[] {
  const byCompany = new Map<Id, Signal[]>();
  const add = (id: Id, signal: Signal) => byCompany.set(id, [...(byCompany.get(id) ?? []), signal]);
  for (const c of state.companies) {
    const sharers = state.companies.filter((o) => o.id !== c.id && o.deviceId === c.deviceId).map((o) => o.id);
    if (sharers.length > 0) add(c.id, { kind: 'shared_device', withIds: sharers });
  }
  for (const ring of closedRings(state, now)) {
    for (const id of ring) add(id, { kind: 'closed_ring', withIds: ring.filter((x) => x !== id) });
  }
  return [...byCompany.entries()].map(([companyId, signals]) => ({ companyId, signals }));
}
