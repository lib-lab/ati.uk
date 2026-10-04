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
  /** Work contact only (TZ: personal data). */
  phone: string;
  /** Consent to show the person's data; given at registration, can be withdrawn. */
  consent: { givenAt: IsoDate; withdrawnAt?: IsoDate };
}

export type RegistryStatus = 'active' | 'liquidated' | 'bankrupt';

/** Snapshot of what the company registry returned (see adapters/registry). */
export interface RegistryRecord {
  country: string;
  regNumber: string;
  legalName: string;
  address: string;
  /** Undefined when this country's registry does not report the status (the check is unavailable). */
  status?: RegistryStatus;
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

/** deactivated = hidden after inactivity; deleted = account deleted, personal data removed. */
export type CompanyStatus = 'active' | 'deactivated' | 'deleted';

/** Anti-collection state (TZ: "Against collecting contacts"). */
export interface CollectionGuard {
  state: 'ok' | 'slowed' | 'blocked';
  since: IsoDate;
  /** Signals that triggered the current state (i18n keys). */
  reasons: string[];
  /** Attempts while slowed without the human check; too many → blocked. */
  failedChecks: number;
  /**
   * When contacts were opened while slowed (for the hourly cap). Kept apart from the opening log,
   * so the openings that triggered the slowdown do not use up the cap.
   */
  openedWhileSlowed?: IsoDate[];
}

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
  /** Last time the owner confirmed contact data; complaints before it no longer count towards hiding. */
  contactConfirmedAt?: IsoDate;
  /** Sent 2 weeks before hiding an inactive company. */
  inactivityWarnedAt?: IsoDate;
  /** Raised daily limit of new contact openings (on request, for companies with history). */
  dailyOpenLimit?: number;
  collection?: CollectionGuard;
  deletedAt?: IsoDate;
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

/**
 * Each time a company reveals a contact on a listing (the first, paid opening or a later free one).
 * Used for change notifications and anti-collection signals; anonymised after the retention period.
 */
export interface ContactOpening {
  id: Id;
  /** null once anonymised. */
  viewerId: Id | null;
  ownerId: Id;
  listingId: Id;
  at: IsoDate;
  /** This opening created the contact access (and was paid for, unless free). */
  createdAccess: boolean;
  /** Opened from the listing card (false = direct request without viewing the card). */
  viaCard: boolean;
  anonymizedAt?: IsoDate;
}

/** One edit of a listing: visible history (TZ: "Change after a contact was opened"). */
export interface ListingChange {
  id: Id;
  listingId: Id;
  at: IsoDate;
  fields: { field: string; before: string; after: string }[];
  /** Route, dates, body, weight or rate changed. */
  key: boolean;
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
  /**
   * With a deal: the work. Without a deal: only the contact (listing up to date, responsive),
   * so "could not agree on the price" never hits an honest rate.
   */
  stars: 1 | 2 | 3 | 4 | 5;
  dealHappened: boolean;
  text: string;
  createdAt: IsoDate;
  reply?: { text: string; createdAt: IsoDate };
  /** Voided after confirmed review fraud; never counted again. */
  voided?: boolean;
  /**
   * The text was removed by the moderator at the request of a deleted company's person
   * (TZ "Personal data"); stars, date and weight stay.
   */
  textHidden?: { at: IsoDate; requestedBy: Id };
}

/** open = not confirmed yet (stops counting after 30 days); confirmed by the moderator counts until settled. */
export type ClaimStatus = 'open' | 'confirmed' | 'settled' | 'rejected';

/** Business dispute (non-payment, damage...). Affects the "claims" rating component. */
export interface Claim {
  id: Id;
  claimantId: Id;
  targetId: Id;
  text: string;
  status: ClaimStatus;
  createdAt: IsoDate;
  confirmedAt?: IsoDate;
  resolvedAt?: IsoDate;
  /** The accused company's answer (once). */
  reply?: { text: string; createdAt: IsoDate };
}

/** wrong_contact = objectively wrong data (the number does not exist). */
export type ComplaintType = 'outdated' | 'no_response' | 'wrong_contact';
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
  /** The company's answer before the decision. */
  response?: { text: string; createdAt: IsoDate };
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
  /** Closed ring: the other members (reviews inside the ring do not count while the flag is on). */
  relatedIds?: Id[];
  /** Data mismatch: yellow until this date, then red if not fixed. */
  dueAt?: IsoDate;
  escalatedAt?: IsoDate;
}

// ---------- Disputes ----------

export type DisputeSubject = 'event' | 'flag' | 'complaint' | 'claim';
export type DisputeStatus = 'open' | 'accepted' | 'rejected';

/** "Dispute" on a rating event, flag, complaint or claim; reviewed by the moderator. */
export interface Dispute {
  id: Id;
  companyId: Id;
  subjectType: DisputeSubject;
  subjectId: Id;
  text: string;
  status: DisputeStatus;
  createdAt: IsoDate;
  resolvedAt?: IsoDate;
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
  /** Applies only to companies with a rating (not new members). */
  minRating?: number;
  /** Only companies with a rating (3+ counted reviews), i.e. no new members. */
  onlyRated?: boolean;
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
  /** Listings already delivered: a listing is reported once per subscription, also after edits. */
  notifiedListingIds: Id[];
}

export type NotificationType =
  | 'subscription_match'
  | 'subscription_digest'
  | 'expiry_reminder'
  | 'listing_expired'
  | 'refund'
  | 'listings_hidden'
  | 'complaint_resolved'
  | 'complaint_received'
  | 'claim_received'
  | 'deactivated'
  | 'inactivity_warning'
  | 'flag_set'
  | 'flag_escalated'
  | 'dispute_resolved'
  | 'listing_changed'
  | 'collection_slowed'
  | 'collection_blocked';

export interface Notification {
  id: Id;
  companyId: Id;
  type: NotificationType;
  createdAt: IsoDate;
  readAt?: IsoDate;
  /** i18n params; listing ids etc. `variant` selects the text "notification.<type>.<variant>". */
  params: Record<string, string | number>;
  /** Set when the e-mail copy was handed to the mail channel (subscription notifications). */
  emailedAt?: IsoDate;
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
  | 'review_text_hidden'
  | 'subscription_saved'
  | 'subscription_deleted'
  | 'email_sent'
  | 'flag_set'
  | 'flag_resolved'
  | 'company_deactivated'
  | 'company_reactivated'
  | 'time_shifted'
  | 'data_reset'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'profile_updated'
  | 'company_registered'
  | 'listing_edited'
  | 'contact_collection'
  | 'consent_changed'
  | 'account_deleted'
  | 'data_exported'
  | 'openings_anonymized';

export interface ComponentChange {
  key: RatingComponentKey;
  /** Component value 0..100 or null when unavailable. */
  before: number | null;
  after: number | null;
  /** Change of the component's contribution to the score, in score points. */
  contributionDelta: number;
}

export interface RatingChange {
  before: number;
  after: number;
  /** Components whose value or availability changed. */
  components: ComponentChange[];
}

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
  rating?: RatingChange;
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
  contactOpenings: ContactOpening[];
  listingChanges: ListingChange[];
  transactions: LedgerTransaction[];
  packages: ContactPackage[];
  reviews: Review[];
  claims: Claim[];
  complaints: Complaint[];
  flags: Flag[];
  disputes: Dispute[];
  subscriptions: Subscription[];
  notifications: Notification[];
  templates: RouteTemplate[];
  events: EventLogEntry[];
  /** Monotonic counter for deterministic ids. */
  seq: number;
}
