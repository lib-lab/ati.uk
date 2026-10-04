import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { addDays } from '../time';
import { cargo, company, emptyState, NOW } from '../testing/fixtures';
import type { Flag } from '../types';
import { searchListings } from './search';

describe('searchListings', () => {
  const s = emptyState({
    companies: [company('a'), company('b'), company('blocked'), company('off', { status: 'deactivated' }), company('hid', { listingsHiddenUntilContactConfirmed: true })],
    flags: [{ id: 'f', companyId: 'blocked', kind: 'fraud_blocked', level: 'red', source: 'moderator', createdAt: NOW } satisfies Flag],
    listings: [
      cargo('late', 'a', { dateFrom: addDays(NOW, 5) }),
      cargo('early', 'b', { dateFrom: addDays(NOW, 1), from: { cityId: 'krakow' }, bodyTypes: ['reefer'], weightT: 20 }),
      cargo('prio', 'a', { dateFrom: addDays(NOW, 9), priorityUntil: addDays(NOW, 3) }),
      cargo('expired', 'a', { expiresAt: addDays(NOW, -1) }),
      cargo('removed', 'a', { status: 'removed' }),
      cargo('x1', 'blocked'), cargo('x2', 'off'), cargo('x3', 'hid'),
    ],
  });
  const ids = (f: Parameters<typeof searchListings>[1]) => searchListings(s, f, NOW).map((l) => l.id);

  it('shows only active listings of visible owners, priority first, then by loading date', () => {
    expect(ids({ kind: 'cargo' })).toEqual(['prio', 'early', 'late']);
  });

  it('filters by city, body type and weight', () => {
    expect(ids({ kind: 'cargo', fromCityId: 'krakow' })).toEqual(['early']);
    expect(ids({ kind: 'cargo', toCityId: 'berlin', bodyTypes: ['reefer', 'box'] })).toEqual(['early']);
    expect(ids({ kind: 'cargo', weightMin: 15 })).toEqual(['early']);
    expect(ids({ kind: 'cargo', weightMax: 15 })).toEqual(['prio', 'late']);
    expect(ids({ kind: 'truck' })).toEqual([]);
  });

  it('priority ends with its term (and "early" has expired by then)', () => {
    expect(searchListings(s, { kind: 'cargo' }, addDays(NOW, 4)).map((l) => l.id)).toEqual(['late', 'prio']);
  });

  it('truck "any destination" matches any destination filter', () => {
    const seed = buildSeedState();
    const res = searchListings(seed, { kind: 'truck', toCityId: 'paris' }, seed.now);
    expect(res.every((l) => 'any' in l.to || l.to.cityId === 'paris')).toBe(true);
    expect(res.some((l) => 'any' in l.to)).toBe(true);
  });

  it('hides the blocked seed company', () => {
    const seed = buildSeedState();
    expect(searchListings(seed, { kind: 'truck' }, seed.now).some((l) => l.ownerId === 'c18')).toBe(false);
  });
});
