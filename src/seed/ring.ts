// A closed ring of new companies that review only each other (scenario for review independence
// and the "closed ring" detector). Built without the PRNG so the rest of the seed does not shift.
import { CONFIG } from '../domain/config';
import { computeExpiresAt } from '../domain/rules/lifetime';
import { addDays, addHours, startOfDay } from '../domain/time';
import type { CargoListing, ContactAccess, LedgerTransaction, Listing, Review, TruckListing } from '../domain/types';
import type { CompanySpec } from './companies';

export const RING_SPECS: CompanySpec[] = [
  {
    id: 'c19', legalName: 'Northline Freight UAB', country: 'LT', regNumberType: 'VAT', regNumber: 'LT100012345',
    role: 'carrier', archetype: 'ring', note: 'Closed ring (c19–c21): new, reviews only each other',
    joinedMonthsAgo: 2, foundedYearsAgo: 1.5, reportsFiled: true, balanceEur: 20, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 1, deviceId: 'dev-19', homeCities: ['vilnius'],
    persons: [{ name: 'Mantas Jonaitis', phone: '+370 612 11 219' }],
  },
  {
    id: 'c20', legalName: 'Brightway Logistics s.r.o.', country: 'CZ', regNumberType: 'ICO', regNumber: '29123456',
    role: 'forwarder', archetype: 'ring', note: 'Closed ring (c19–c21): new, reviews only each other',
    joinedMonthsAgo: 2, foundedYearsAgo: 1.2, reportsFiled: true, balanceEur: 20, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 1, deviceId: 'dev-20', homeCities: ['prague'],
    persons: [{ name: 'Jakub Novák', phone: '+420 603 222 320' }],
  },
  {
    id: 'c21', legalName: 'Vela Transport Kft.', country: 'HU', regNumberType: 'VAT', regNumber: 'HU34567812',
    role: 'shipper', archetype: 'ring', note: 'Closed ring (c19–c21): new, reviews only each other',
    joinedMonthsAgo: 2, foundedYearsAgo: 1.3, reportsFiled: true, balanceEur: 20, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 2, deviceId: 'dev-21', homeCities: ['budapest'],
    persons: [{ name: 'Zsófia Tóth', phone: '+36 30 555 2121' }],
  },
];

export interface RingSeed {
  listings: Listing[];
  accesses: ContactAccess[];
  reviews: Review[];
  transactions: LedgerTransaction[];
}

/** Every member opens every other member's contact (paid) and leaves a 5★ review. */
export function buildRing(now: string, joinedAt: (id: string) => string): RingSeed {
  const accesses: ContactAccess[] = [];
  const reviews: Review[] = [];
  const debits: LedgerTransaction[] = [];
  let n = 0;
  for (const a of RING_SPECS) {
    for (const b of RING_SPECS) {
      if (a.id === b.id) continue;
      n++;
      const openedAt = addHours(addDays(now, -30 + n), 10);
      const accessId = `ar${n}`;
      const txId = `tr${n}`;
      debits.push({ id: txId, companyId: a.id, type: 'contact', amount: -CONFIG.prices.contact, createdAt: openedAt, refId: accessId });
      accesses.push({ id: accessId, viewerId: a.id, ownerId: b.id, firstListingId: `lr-${b.id}`, openedAt, paidWith: 'balance', transactionId: txId });
      reviews.push({ id: `rr${n}`, authorId: a.id, targetId: b.id, stars: 5, text: 'Perfect partner, highly recommended.', createdAt: addDays(openedAt, 1) });
    }
  }
  const transactions: LedgerTransaction[] = RING_SPECS.map((s) => ({
    id: `trt-${s.id}`,
    companyId: s.id,
    type: 'topup' as const,
    amount: s.balanceEur * 100 + debits.filter((d) => d.companyId === s.id).reduce((sum, d) => sum - d.amount, 0),
    createdAt: joinedAt(s.id),
  }));
  transactions.push(...debits);

  const route: Record<string, [string, string]> = { c19: ['vilnius', 'warsaw'], c20: ['prague', 'vienna'], c21: ['budapest', 'bratislava'] };
  const listings: Listing[] = RING_SPECS.map((s, i) => {
    const [from, to] = route[s.id]!;
    const dateFrom = addHours(startOfDay(addDays(now, 3 + i)), 8);
    const base = {
      id: `lr-${s.id}`, ownerId: s.id, contactPersonId: `${s.id}-p1`, from: { cityId: from }, to: { cityId: to }, dateFrom,
      bodyTypes: ['tent' as const], weightT: 20, loadingMethods: ['rear' as const], rate: { mode: 'on_request' as const, currency: CONFIG.currency },
      createdAt: addDays(now, -2), status: 'active' as const, isOpen: false,
    };
    if (s.role === 'carrier') {
      const truck: TruckListing = { ...base, kind: 'truck', expiresAt: computeExpiresAt('truck', dateFrom) };
      return truck;
    }
    const cargo: CargoListing = {
      ...base, kind: 'cargo', expiresAt: computeExpiresAt('cargo', dateFrom), cargoName: 'Household goods', packaging: 'pallets', pieces: 18,
    };
    return cargo;
  });
  return { listings, accesses, reviews, transactions };
}
