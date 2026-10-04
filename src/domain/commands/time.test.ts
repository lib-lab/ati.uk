import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { company, emptyState, NOW } from '../testing/fixtures';
import { addDays, addHours, addMonths } from '../time';
import type { AppState, IsoDate } from '../types';
import { advanceTime, daysCrossed, type TimeProcess } from './time';

describe('daysCrossed', () => {
  it('counts UTC day boundaries', () => {
    expect(daysCrossed('2026-10-05T09:00:00.000Z', '2026-10-05T23:00:00.000Z')).toBe(0);
    expect(daysCrossed('2026-10-05T23:00:00.000Z', '2026-10-06T01:00:00.000Z')).toBe(1);
    expect(daysCrossed('2026-10-05T09:00:00.000Z', '2026-10-12T09:00:00.000Z')).toBe(7);
  });
});

describe('advanceTime', () => {
  const base = emptyState({ companies: [company('a')], actorId: 'a' });

  it('moves the clock and logs time_shifted', () => {
    const to = addDays(NOW, 1);
    const res = advanceTime(base, to);
    if (!res.ok) throw new Error(res.error);
    expect(res.state.now).toBe(to);
    expect(res.state.events[0]).toMatchObject({ type: 'time_shifted', at: to, params: { from: NOW, to } });
  });

  it('refuses to go back or stand still', () => {
    expect(advanceTime(base, NOW).ok).toBe(false);
    expect(advanceTime(base, addDays(NOW, -1)).ok).toBe(false);
  });

  it('runs processes in order with the shift window', () => {
    const calls: string[] = [];
    const mk = (name: string): TimeProcess => ({
      reasonKey: `r.${name}`,
      run: (s: AppState, from: IsoDate, to: IsoDate) => {
        calls.push(`${name}:${from}->${to}:${s.now}`);
        return s;
      },
    });
    const to = addHours(NOW, 5);
    advanceTime(base, to, [mk('first'), mk('second')]);
    expect(calls).toEqual([`first:${NOW}->${to}:${to}`, `second:${NOW}->${to}:${to}`]);
  });

  it('attributes rating changes made by a process to its reason', () => {
    const process: TimeProcess = {
      reasonKey: 'r.registry',
      run: (s) => ({ ...s, companies: s.companies.map((c) => ({ ...c, verification: { ...c.verification, matchesProfile: false } })) }),
    };
    const res = advanceTime(base, addHours(NOW, 1), [process]);
    if (!res.ok) throw new Error(res.error);
    const ev = res.state.events.find((e) => e.type === 'rating_changed');
    expect(ev?.reasonKey).toBe('r.registry');
    expect(ev?.rating?.components.map((c) => c.key)).toEqual(['verification']);
  });

  it('recalculates ratings once per shift crossing a day, with a reason', () => {
    const seed = buildSeedState();
    const res = advanceTime(seed, addMonths(seed.now, 6));
    if (!res.ok) throw new Error(res.error);
    const daily = res.state.events.filter((e) => e.type === 'rating_changed' && e.reasonKey === 'event.rating.daily');
    expect(daily.length).toBeGreaterThan(0);
    expect(daily.every((e) => e.params.days === 182)).toBe(true);
    // one event per company at most
    const subjects = daily.map((e) => e.subjectIds[0]);
    expect(new Set(subjects).size).toBe(subjects.length);
  });

  it('does not recalculate within the same day', () => {
    const seed = buildSeedState();
    const res = advanceTime(seed, addHours(seed.now, 2));
    if (!res.ok) throw new Error(res.error);
    expect(res.state.events.some((e) => e.type === 'rating_changed')).toBe(false);
  });
});
