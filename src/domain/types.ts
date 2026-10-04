// Domain types for all entities. No React, no I/O.
// Money is stored in minor units (cents). Dates are ISO 8601 strings in UTC.

export type Id = string;
export type IsoDate = string;
export type Cents = number;

// ---------- Companies ----------

export type Role = 'shipper' | 'carrier' | 'forwarder';

export type RegNumberType = 'NIP' | 'VAT' | 'EIN' | 'INN' | 'ICO' | 'KVK';

export interface ContactPerson {
  id: Id;
  name: string;
  phone: string;
}

export type RegistryStatus = 'active' | 'liquidated' | 'bankrupt';

/** Snapshot of what the company registry returned (see adapters/registry). */
export interface RegistryRecord {
  country: string;
  regNumber: string;
  legalName: string;
  address: string;
  status: RegistryStatus;
  foundedAt: IsoDate;
  reportsFiled: boolean;
}

export interface Verification {
  checkedAt: IsoDate;
  /** null when the registry did not find the number. */
  record: RegistryRecord | null;
  /** Profile data (legal name) matches the registry record. */
  matchesProfile: boolean;
}

export type CompanyStatus = 'active' | 'deactivated';

/** Why a company's listings are hidden from search (if they are). */
export type ListingsHiddenReason = 'complaints' | 'blocked' | 'deactivated';

export interface Company {
  id: Id;
  legalName: string;
  country: string;
  regNumber: string;
  regNumberType: RegNumberType;
  role: Role;
  contactPersons: ContactPerson[];
  joinedAt: IsoDate;
  lastLoginAt: IsoDate;
  status: CompanyStatus;
  verification: Verification;
  /** Set by the 3-complaints-in-30-days rule; cleared when the owner confirms contact data. */
  listingsHiddenUntilContactConfirmed: boolean;
  /** Simulated device fingerprint, used by the linked-accounts detector. */
  deviceId: string;
}

// ---------- Listings ----------

export type ListingKind = 'cargo' | 'truck';

export type BodyType = 'tent' | 'box' | 'reefer' | 'flatbed' | 'tanker' | 'container' | 'tipper';

export type LoadingMethod = 'top' | 'side' | 'rear';

export type PaymentMethod = 'bank_transfer' | 'cash' | 'card';

export type RateMode = 'fixed' | 'on_request';

export interface Rate {
  /** Cargo: 'on_request' = "request a rate". Truck: 'on_request' = "negotiable". */
  mode: RateMode;
  amount?: Cents;
  currency: string;
  vatIncluded?: boolean;
  paymentMethod?: PaymentMethod;
}

export interface Place {
  cityId: Id;
  address?: string;
}

/** Truck destination may be "any". */
export type Destination = Place | { any: true };

export type ListingStatus = 'active' | 'expired' | 'removed';

export type RemovalReason = 'found_on_platform' | 'found_elsewhere' | 'not_relevant';

interface ListingBase {
  id: Id;
  ownerId: Id;
  contactPersonId: Id;
  from: Place;
  to: Destination;
  /** Loading date (cargo) or availability date (truck). */
  dateFrom: IsoDate;
  /** Optional end of the loading range (cargo only). */
  dateTo?: IsoDate;
  bodyTypes: BodyType[];
  weightT: number;
  volumeM3?: number;
  loadingMethods: LoadingMethod[];
  rate: Rate;
  comment?: string;
  createdAt: IsoDate;
  expiresAt: IsoDate;
  status: ListingStatus;
  removalReason?: RemovalReason;
  removedAt?: IsoDate;
  /** "Open" listing: contact visible to everyone for free. */
  isOpen: boolean;
  /** Priority placement valid until this moment. */
  priorityUntil?: IsoDate;
  reminderSentAt?: IsoDate;
}

export interface CargoListing extends ListingBase {
  kind: 'cargo';
  cargoName: string;
  packaging: string;
  pieces: number;
}

export interface TruckListing extends ListingBase {
  kind: 'truck';
}

export type Listing = CargoListing | TruckListing;

export interface RouteTemplate {
  id: Id;
  companyId: Id;
  kind: ListingKind;
  name: string;
  fields: Partial<Omit<Listing, 'id' | 'ownerId' | 'status' | 'createdAt' | 'expiresAt'>>;
}

// ---------- Contacts and money ----------

export type ContactPaidWith = 'free_quota' | 'package' | 'balance' | 'open_listing';

/** Viewer has access to the owner's contacts. One per (viewer, owner) pair, forever. */
export interface ContactAccess {
  id: Id;
  viewerId: Id;
  ownerId: Id;
  firstListingId: Id;
  openedAt: IsoDate;
  paidWith: ContactPaidWith;
  transactionId?: Id;
  /** Set when a confirmed complaint refunded this access. */
  refundedAt?: IsoDate;
}

export type TransactionType = 'topup' | 'contact' | 'refund' | 'open_listing' | 'priority' | 'package';

/** Ledger entry. Balance = sum of amounts. Debits are negative. */
export interface LedgerTransaction {
  id: Id;
  companyId: Id;
  type: TransactionType;
  amount: Cents;
  createdAt: IsoDate;
  /** Related entity: listing, contact access, complaint, package. */
  refId?: Id;
}

export interface ContactPackage {
  id: Id;
  companyId: Id;
  size: number;
  used: number;
  validFrom: IsoDate;
  validTo: IsoDate;
}

// ---------- Reputation ----------

export interface Review {
  id: Id;
  authorId: Id;
  targetId: Id;
  stars: 1 | 2 | 3 | 4 | 5;
  text: string;
  createdAt: IsoDate;
  reply?: { text: string; createdAt: IsoDate };
  /** Voided after confirmed review fraud; never counted again. */
  voided?: boolean;
}

export type ClaimStatus = 'open' | 'settled' | 'rejected';

/** Business dispute (non-payment, damage...). Affects the "claims" rating component. */
export interface Claim {
  id: Id;
  claimantId: Id;
  targetId: Id;
  text: string;
  status: ClaimStatus;
  createdAt: IsoDate;
  resolvedAt?: IsoDate;
}

export type ComplaintType = 'outdated' | 'no_response';
export type ComplaintStatus = 'pending' | 'confirmed' | 'rejected';

/** Complaint about a listing's data quality. Moderated. */
export interface Complaint {
  id: Id;
  reporterId: Id;
  listingId: Id;
  targetId: Id;
  type: ComplaintType;
  status: ComplaintStatus;
  createdAt: IsoDate;
  resolvedAt?: IsoDate;
  refundTransactionId?: Id;
}

export type FlagKind = 'liquidated' | 'data_mismatch' | 'fraud_blocked' | 'suspected_linked';
export type FlagLevel = 'red' | 'yellow';
export type FlagSource = 'registry' | 'moderator' | 'detector';

export interface Flag {
  id: Id;
  companyId: Id;
  kind: FlagKind;
  level: FlagLevel;
  source: FlagSource;
  createdAt: IsoDate;
  resolvedAt?: IsoDate;
  note?: string;
}

// ---------- Search, subscriptions, notifications ----------

export type SortKey = 'loading_date' | 'rate_per_km' | 'rating' | 'freshness';

export interface SearchFilters {
  kind: ListingKind;
  fromCityId?: Id;
  fromRadiusKm?: number;
  toCityId?: Id;
  toRadiusKm?: number;
  dateFrom?: IsoDate;
  dateTo?: IsoDate;
  bodyTypes?: BodyType[];
  weightMin?: number;
  weightMax?: number;
  volumeMin?: number;
  volumeMax?: number;
  loadingMethods?: LoadingMethod[];
  minRating?: number;
  noRedFlags?: boolean;
}

export type SubscriptionFrequency = 'instant' | 'hourly';

export interface Subscription {
  id: Id;
  companyId: Id;
  filters: SearchFilters;
  frequency: SubscriptionFrequency;
  createdAt: IsoDate;
  lastDigestAt?: IsoDate;
  /** Listings matched but not yet delivered (hourly digest). */
  pendingListingIds: Id[];
}

export type NotificationType =
  | 'subscription_match'
  | 'subscription_digest'
  | 'expiry_reminder'
  | 'listing_expired'
  | 'refund'
  | 'listings_hidden'
  | 'deactivated';

export interface Notification {
  id: Id;
  companyId: Id;
  type: NotificationType;
  createdAt: IsoDate;
  readAt?: IsoDate;
  /** i18n params; listing ids etc. */
  params: Record<string, string | number>;
}

// ---------- Rating ----------

export type RatingComponentKey = 'reviews' | 'verification' | 'claims' | 'activity';

export interface RatingComponent {
  key: RatingComponentKey;
  /** 0..100, or null when the component is not available (cold start). */
  value: number | null;
  /** Nominal weight from config. */
  weight: number;
  /** Weight after renormalisation over available components (0..1). */
  effectiveWeight: number;
}

export interface Rating {
  score: number;
  components: RatingComponent[];
  countedReviews: number;
  isNewMember: boolean;
  redFlags: Flag[];
  yellowFlags: Flag[];
}

// ---------- Event log ----------

export type EventType =
  | 'session_login'
  | 'contact_opened'
  | 'balance_topup'
  | 'payment'
  | 'refund'
  | 'rating_changed'
  | 'listing_created'
  | 'listing_expired'
  | 'listing_extended'
  | 'listing_removed'
  | 'complaint_filed'
  | 'complaint_resolved'
  | 'claim_filed'
  | 'claim_resolved'
  | 'review_posted'
  | 'flag_set'
  | 'flag_resolved'
  | 'company_deactivated'
  | 'company_reactivated'
  | 'time_shifted'
  | 'data_reset';

export interface EventLogEntry {
  id: Id;
  at: IsoDate;
  type: EventType;
  /** Company id, 'moderator' or 'system'. */
  actor: Id;
  subjectIds: Id[];
  /** i18n key of the human-readable reason. */
  reasonKey: string;
  params: Record<string, string | number>;
  /** Only for rating_changed. */
  rating?: { before: number; after: number; component?: RatingComponentKey };
}

// ---------- Whole state ----------

export const MODERATOR_ID = 'moderator';
export type ActorId = Id; // company id or MODERATOR_ID

export interface AppState {
  version: number;
  now: IsoDate;
  actorId: ActorId;
  companies: Company[];
  listings: Listing[];
  contactAccesses: ContactAccess[];
  transactions: LedgerTransaction[];
  packages: ContactPackage[];
  reviews: Review[];
  claims: Claim[];
  complaints: Complaint[];
  flags: Flag[];
  subscriptions: Subscription[];
  notifications: Notification[];
  templates: RouteTemplate[];
  events: EventLogEntry[];
  /** Monotonic counter for deterministic ids. */
  seq: number;
}
