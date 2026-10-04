// Pure date helpers. All dates are UTC ISO strings.
import type { IsoDate } from './types';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const toMs = (d: IsoDate): number => Date.parse(d);
export const fromMs = (ms: number): IsoDate => new Date(ms).toISOString();

export const addHours = (d: IsoDate, h: number): IsoDate => fromMs(toMs(d) + h * HOUR_MS);
export const addDays = (d: IsoDate, n: number): IsoDate => fromMs(toMs(d) + n * DAY_MS);

/** Calendar months, clamped to the end of the target month. */
export function addMonths(d: IsoDate, n: number): IsoDate {
  const date = new Date(d);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

/** End of the UTC day (23:59:59.999) of the given date. */
export function endOfDay(d: IsoDate): IsoDate {
  const date = new Date(d);
  return fromMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1) - 1);
}

export function startOfDay(d: IsoDate): IsoDate {
  const date = new Date(d);
  return fromMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** "2026-10" — key of the calendar month, used for the free contact quota. */
export const monthKey = (d: IsoDate): string => d.slice(0, 7);

export const daysBetween = (a: IsoDate, b: IsoDate): number => (toMs(b) - toMs(a)) / DAY_MS;

/** Whole calendar months from a to b (b >= a), approximate by 30.44 days. */
export const monthsBetween = (a: IsoDate, b: IsoDate): number => daysBetween(a, b) / 30.44;

export const isBefore = (a: IsoDate, b: IsoDate): boolean => toMs(a) < toMs(b);
