// Small builders for unit tests. Not used by the app.
import { CONFIG } from '../config';
import { computeExpiresAt } from '../rules/lifetime';
import type { ListingDraft } from '../rules/listingDraft';
import { addDays } from '../time';
import type { AppState, CargoListing, Company, IsoDate, Review } from '../types';

export const NOW: IsoDate = CONFIG.clockStart;

export function company(id: string, overrides: Partial<Company> = {}): Company {
  return {
    id,
    legalName: `Company ${id}`,
    country: 'PL',
    regNumber: `REG-${id}`,
    regNumberType: 'NIP',
    role: 'forwarder',
    contactPersons: [{ id: `${id}-p1`, name: `Person ${id}`, phone: '+48 600 000 000', consent: { givenAt: addDays(NOW, -800) } }],
    joinedAt: addDays(NOW, -800),
    lastLoginAt: NOW,
    status: 'active',
    verification: {
      checkedAt: NOW,
      record: {
        country: 'PL', regNumber: `REG-${id}`, legalName: `Company ${id}`, address: 'x', status: 'active',
        foundedAt: addDays(NOW, -365 * 10), reportsFiled: true,
      },
      matchesProfile: true,
    },
    listingsHiddenUntilContactConfirmed: false,
    deviceId: `dev-${id}`,
    ...overrides,
  };
}

export function cargo(id: string, ownerId: string, overrides: Partial<CargoListing> = {}): CargoListing {
  const dateFrom = overrides.dateFrom ?? addDays(NOW, 2);
  return {
    id,
    kind: 'cargo',
    ownerId,
    contactPersonId: `${ownerId}-p1`,
    from: { cityId: 'warsaw' },
    to: { cityId: 'berlin' },
    dateFrom,
    bodyTypes: ['tent'],
    weightT: 10,
    loadingMethods: ['rear'],
    rate: { mode: 'on_request', currency: 'EUR' },
    createdAt: addDays(NOW, -1),
    expiresAt: computeExpiresAt('cargo', dateFrom, overrides.dateTo),
    status: 'active',
    isOpen: false,
    cargoName: 'Goods',
    packaging: 'pallets',
    pieces: 10,
    ...overrides,
  };
}

let reviewSeq = 0;
export function review(authorId: string, targetId: string, stars: Review['stars'], daysAgo = 10): Review {
  return { id: `rv${++reviewSeq}`, authorId, targetId, stars, dealHappened: true, text: '', createdAt: addDays(NOW, -daysAgo) };
}

export function emptyState(overrides: Partial<AppState> = {}): AppState {
  return {
    version: 1, now: NOW, actorId: '', companies: [], listings: [], contactAccesses: [], contactOpenings: [], listingChanges: [], transactions: [],
    packages: [], reviews: [], claims: [], complaints: [], flags: [], disputes: [], subscriptions: [], notifications: [],
    templates: [], events: [], seq: 0, ...overrides,
  };
}

/** Complete cargo draft for owner "o" (contact person "o-p1"), loading in 2 days. */
export const cargoDraft = (overrides: Partial<ListingDraft> = {}): ListingDraft => ({
  kind: 'cargo',
  contactPersonId: 'o-p1',
  from: { cityId: 'warsaw' },
  to: { cityId: 'berlin' },
  dateFrom: addDays(NOW, 2),
  bodyTypes: ['tent'],
  weightT: 10,
  loadingMethods: ['rear'],
  rate: { mode: 'fixed', amount: 100000, currency: 'EUR' },
  cargoName: 'Steel',
  packaging: 'coils',
  pieces: 4,
  ...overrides,
});
