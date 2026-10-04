// Against collecting contacts (TZ): daily limit, signals of automated collection, gradual response.
import { CONFIG } from '../config';
import { addHours, addMonths, isBefore, monthsBetween, startOfDay } from '../time';
import type { AppState, Company, CollectionGuard, ContactOpening, Id, IsoDate } from '../types';

const C = CONFIG.collection;

export type CollectionInput = Pick<AppState, 'contactOpenings' | 'listings' | 'companies'>;

/** New contact openings (accesses created) by the company since the start of the calendar day. */
export function openingsToday(state: Pick<AppState, 'contactOpenings'>, companyId: Id, now: IsoDate): number {
  const dayStart = startOfDay(now);
  return state.contactOpenings.filter((o) => o.viewerId === companyId && o.createdAccess && !isBefore(o.at, dayStart)).length;
}

export function dailyLimit(company: Pick<Company, 'dailyOpenLimit'>): number {
  return company.dailyOpenLimit ?? C.dailyOpenLimit;
}

/** "A company with history" gets the raised limit on request, without review (TZ). */
export function hasHistory(state: Pick<AppState, 'contactOpenings'>, company: Company, now: IsoDate): boolean {
  const openings = state.contactOpenings.filter((o) => o.viewerId === company.id && o.createdAccess).length;
  return monthsBetween(company.joinedAt, now) >= C.historyMinMonths && openings >= C.historyMinOpenings;
}

export function guardOf(company: Pick<Company, 'collection'>, now: IsoDate): CollectionGuard {
  return company.collection ?? { state: 'ok', since: now, reasons: [], failedChecks: 0 };
}

/**
 * Signals of automated collection among the company's openings since `from`:
 * many openings within minutes, openings without viewing the card, many directions without own listings.
 * Returns i18n keys of the signals found.
 */
export function collectionSignals(state: CollectionInput, companyId: Id, from: IsoDate, now: IsoDate): string[] {
  const windowStart = addHours(now, -C.signalWindowHours);
  const since = isBefore(from, windowStart) ? windowStart : from;
  const recent = state.contactOpenings.filter((o) => o.viewerId === companyId && o.createdAccess && !isBefore(o.at, since));
  const signals: string[] = [];
  const burstStart = addHours(now, -C.burstMinutes / 60);
  if (recent.filter((o) => !isBefore(o.at, burstStart)).length >= C.burstCount) signals.push('collection.signal.burst');
  if (recent.filter((o) => !o.viaCard).length >= C.noCardViewCount) signals.push('collection.signal.noCard');
  const hasOwnListings = state.listings.some((l) => l.ownerId === companyId && l.status === 'active');
  if (!hasOwnListings && directions(state, recent).size >= C.directionsCount) signals.push('collection.signal.directions');
  return signals;
}

function directions(state: Pick<AppState, 'listings'>, openings: ContactOpening[]): Set<string> {
  const out = new Set<string>();
  for (const o of openings) {
    const l = state.listings.find((x) => x.id === o.listingId);
    if (l) out.add(`${l.from.cityId}>${'any' in l.to ? '*' : l.to.cityId}`);
  }
  return out;
}

/** Openings made while slowed within the last hour (the hourly cap of the slowed state). */
export function openingsLastHour(guard: CollectionGuard, now: IsoDate): number {
  const start = addHours(now, -1);
  return (guard.openedWhileSlowed ?? []).filter((at) => !isBefore(at, start)).length;
}

/** What stands between the company and a new contact opening right now. */
export type Gate =
  | { kind: 'ok' }
  | { kind: 'blocked' }
  | { kind: 'daily_limit'; limit: number }
  | { kind: 'human_check' }
  | { kind: 'slow_down'; perHour: number };

export function openingGate(state: CollectionInput, companyId: Id, now: IsoDate, humanConfirmed: boolean): Gate {
  const company = state.companies.find((c) => c.id === companyId);
  if (!company) return { kind: 'blocked' };
  const guard = guardOf(company, now);
  if (guard.state === 'blocked') return { kind: 'blocked' };
  const limit = dailyLimit(company);
  if (openingsToday(state, companyId, now) >= limit) return { kind: 'daily_limit', limit };
  if (guard.state === 'slowed' && !recovered(state, companyId, guard, now)) {
    if (!humanConfirmed) return { kind: 'human_check' };
    if (openingsLastHour(guard, now) >= C.slowedPerHour) return { kind: 'slow_down', perHour: C.slowedPerHour };
  }
  return { kind: 'ok' };
}

/** A slowed company returns to normal after a quiet period without signals. */
export function recovered(state: CollectionInput, companyId: Id, guard: CollectionGuard, now: IsoDate): boolean {
  if (guard.state !== 'slowed') return false;
  if (isBefore(now, addHours(guard.since, C.recoverHours))) return false;
  return collectionSignals(state, companyId, addHours(now, -C.recoverHours), now).length === 0;
}

/** Retention: opening log entries older than this are anonymised. */
export function retentionStart(now: IsoDate): IsoDate {
  return addMonths(now, -CONFIG.openingLogRetentionMonths);
}
