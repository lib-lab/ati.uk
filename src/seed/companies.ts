// Static description of seed companies. Each one represents a reputation archetype
// that a test scenario needs. Dates are relative to CONFIG.clockStart.
import type { RegNumberType, Role } from '../domain/types';

export type Archetype =
  | 'reliable'
  | 'average'
  | 'newcomer'
  | 'newcomer_one_review'
  | 'open_claims'
  | 'mixed'
  | 'liquidated'
  | 'mismatch'
  | 'linked'
  | 'inactive'
  | 'blocked'
  | 'no_free_contacts'
  | 'ring';

export interface CompanySpec {
  id: string;
  legalName: string;
  country: string;
  regNumberType: RegNumberType;
  regNumber: string;
  role: Role;
  archetype: Archetype;
  /** Short note shown in the "log in as" switcher. */
  note: string;
  joinedMonthsAgo: number;
  foundedYearsAgo: number;
  reportsFiled: boolean;
  /** Balance at clock start, EUR. */
  balanceEur: number;
  /** Free contacts already used in the current month. */
  freeUsedThisMonth: number;
  lastLoginDaysAgo: number;
  deviceId: string;
  persons: { name: string; phone: string }[];
  homeCities: string[];
}

export const COMPANY_SPECS: CompanySpec[] = [
  {
    id: 'c01', legalName: 'Vistula Logistics sp. z o.o.', country: 'PL', regNumberType: 'NIP', regNumber: '5251234561',
    role: 'forwarder', archetype: 'reliable', note: 'Reliable forwarder, many good reviews',
    joinedMonthsAgo: 30, foundedYearsAgo: 12, reportsFiled: true, balanceEur: 120, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 1, deviceId: 'dev-01', homeCities: ['warsaw', 'lodz'],
    persons: [{ name: 'Anna Kowalska', phone: '+48 601 200 301' }, { name: 'Piotr Nowak', phone: '+48 601 200 302' }],
  },
  {
    id: 'c02', legalName: 'Baltic Freight UAB', country: 'LT', regNumberType: 'VAT', regNumber: 'LT100004521',
    role: 'carrier', archetype: 'reliable', note: 'Reliable carrier, has balance, 1 free contact used',
    joinedMonthsAgo: 26, foundedYearsAgo: 9, reportsFiled: true, balanceEur: 50, freeUsedThisMonth: 1,
    lastLoginDaysAgo: 0, deviceId: 'dev-02', homeCities: ['vilnius', 'kaunas'],
    persons: [{ name: 'Tomas Kazlauskas', phone: '+370 612 34 561' }],
  },
  {
    id: 'c03', legalName: 'Rhein Spedition GmbH', country: 'DE', regNumberType: 'VAT', regNumber: 'DE281234563',
    role: 'shipper', archetype: 'reliable', note: 'Reliable shipper',
    joinedMonthsAgo: 28, foundedYearsAgo: 20, reportsFiled: true, balanceEur: 200, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 2, deviceId: 'dev-03', homeCities: ['cologne', 'frankfurt'],
    persons: [{ name: 'Jonas Becker', phone: '+49 221 555 0103' }],
  },
  {
    id: 'c04', legalName: 'Moravia Trans s.r.o.', country: 'CZ', regNumberType: 'ICO', regNumber: '27451234',
    role: 'carrier', archetype: 'no_free_contacts', note: 'Carrier: free contacts used up, zero balance',
    joinedMonthsAgo: 14, foundedYearsAgo: 6, reportsFiled: true, balanceEur: 0, freeUsedThisMonth: 3,
    lastLoginDaysAgo: 0, deviceId: 'dev-04', homeCities: ['brno', 'ostrava'],
    persons: [{ name: 'Petr Dvořák', phone: '+420 602 111 204' }],
  },
  {
    id: 'c05', legalName: 'Polska Agro S.A.', country: 'PL', regNumberType: 'NIP', regNumber: '7791234565',
    role: 'shipper', archetype: 'average', note: 'Average shipper, mixed 3–4 star reviews',
    joinedMonthsAgo: 18, foundedYearsAgo: 15, reportsFiled: true, balanceEur: 40, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 3, deviceId: 'dev-05', homeCities: ['poznan', 'wroclaw'],
    persons: [{ name: 'Marek Wiśniewski', phone: '+48 602 300 405' }],
  },
  {
    id: 'c06', legalName: 'Nordic Reefer OÜ', country: 'EE', regNumberType: 'VAT', regNumber: 'EE102345676',
    role: 'carrier', archetype: 'newcomer', note: 'Newcomer: joined 10 days ago, no reviews',
    joinedMonthsAgo: 0.33, foundedYearsAgo: 2, reportsFiled: true, balanceEur: 0, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 0, deviceId: 'dev-06', homeCities: ['tallinn', 'riga'],
    persons: [{ name: 'Kadri Tamm', phone: '+372 5123 4566' }],
  },
  {
    id: 'c07', legalName: 'Fresh Start Transport sp. z o.o.', country: 'PL', regNumberType: 'NIP', regNumber: '6761234567',
    role: 'carrier', archetype: 'newcomer_one_review', note: 'Newcomer with 1 review, zero balance',
    joinedMonthsAgo: 2, foundedYearsAgo: 1.5, reportsFiled: true, balanceEur: 0, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 1, deviceId: 'dev-07', homeCities: ['krakow', 'katowice'],
    persons: [{ name: 'Kamil Zieliński', phone: '+48 603 400 507' }],
  },
  {
    id: 'c08', legalName: 'Lowland Cargo B.V.', country: 'NL', regNumberType: 'KVK', regNumber: '81234567',
    role: 'shipper', archetype: 'newcomer', note: 'Newcomer shipper, no reviews',
    joinedMonthsAgo: 0.5, foundedYearsAgo: 4, reportsFiled: true, balanceEur: 30, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 0, deviceId: 'dev-08', homeCities: ['rotterdam', 'amsterdam'],
    persons: [{ name: 'Daan de Vries', phone: '+31 6 1234 5608' }],
  },
  {
    id: 'c09', legalName: 'Danube Haulage Kft.', country: 'HU', regNumberType: 'VAT', regNumber: 'HU12345671',
    role: 'carrier', archetype: 'open_claims', note: 'Carrier with 2 open claims',
    joinedMonthsAgo: 20, foundedYearsAgo: 8, reportsFiled: true, balanceEur: 25, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 4, deviceId: 'dev-09', homeCities: ['budapest', 'bratislava'],
    persons: [{ name: 'Gábor Nagy', phone: '+36 30 123 4509' }],
  },
  {
    id: 'c10', legalName: 'Elbe Handels GmbH', country: 'DE', regNumberType: 'VAT', regNumber: 'DE301234562',
    role: 'shipper', archetype: 'mixed', note: 'Shipper: mixed reviews, 1 open claim',
    joinedMonthsAgo: 16, foundedYearsAgo: 3, reportsFiled: false, balanceEur: 60, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 5, deviceId: 'dev-10', homeCities: ['dresden', 'leipzig'],
    persons: [{ name: 'Lena Schmidt', phone: '+49 351 555 0110' }],
  },
  {
    id: 'c11', legalName: 'Ghost Lines UAB', country: 'LT', regNumberType: 'VAT', regNumber: 'LT100009873',
    role: 'shipper', archetype: 'liquidated', note: 'Red flag: liquidated per registry',
    joinedMonthsAgo: 22, foundedYearsAgo: 7, reportsFiled: false, balanceEur: 10, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 6, deviceId: 'dev-11', homeCities: ['kaunas'],
    persons: [{ name: 'Rokas Petrauskas', phone: '+370 612 98 711' }],
  },
  {
    id: 'c12', legalName: 'Euro Cargo Partners s.r.o.', country: 'SK', regNumberType: 'VAT', regNumber: 'SK2021234562',
    role: 'forwarder', archetype: 'mismatch', note: 'Red flag: profile does not match registry',
    joinedMonthsAgo: 5, foundedYearsAgo: 2, reportsFiled: true, balanceEur: 15, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 2, deviceId: 'dev-12', homeCities: ['bratislava', 'vienna'],
    persons: [{ name: 'Martin Horváth', phone: '+421 903 123 412' }],
  },
  {
    id: 'c13', legalName: 'QuickRate Trans sp. z o.o.', country: 'PL', regNumberType: 'NIP', regNumber: '8971234563',
    role: 'carrier', archetype: 'linked', note: 'Yellow flag: linked with c14, mutual 5★ reviews',
    joinedMonthsAgo: 4, foundedYearsAgo: 1.2, reportsFiled: true, balanceEur: 20, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 1, deviceId: 'dev-shared-13', homeCities: ['wroclaw'],
    persons: [{ name: 'Adam Lewandowski', phone: '+48 604 500 613' }],
  },
  {
    id: 'c14', legalName: 'QuickRate Logistics sp. z o.o.', country: 'PL', regNumberType: 'NIP', regNumber: '8971234574',
    role: 'shipper', archetype: 'linked', note: 'Yellow flag: linked with c13, mutual 5★ reviews',
    joinedMonthsAgo: 4, foundedYearsAgo: 1.1, reportsFiled: true, balanceEur: 20, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 1, deviceId: 'dev-shared-13', homeCities: ['wroclaw'],
    persons: [{ name: 'Ewa Lewandowska', phone: '+48 604 500 614' }],
  },
  {
    id: 'c15', legalName: 'Silesia Steel S.A.', country: 'PL', regNumberType: 'NIP', regNumber: '6341234565',
    role: 'shipper', archetype: 'reliable', note: 'Reliable large shipper (steel)',
    joinedMonthsAgo: 34, foundedYearsAgo: 25, reportsFiled: true, balanceEur: 300, freeUsedThisMonth: 2,
    lastLoginDaysAgo: 0, deviceId: 'dev-15', homeCities: ['katowice', 'krakow'],
    persons: [{ name: 'Tomasz Mazur', phone: '+48 605 600 715' }],
  },
  {
    id: 'c16', legalName: 'Alpine Express GmbH', country: 'AT', regNumberType: 'VAT', regNumber: 'ATU71234566',
    role: 'forwarder', archetype: 'average', note: 'Forwarder: 1 settled and 1 rejected claim',
    joinedMonthsAgo: 12, foundedYearsAgo: 5, reportsFiled: true, balanceEur: 80, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 2, deviceId: 'dev-16', homeCities: ['vienna', 'munich'],
    persons: [{ name: 'Lukas Gruber', phone: '+43 664 123 4516' }],
  },
  {
    id: 'c17', legalName: 'Riga Container SIA', country: 'LV', regNumberType: 'VAT', regNumber: 'LV40001234567',
    role: 'carrier', archetype: 'inactive', note: 'Last login ~5.5 months ago (deactivates after +1 month)',
    joinedMonthsAgo: 24, foundedYearsAgo: 10, reportsFiled: true, balanceEur: 35, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 165, deviceId: 'dev-17', homeCities: ['riga'],
    persons: [{ name: 'Jānis Bērziņš', phone: '+371 2612 3417' }],
  },
  {
    id: 'c18', legalName: 'Fast Profit Freight Kft.', country: 'HU', regNumberType: 'VAT', regNumber: 'HU23456781',
    role: 'carrier', archetype: 'blocked', note: 'Red flag: confirmed fraud, listings hidden',
    joinedMonthsAgo: 7, foundedYearsAgo: 1, reportsFiled: false, balanceEur: 0, freeUsedThisMonth: 0,
    lastLoginDaysAgo: 20, deviceId: 'dev-18', homeCities: ['budapest'],
    persons: [{ name: 'Béla Kovács', phone: '+36 30 987 6518' }],
  },
];

/** Registry name for the "mismatch" company differs from its profile. */
export const MISMATCH_REGISTRY_NAME = 'Euro Cargo Partners Holding a.s.';
