// Regular clients of Moravia Trans (c04) and Euro Cargo Partners (c12): small shippers whose
// past cargo both companies took. They give c04 and c12 enough opened contacts to count as
// "companies with history" for a raised daily limit (TZ, CONFIG.collection.historyMinOpenings).
// Built without the PRNG so the rest of the seed does not shift.
import { CONFIG } from '../domain/config';
import { computeExpiresAt } from '../domain/rules/lifetime';
import { addDays, addHours, startOfDay } from '../domain/time';
import type { CargoListing, ContactAccess, LedgerTransaction } from '../domain/types';
import type { CompanySpec } from './companies';

const client = (
  n: number, legalName: string, country: string, regNumberType: CompanySpec['regNumberType'], regNumber: string,
  city: string, person: string, phone: string,
): CompanySpec => ({
  id: `c${22 + n}`, legalName, country, regNumberType, regNumber,
  role: 'shipper', archetype: 'client', note: 'Regular client of Moravia Trans and Euro Cargo Partners, no active listings',
  joinedMonthsAgo: 18 + n, foundedYearsAgo: 6 + n, reportsFiled: true, balanceEur: 0, freeUsedThisMonth: 0,
  lastLoginDaysAgo: 3 + n, deviceId: `dev-${22 + n}`, homeCities: [city],
  persons: [{ name: person, phone }],
});

export const CLIENT_SPECS: CompanySpec[] = [
  client(0, 'Hanák Nábytek s.r.o.', 'CZ', 'ICO', '26114471', 'brno', 'Lucie Hanáková', '+420 605 310 422'),
  client(1, 'Ostrava Steel Parts a.s.', 'CZ', 'ICO', '25863112', 'ostrava', 'Tomáš Bureš', '+420 605 310 423'),
  client(2, 'Pivovar Moravan s.r.o.', 'CZ', 'ICO', '28417753', 'brno', 'Jana Kolářová', '+420 605 310 424'),
  client(3, 'Prague Paper Mill s.r.o.', 'CZ', 'ICO', '27154364', 'prague', 'Ondřej Malý', '+420 605 310 425'),
  client(4, 'Tatra Agro s.r.o.', 'SK', 'VAT', 'SK2020445671', 'bratislava', 'Peter Kováč', '+421 905 410 426'),
  client(5, 'Danubia Glass a.s.', 'SK', 'VAT', 'SK2021556782', 'bratislava', 'Eva Szabová', '+421 905 410 427'),
  client(6, 'Wiener Feinkost GmbH', 'AT', 'VAT', 'ATU61234573', 'vienna', 'Lukas Huber', '+43 664 510 428'),
  client(7, 'Alpen Holz GmbH', 'AT', 'VAT', 'ATU62345674', 'vienna', 'Anna Gruber', '+43 664 510 429'),
  client(8, 'Pannon Textil Kft.', 'HU', 'VAT', 'HU23456785', 'budapest', 'Gábor Nagy', '+36 30 610 4430'),
  client(9, 'Balaton Foods Kft.', 'HU', 'VAT', 'HU24567891', 'budapest', 'Réka Kiss', '+36 30 610 4431'),
  client(10, 'Śląskie Kable sp. z o.o.', 'PL', 'NIP', '6341234562', 'katowice', 'Marek Zając', '+48 602 710 432'),
  client(11, 'Kraków Ceramika S.A.', 'PL', 'NIP', '6761234563', 'krakow', 'Agnieszka Wójcik', '+48 602 710 433'),
];

const ROUTES: Record<string, string> = { brno: 'vienna', ostrava: 'katowice', prague: 'leipzig', bratislava: 'budapest', vienna: 'munich', budapest: 'bratislava', katowice: 'brno', krakow: 'ostrava' };
/** The viewers: c04 is a carrier, c12 a forwarder; both take cargo. */
const VIEWERS = ['c04', 'c12'] as const;

export interface ClientSeed {
  listings: CargoListing[];
  accesses: ContactAccess[];
  /** Contact payments of the viewers; their initial top-up covers them (see the ledger in index.ts). */
  debits: LedgerTransaction[];
}

/**
 * Each client posted one cargo listing per viewer 35–120 days ago (before this month, so the free
 * contacts of the current month stay as the specs say, and within the 12-month opening log).
 * The viewer opened the contact (paid) and the client removed the listing: "found on the platform".
 */
export function buildClients(now: string): ClientSeed {
  const listings: CargoListing[] = [];
  const accesses: ContactAccess[] = [];
  const debits: LedgerTransaction[] = [];
  CLIENT_SPECS.forEach((spec, i) => {
    VIEWERS.forEach((viewerId, v) => {
      const createdAt = addHours(startOfDay(addDays(now, -(35 + i * 7 + v * 3))), 9);
      const dateFrom = addHours(startOfDay(addDays(createdAt, 2)), 8);
      const from = spec.homeCities[0]!;
      const listingId = `lc-${spec.id}-${v + 1}`;
      listings.push({
        id: listingId, ownerId: spec.id, contactPersonId: `${spec.id}-p1`, kind: 'cargo',
        from: { cityId: from }, to: { cityId: ROUTES[from]! }, dateFrom,
        bodyTypes: ['tent'], weightT: 12 + i, loadingMethods: ['rear'],
        rate: { mode: 'on_request', currency: CONFIG.currency },
        expiresAt: computeExpiresAt('cargo', dateFrom), cargoName: 'Palletised goods', packaging: 'pallets', pieces: 16,
        createdAt, status: 'removed', removedAt: addHours(createdAt, 6), removalReason: 'found_on_platform', isOpen: false,
      });
      const openedAt = addHours(createdAt, 2);
      const accessId = `ac-${viewerId}-${spec.id}`;
      const txId = `tc-${viewerId}-${spec.id}`;
      debits.push({ id: txId, companyId: viewerId, type: 'contact', amount: -CONFIG.prices.contact, createdAt: openedAt, refId: accessId });
      accesses.push({ id: accessId, viewerId, ownerId: spec.id, firstListingId: listingId, openedAt, paidWith: 'balance', transactionId: txId });
    });
  });
  return { listings, accesses, debits };
}
