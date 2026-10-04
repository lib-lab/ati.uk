import { describe, expect, it } from 'vitest';
import { buildSeedState } from '../../seed';
import { addDays } from '../time';
import { cargo, company, emptyState, NOW } from '../testing/fixtures';
import type { Flag, SearchFilters, SortKey, TruckListing } from '../types';
import { computeExpiresAt } from './lifetime';
import { computeRating } from './rating';
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

describe('E4 filters', () => {
  const truck = (id: string, overrides: Partial<TruckListing> = {}): TruckListing => {
    const dateFrom = overrides.dateFrom ?? addDays(NOW, 1);
    return {
      ...cargo(id, 'a'),
      kind: 'truck',
      dateFrom,
      expiresAt: computeExpiresAt('truck', dateFrom),
      ...overrides,
    } as TruckListing;
  };
  const s = emptyState({
    companies: [company('a'), company('b')],
    listings: [
      cargo('lodz', 'a', { from: { cityId: 'lodz' } }),
      cargo('krakow', 'a', { from: { cityId: 'krakow' } }),
      cargo('range', 'a', { dateFrom: addDays(NOW, 3), dateTo: addDays(NOW, 5) }),
      cargo('vol', 'a', { volumeM3: 40, loadingMethods: ['top', 'side'] }),
      truck('anyDest', { to: { any: true } }),
      truck('toParis', { to: { cityId: 'paris' } }),
    ],
  });
  const ids = (f: SearchFilters) => searchListings(s, f, NOW).map((l) => l.id).sort();

  it('radius around the departure city (Łódź ≈ 120 km, Kraków ≈ 250 km from Warsaw)', () => {
    expect(ids({ kind: 'cargo', fromCityId: 'warsaw', fromRadiusKm: 150 })).toEqual(['range', 'vol', 'lodz'].sort());
    expect(ids({ kind: 'cargo', fromCityId: 'warsaw', fromRadiusKm: 300 })).toContain('krakow');
    expect(ids({ kind: 'cargo', fromCityId: 'lodz' })).toEqual(['lodz']); // no radius = exact city
  });

  it('radius around the destination; "any destination" trucks always match', () => {
    // Lyon is ≈ 390 km from Paris
    expect(ids({ kind: 'truck', toCityId: 'lyon', toRadiusKm: 400 })).toEqual(['anyDest', 'toParis']);
    expect(ids({ kind: 'truck', toCityId: 'lyon' })).toEqual(['anyDest']);
  });

  it('date filter overlaps the loading range (cargo) or availability window (truck)', () => {
    expect(ids({ kind: 'cargo', dateFrom: addDays(NOW, 5), dateTo: addDays(NOW, 6) })).toEqual(['range']);
    expect(ids({ kind: 'cargo', dateTo: addDays(NOW, 2) })).toEqual(['krakow', 'lodz', 'vol']);
    // truck available from NOW+1 until NOW+4 end of day
    expect(ids({ kind: 'truck', dateFrom: addDays(NOW, 3) })).toEqual(['anyDest', 'toParis']);
    expect(ids({ kind: 'truck', dateFrom: addDays(NOW, 5) })).toEqual([]);
  });

  it('volume range excludes listings without a volume; loading methods need an overlap', () => {
    expect(ids({ kind: 'cargo', volumeMin: 30, volumeMax: 50 })).toEqual(['vol']);
    expect(ids({ kind: 'cargo', volumeMax: 10 })).toEqual([]);
    expect(ids({ kind: 'cargo', loadingMethods: ['side'] })).toEqual(['vol']);
  });
});

describe('E4 rating filters on seed data', () => {
  const seed = buildSeedState();
  const owners = (f: SearchFilters) => new Set(searchListings(seed, f, seed.now).map((l) => l.ownerId));

  it('"only without red flags" removes Ghost Lines (liquidated) and Euro Cargo Partners (mismatch)', () => {
    expect(owners({ kind: 'cargo' }).has('c11')).toBe(true);
    const clean = owners({ kind: 'cargo', noRedFlags: true });
    expect(clean.has('c11')).toBe(false);
    expect(clean.has('c12')).toBe(false);
  });

  it('minimum rating removes companies below it', () => {
    const res = searchListings(seed, { kind: 'cargo', minRating: 80 }, seed.now);
    expect(res.length).toBeGreaterThan(0);
    for (const l of res) expect(computeRating(seed, l.ownerId, seed.now).score).toBeGreaterThanOrEqual(80);
  });
});

describe('E4 sorting', () => {
  const s = emptyState({
    companies: [company('a'), company('b', { verification: { ...company('b').verification, record: null, matchesProfile: false } })],
    listings: [
      cargo('cheap', 'a', { rate: { mode: 'fixed', amount: 50000, currency: 'EUR' }, createdAt: addDays(NOW, -3) }),
      cargo('dear', 'b', { rate: { mode: 'fixed', amount: 150000, currency: 'EUR' }, createdAt: addDays(NOW, -2), dateFrom: addDays(NOW, 4) }),
      cargo('noRate', 'a', { createdAt: addDays(NOW, -1) }),
      cargo('prio', 'b', { priorityUntil: addDays(NOW, 2), createdAt: addDays(NOW, -5), dateFrom: addDays(NOW, 9) }),
    ],
  });
  const order = (sort: SortKey) => searchListings(s, { kind: 'cargo' }, NOW, { sort }).map((l) => l.id);

  it('rate per km: highest first, listings without a rate last, priority still first', () => {
    expect(order('rate_per_km')).toEqual(['prio', 'dear', 'cheap', 'noRate']);
  });
  it('rating: higher-rated owner first', () => {
    expect(order('rating')).toEqual(['prio', 'noRate', 'cheap', 'dear']); // ties: same date → newest first
  });
  it('freshness: newest first', () => {
    expect(order('freshness')).toEqual(['prio', 'noRate', 'dear', 'cheap']);
  });
  it('loading date is the default', () => {
    expect(searchListings(s, { kind: 'cargo' }, NOW).map((l) => l.id)).toEqual(order('loading_date'));
  });
});
