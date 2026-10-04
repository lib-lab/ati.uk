// Simulated clock. advanceTime moves `now` forward and runs time-driven processes in order
// (expiry, reminders, digests, deactivation... are registered by later stages).
import { logEvent } from '../events';
import { expiryProcess, expiryReminderProcess } from './listings';
import { dataMismatchProcess, detectorProcess } from './moderation';
import { inactivityProcess } from './account';
import { withRatingEvents } from '../ratingEvents';
import { daysBetween, isBefore, startOfDay } from '../time';
import type { AppState, IsoDate } from '../types';
import type { CommandResult } from './result';

export interface TimeProcess {
  /** i18n key used as the reason of rating events this process causes. */
  reasonKey: string;
  run(state: AppState, from: IsoDate, to: IsoDate): AppState;
}

/** Registered processes, in execution order. */
export const TIME_PROCESSES: TimeProcess[] = [
  expiryReminderProcess,
  expiryProcess,
  detectorProcess,
  dataMismatchProcess,
  inactivityProcess,
];

/** Number of UTC day boundaries between from and to. */
export function daysCrossed(from: IsoDate, to: IsoDate): number {
  return Math.round(daysBetween(startOfDay(from), startOfDay(to)));
}

export function advanceTime(state: AppState, to: IsoDate, processes: TimeProcess[] = TIME_PROCESSES): CommandResult {
  if (!isBefore(state.now, to)) return { ok: false, error: 'not_allowed' };
  const from = state.now;

  let s = logEvent({ ...state, now: to }, {
    type: 'time_shifted',
    actor: state.actorId,
    subjectIds: [],
    reasonKey: 'event.timeShifted',
    params: { from, to },
  });

  // Daily recalculation: ratings drift with time (tenure, review age, company age).
  // One recalculation per shift that crosses at least one day boundary.
  const days = daysCrossed(from, to);
  if (days > 0) {
    s = withRatingEvents({ ...state }, s, { reasonKey: 'event.rating.daily', params: { days } });
  }

  for (const process of processes) {
    const before = s;
    const after = process.run(s, from, to);
    s = after === before ? after : withRatingEvents(before, after, { reasonKey: process.reasonKey });
  }
  return { ok: true, state: s };
}
