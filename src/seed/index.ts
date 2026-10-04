// Builds the initial AppState. Deterministic: same output on every reset.
import { CONFIG } from '../domain/config';
import { CITIES } from '../domain/geo/cities';
import { roadDistanceKm } from '../domain/geo/distance';
import { FLAG_LEVEL, flagKindsFromVerification, profileMatchesRecord } from '../domain/rules/flags';
import { computeExpiresAt } from '../domain/rules/lifetime';
import { addDays, addHours, daysBetween, fromMs, isBefore, startOfDay, toMs } from '../domain/time';
import {
  type AppState,
  type BodyType,
  type CargoListing,
  type Claim,
  type Company,
  type ContactAccess,
  type Flag,
  type IsoDate,
  type LedgerTransaction,
  type Listing,
  type LoadingMethod,
  type Rate,
  type RemovalReason,
  type Review,
  type TruckListing,
} from '../domain/types';
import { COMPANY_SPECS, type Archetype, type CompanySpec } from './companies';
import { createRng, type Rng } from './random';
import { buildRing, RING_SPECS } from './ring';
import { SEED_REGISTRY_RECORDS } from './registry';

export const STATE_VERSION = 4;
export const SEED_ACTIVE_CARGO = 60;
export const SEED_ACTIVE_TRUCKS = 30;

const CARGO_TYPES: { name: string; packaging: string; bodies: BodyType[] }[] = [
  { name: 'Palletised furniture', packaging: 'pallets', bodies: ['tent', 'box'] },
  { name: 'Steel coils', packaging: 'coils', bodies: ['flatbed', 'tent'] },
  { name: 'Frozen poultry', packaging: 'pallets', bodies: ['reefer'] },
  { name: 'Paper rolls', packaging: 'rolls', bodies: ['tent', 'box'] },
  { name: 'Building materials', packaging: 'pallets', bodies: ['flatbed', 'tent'] },
  { name: 'Consumer electronics', packaging: 'boxes', bodies: ['box'] },
  { name: 'Beverages', packaging: 'pallets', bodies: ['tent', 'box'] },
  { name: 'Grain', packaging: 'big bags', bodies: ['tent', 'tipper'] },
  { name: 'Car parts', packaging: 'crates', bodies: ['tent', 'box'] },
  { name: 'Textiles', packaging: 'boxes', bodies: ['box', 'tent'] },
  { name: 'Sand', packaging: 'loose', bodies: ['tipper'] },
  { name: 'Chemicals, non-hazardous', packaging: 'IBC', bodies: ['tent'] },
  { name: 'Sea container 40ft', packaging: 'container', bodies: ['container'] },
];

const TRUCK_BODIES: BodyType[] = ['tent', 'tent', 'tent', 'box', 'reefer', 'flatbed', 'tipper', 'container', 'tanker'];
const TRUCK_CAPACITIES = [1.5, 3.5, 5, 10, 20, 22, 24];
const COMMENTS = ['', '', '', 'Two drivers available', 'ADR not required', 'Loading by forklift', 'Call after 9:00', 'Pallet exchange'];

const REVIEW_TEXTS: Record<number, string[]> = {
  5: ['Excellent cooperation, on time.', 'Reliable partner, paid quickly.', 'Everything as agreed.'],
  4: ['Good job, minor delay.', 'Fine overall, would work again.'],
  3: ['Acceptable, communication could be better.', 'Average experience.'],
  2: ['Late loading, slow payment.', 'Several issues on the route.'],
  1: ['Did not pay on time, avoid.', 'Cargo not as described.'],
};

/** Reviews a company receives in the seed, per archetype: [count, star pool]. */
const REVIEW_PLAN: Record<Archetype, [number, number[]]> = {
  reliable: [11, [5, 5, 5, 4, 4, 5, 3]],
  average: [7, [3, 4, 4, 3, 5, 2]],
  newcomer: [0, []],
  newcomer_one_review: [1, [4]],
  open_claims: [6, [4, 3, 4, 2, 3]],
  mixed: [7, [2, 4, 5, 1, 3, 4]],
  liquidated: [5, [4, 3, 2]],
  mismatch: [0, []],
  linked: [0, []], // mutual reviews are added separately
  inactive: [6, [4, 5, 4]],
  blocked: [3, [1, 2, 1]],
  no_free_contacts: [5, [4, 5, 4, 3]],
  ring: [0, []], // built separately in ring.ts
};

/** Past (removed/expired) listings per archetype: [count, share removed as found_on_platform]. */
const HISTORY_PLAN: Record<Archetype, [number, number]> = {
  reliable: [14, 0.7],
  average: [8, 0.5],
  newcomer: [0, 0],
  newcomer_one_review: [2, 0.5],
  open_claims: [8, 0.4],
  mixed: [6, 0.3],
  liquidated: [4, 0.2],
  mismatch: [2, 0],
  linked: [2, 0.5],
  inactive: [8, 0.5],
  blocked: [3, 0],
  no_free_contacts: [6, 0.5],
  ring: [0, 0],
};

export interface SeedMeta {
  /** Company id → archetype note for the "log in as" switcher. */
  notes: Record<string, string>;
}

export const SEED_META: SeedMeta = {
  notes: Object.fromEntries([...COMPANY_SPECS, ...RING_SPECS].map((s) => [s.id, s.note])),
};

export function buildSeedState(): AppState {
  const now = CONFIG.clockStart;
  const rng = createRng(20261005);
  const counters = { listing: 0, access: 0, tx: 0, review: 0, claim: 0, flag: 0 };
  const nextId = (prefix: string, key: keyof typeof counters, pad: number) =>
    `${prefix}${String(++counters[key]).padStart(pad, '0')}`;

  // ----- companies -----
  const companies: Company[] = COMPANY_SPECS.map((s) => buildCompany(s, now));
  const specById = new Map(COMPANY_SPECS.map((s) => [s.id, s]));

  // ----- flags -----
  const flags: Flag[] = [];
  const addFlag = (companyId: string, kind: Flag['kind'], source: Flag['source'], createdAt: IsoDate, note?: string) =>
    flags.push({
      id: nextId('f', 'flag', 2), companyId, kind, level: FLAG_LEVEL[kind], source, createdAt, note,
      dueAt: kind === 'data_mismatch' ? addDays(createdAt, CONFIG.dataMismatchGraceDays) : undefined,
    });
  for (const c of companies) {
    for (const kind of flagKindsFromVerification(c.verification)) {
      // The mismatch was found 5 days ago: yellow "Clarify your data" for 9 more days, then red.
      const at = kind === 'data_mismatch' ? addDays(now, -5) : c.verification.checkedAt;
      addFlag(c.id, kind, 'registry', at);
    }
  }
  // c13/c14 share a device: no flag (TZ), their mutual reviews just weigh less.
  addFlag('c18', 'fraud_blocked', 'moderator', addDays(now, -15), 'Confirmed fraud: fake cargo listings');

  // ----- contact accesses (+ their payments) -----
  const accesses: ContactAccess[] = [];
  const debits: LedgerTransaction[] = [];
  const pairKey = (viewer: string, owner: string) => `${viewer}>${owner}`;
  const accessByPair = new Map<string, ContactAccess>();
  const ensureAccess = (viewerId: string, ownerId: string, openedAt: IsoDate, paidWith: ContactAccess['paidWith'] = 'balance') => {
    const existing = accessByPair.get(pairKey(viewerId, ownerId));
    if (existing) return existing;
    const access: ContactAccess = {
      id: nextId('a', 'access', 3), viewerId, ownerId, firstListingId: '', openedAt, paidWith,
    };
    if (paidWith === 'balance') {
      const tx: LedgerTransaction = {
        id: nextId('t', 'tx', 4), companyId: viewerId, type: 'contact', amount: -CONFIG.prices.contact,
        createdAt: openedAt, refId: access.id,
      };
      debits.push(tx);
      access.transactionId = tx.id;
    }
    accesses.push(access);
    accessByPair.set(pairKey(viewerId, ownerId), access);
    return access;
  };

  // ----- reviews -----
  const reviews: Review[] = [];
  const addReview = (authorId: string, targetId: string, stars: Review['stars'], createdAt: IsoDate) => {
    const openedAt = addDays(createdAt, -rng.int(1, 10));
    ensureAccess(authorId, targetId, openedAt);
    const id = nextId('r', 'review', 3);
    reviews.push({
      id, authorId, targetId, stars, createdAt,
      // Deterministic, without the PRNG: every fifth review is about the contact only (no deal).
      dealHappened: counters.review % 5 !== 0,
      text: rng.pick(REVIEW_TEXTS[stars] ?? ['']),
    });
  };

  for (const target of companies) {
    const spec = specById.get(target.id)!;
    const [count, pool] = REVIEW_PLAN[spec.archetype];
    if (count === 0) continue;
    const authors = rng
      .shuffle(companies.filter((a) => a.id !== target.id && !['c13', 'c14', 'c18'].includes(a.id)))
      .filter((a) => windowFor(a, target, now) !== null)
      .slice(0, count);
    for (const author of authors) {
      const [from, to] = windowFor(author, target, now)!;
      const at = fromMs(toMs(from) + rng.next() * (toMs(to) - toMs(from)));
      addReview(author.id, target.id, rng.pick(pool) as Review['stars'], at);
    }
  }
  // Linked accounts praise each other.
  addReview('c13', 'c14', 5, addDays(now, -40));
  addReview('c14', 'c13', 5, addDays(now, -39));
  // Replies on low reviews of reliable companies.
  for (const r of reviews) {
    if (r.stars <= 3 && specById.get(r.targetId)?.archetype === 'reliable') {
      r.reply = { text: 'Thank you, we have discussed this with the driver.', createdAt: addDays(r.createdAt, 2) };
    }
  }

  // ----- free contacts already used this month -----
  const monthStart = `${now.slice(0, 7)}-01T08:00:00.000Z`;
  for (const spec of COMPANY_SPECS) {
    const owners = rng.shuffle(companies.filter((o) => o.id !== spec.id && !accessByPair.has(pairKey(spec.id, o.id))));
    for (let i = 0; i < spec.freeUsedThisMonth; i++) {
      const openedAt = addHours(monthStart, rng.int(0, Math.max(0, Math.floor(daysBetween(monthStart, now) * 24) - 1)));
      ensureAccess(spec.id, owners[i]!.id, openedAt, 'free_quota');
    }
  }

  // ----- claims -----
  const claims: Claim[] = [];
  const addClaim = (claimantId: string, targetId: string, status: Claim['status'], daysAgo: number, text: string) => {
    const createdAt = addDays(now, -daysAgo);
    ensureAccess(claimantId, targetId, addDays(createdAt, -5));
    claims.push({
      id: nextId('cl', 'claim', 2), claimantId, targetId, text, status, createdAt,
      confirmedAt: status === 'confirmed' ? addDays(createdAt, 3) : undefined,
      resolvedAt: status === 'settled' || status === 'rejected' ? addDays(createdAt, 10) : undefined,
    });
  };
  addClaim('c03', 'c09', 'open', 20, 'Cargo delivered damaged, compensation not paid.');
  addClaim('c05', 'c09', 'open', 8, 'Truck did not arrive for loading, no notice.');
  addClaim('c02', 'c10', 'confirmed', 45, 'Freight not paid 45 days after delivery.');
  addClaim('c01', 'c16', 'settled', 120, 'Late payment.');
  addClaim('c10', 'c16', 'rejected', 60, 'Disputed waiting time charge.');
  addClaim('c09', 'c01', 'settled', 200, 'Invoice mismatch.');
  addClaim('c15', 'c18', 'open', 25, 'Paid deposit, truck never came.');
  addClaim('c03', 'c18', 'open', 40, 'Fake cargo offer, contact disappeared.'); // unconfirmed > 30 days: no longer counts

  // ----- listings -----
  const listings: Listing[] = [];
  const fees: LedgerTransaction[] = [];
  const cargoOwners = companies.filter((c) => c.role !== 'carrier');
  const truckOwners = companies.filter((c) => c.role !== 'shipper');
  const makeActive = (kind: Listing['kind'], owner: Company) => {
    const listing = makeListing(rng, kind, owner, specById.get(owner.id)!, now, true, nextId('l', 'listing', 3));
    const promote = owner.id !== 'c18';
    if (promote && kind === 'cargo' && rng.chance(0.12)) {
      listing.isOpen = true;
      fees.push({ id: nextId('t', 'tx', 4), companyId: owner.id, type: 'open_listing', amount: -CONFIG.prices.openListing, createdAt: listing.createdAt, refId: listing.id });
    }
    if (promote && rng.chance(0.12)) {
      listing.priorityUntil = listing.expiresAt;
      fees.push({ id: nextId('t', 'tx', 4), companyId: owner.id, type: 'priority', amount: -CONFIG.prices.priority, createdAt: listing.createdAt, refId: listing.id });
    }
    listings.push(listing);
  };
  // Every owner gets at least two active listings, the rest is random.
  for (const o of cargoOwners) for (let i = 0; i < 2; i++) makeActive('cargo', o);
  for (const o of truckOwners) for (let i = 0; i < 2; i++) makeActive('truck', o);
  const weighted = (owners: Company[]) =>
    owners.flatMap((o) => (['reliable', 'average'].includes(specById.get(o.id)!.archetype) ? [o, o, o] : [o]));
  const cargoPool = weighted(cargoOwners.filter((o) => o.id !== 'c11' && o.id !== 'c12'));
  const truckPool = weighted(truckOwners.filter((o) => o.id !== 'c18'));
  while (listings.filter((l) => l.kind === 'cargo').length < SEED_ACTIVE_CARGO) makeActive('cargo', rng.pick(cargoPool));
  while (listings.filter((l) => l.kind === 'truck').length < SEED_ACTIVE_TRUCKS) makeActive('truck', rng.pick(truckPool));

  // History: removed and expired listings (feed the "activity" rating component).
  for (const owner of companies) {
    const spec = specById.get(owner.id)!;
    const [count, foundShare] = HISTORY_PLAN[spec.archetype];
    for (let i = 0; i < count; i++) {
      const kind = owner.role === 'shipper' ? 'cargo' : owner.role === 'carrier' ? 'truck' : rng.pick(['cargo', 'truck'] as const);
      const l = makeListing(rng, kind, owner, spec, now, false, nextId('l', 'listing', 3));
      if (rng.chance(0.75) || !isBefore(l.expiresAt, now)) {
        l.status = 'removed';
        l.removedAt = addHours(l.createdAt, rng.int(6, 40));
        l.removalReason = rng.chance(foundShare) ? 'found_on_platform' : rng.pick<RemovalReason>(['found_elsewhere', 'not_relevant']);
      } else {
        l.status = 'expired';
      }
      listings.push(l);
    }
  }

  // Give each contact access a listing of its owner for context (first one found).
  for (const a of accesses) {
    a.firstListingId = listings.find((l) => l.ownerId === a.ownerId)?.id ?? '';
  }

  // ----- ledger: one initial top-up covering all seed debits + the target balance -----
  const transactions: LedgerTransaction[] = [];
  for (const c of companies) {
    const spec = specById.get(c.id)!;
    const spent = [...debits, ...fees].filter((t) => t.companyId === c.id).reduce((s, t) => s - t.amount, 0);
    const amount = spec.balanceEur * 100 + spent;
    if (amount > 0) {
      transactions.push({ id: nextId('t', 'tx', 4), companyId: c.id, type: 'topup', amount, createdAt: c.joinedAt });
    }
  }
  transactions.push(...debits, ...fees);

  // ----- closed ring of new companies (independent of the PRNG) -----
  const ringCompanies = RING_SPECS.map((spec) => buildCompany(spec, now));
  const ring = buildRing(now, (id) => ringCompanies.find((c) => c.id === id)!.joinedAt);
  companies.push(...ringCompanies);
  listings.push(...ring.listings);
  accesses.push(...ring.accesses);
  reviews.push(...ring.reviews);
  transactions.push(...ring.transactions);

  transactions.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));

  return {
    version: STATE_VERSION,
    now,
    actorId: 'c02',
    companies,
    listings,
    contactAccesses: accesses,
    transactions,
    packages: [],
    reviews,
    claims,
    complaints: [],
    flags,
    disputes: [],
    subscriptions: [],
    notifications: [],
    templates: [],
    events: [
      {
        id: 'e0001', at: now, type: 'data_reset', actor: 'system', subjectIds: [],
        reasonKey: 'event.seeded', params: { companies: companies.length, listings: listings.length },
      },
    ],
    seq: 10_000,
  };
}

function buildCompany(s: CompanySpec, now: IsoDate): Company {
  const record = SEED_REGISTRY_RECORDS.find((r) => r.country === s.country && r.regNumber === s.regNumber) ?? null;
  return {
    id: s.id,
    legalName: s.legalName,
    country: s.country,
    regNumber: s.regNumber,
    regNumberType: s.regNumberType,
    role: s.role,
    contactPersons: s.persons.map((p, i) => ({ id: `${s.id}-p${i + 1}`, ...p })),
    joinedAt: addDays(now, -Math.round(s.joinedMonthsAgo * 30.44)),
    lastLoginAt: addDays(now, -s.lastLoginDaysAgo),
    status: 'active',
    verification: {
      checkedAt: addDays(now, -1),
      record,
      matchesProfile: record ? profileMatchesRecord(s.legalName, record.legalName) : false,
    },
    listingsHiddenUntilContactConfirmed: false,
    deviceId: s.deviceId,
  };
}

/** Time window in which `author` could have reviewed `target`; null if too short. */
function windowFor(author: Company, target: Company, now: IsoDate): [IsoDate, IsoDate] | null {
  const from = addDays(toMs(author.joinedAt) > toMs(target.joinedAt) ? author.joinedAt : target.joinedAt, 14);
  const to = addDays(now, -2);
  return daysBetween(from, to) >= 7 ? [from, to] : null;
}

function makeListing(
  rng: Rng,
  kind: Listing['kind'],
  owner: Company,
  spec: CompanySpec,
  now: IsoDate,
  active: boolean,
  id: string,
): Listing {
  const from = rng.chance(0.6) ? rng.pick(spec.homeCities) : rng.pick(CITIES).id;
  let to = rng.pick(CITIES).id;
  while (to === from) to = rng.pick(CITIES).id;

  let createdAt: IsoDate;
  let dateFrom: IsoDate;
  if (active) {
    dateFrom = addHours(startOfDay(addDays(now, kind === 'cargo' ? rng.int(-1, 14) : rng.int(-3, 10))), 8);
    createdAt = addHours(now, -rng.int(1, 96));
  } else {
    // Past listings: within the company's active period (inactive companies stop at their last login).
    const end = isBefore(owner.lastLoginAt, addDays(now, -3)) ? owner.lastLoginAt : addDays(now, -3);
    const startCandidate = addDays(now, -180);
    const start = isBefore(owner.joinedAt, startCandidate) ? startCandidate : owner.joinedAt;
    const span = Math.max(0, toMs(end) - toMs(start));
    createdAt = fromMs(toMs(start) + rng.next() * span);
    dateFrom = addHours(startOfDay(addDays(createdAt, rng.int(1, 5))), 8);
  }
  if (toMs(createdAt) < toMs(owner.joinedAt)) createdAt = owner.joinedAt;

  const base = {
    id,
    ownerId: owner.id,
    contactPersonId: rng.pick(owner.contactPersons).id,
    from: { cityId: from, address: rng.chance(0.5) ? 'Industrial zone, gate 2' : undefined },
    createdAt,
    status: 'active' as const,
    isOpen: false,
    comment: rng.pick(COMMENTS) || undefined,
  };

  if (kind === 'cargo') {
    const type = owner.id === 'c15' && rng.chance(0.7) ? CARGO_TYPES[1]! : rng.pick(CARGO_TYPES);
    const dateTo = rng.chance(0.25) ? addDays(dateFrom, rng.int(1, 2)) : undefined;
    const weightT = Math.round((1 + rng.next() * 23) * 10) / 10;
    const listing: CargoListing = {
      ...base,
      kind: 'cargo',
      to: { cityId: to },
      dateFrom,
      dateTo,
      bodyTypes: type.bodies.length > 1 && rng.chance(0.5) ? [...type.bodies] : [type.bodies[0]!],
      weightT,
      volumeM3: rng.chance(0.7) ? Math.min(90, Math.round(weightT * (2 + rng.next() * 2))) : undefined,
      loadingMethods: loadingFor(rng, type.bodies[0]!),
      rate: rateFor(rng, from, to, 0.7),
      expiresAt: computeExpiresAt('cargo', dateFrom, dateTo),
      cargoName: type.name,
      packaging: type.packaging,
      pieces: type.packaging === 'loose' ? 1 : rng.int(1, 33),
    };
    return listing;
  }

  const body = rng.pick(TRUCK_BODIES);
  const anyDestination = rng.chance(0.3);
  const listing: TruckListing = {
    ...base,
    kind: 'truck',
    to: anyDestination ? { any: true } : { cityId: to },
    dateFrom,
    bodyTypes: [body],
    weightT: rng.pick(TRUCK_CAPACITIES),
    volumeM3: rng.chance(0.6) ? rng.int(20, 90) : undefined,
    loadingMethods: loadingFor(rng, body),
    rate: anyDestination ? { mode: 'on_request', currency: CONFIG.currency } : rateFor(rng, from, to, 0.5),
    expiresAt: computeExpiresAt('truck', dateFrom),
  };
  return listing;
}

function loadingFor(rng: Rng, body: BodyType): LoadingMethod[] {
  if (body !== 'tent') return ['rear'];
  const all: LoadingMethod[] = ['top', 'side', 'rear'];
  const picked = all.filter(() => rng.chance(0.6));
  return picked.length > 0 ? picked : ['rear'];
}

function rateFor(rng: Rng, from: string, to: string, fixedChance: number): Rate {
  if (!rng.chance(fixedChance)) return { mode: 'on_request', currency: CONFIG.currency };
  const perKm = 0.9 + rng.next() * 0.8;
  const amount = Math.max(150, Math.round((roadDistanceKm(from, to) * perKm) / 10) * 10) * 100;
  return {
    mode: 'fixed',
    amount,
    currency: CONFIG.currency,
    vatIncluded: rng.chance(0.5),
    paymentMethod: rng.pick(['bank_transfer', 'bank_transfer', 'bank_transfer', 'cash', 'card'] as const),
  };
}
