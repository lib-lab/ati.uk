// All tunable numbers in one place. Values marked [A] are assumptions,
// see docs/DECISIONS.md.

export const CONFIG = {
  currency: 'EUR', // [A] one currency per platform

  prices: {
    contact: 500, // [A] cents
    openListing: 1000, // [A]
    priority: 1500, // [A]
    package: { size: 20, days: 30, price: 7000 }, // [A]
  },

  freeContactsPerMonth: 3,

  lifetime: {
    cargoDaysAfterLoading: 1,
    truckDaysAfterAvailable: 3,
    reminderHoursBefore: 24,
  },

  rating: {
    weights: { reviews: 35, verification: 30, claims: 20, activity: 15 },
    newMemberReviewThreshold: 3,
    // Review weight = recency × contact cost × author × independence (see DECISIONS "Review weight").
    reviews: {
      oldAfterMonths: 12,
      oldWeight: 0.5,
      /** Neutral prior added to every average: a few low-weight reviews cannot reach the top. [A] */
      prior: { stars: 3, weight: 1 },
      /** How the contact was obtained. Free (open listing) or refunded contacts weigh less. [A] */
      contactCost: { balance: 1, package: 1, free_quota: 1, open_listing: 0.5, refunded: 0.5 },
      /** Author standing grows with tenure and activity (listings posted + contacts opened). [A] */
      author: { minWeight: 0.3, fullTenureMonths: 12, fullActivity: 20, tenureShare: 0.5 },
      /**
       * Independence: the group of a review A→B is A, B and their common review partners.
       * If the group is small and most of its members' interactions stay inside it, reviews
       * within the group weigh less. A shared IP/device lowers mutual reviews only. [A]
       */
      independence: { maxGroupSize: 6, closedShare: 0.8, groupWeight: 0.3, sharedDeviceMutualWeight: 0.3 },
    },
    verification: {
      // Checks that the registry provides; unavailable checks are left out (do not lower the score). [A]
      shares: { activeStatus: 0.5, profileMatch: 0.5 },
    },
    claims: {
      penaltyPerClaim: 25, // [A] per claim of full weight
      /** An open claim not confirmed by the moderator stops counting after this many days (TZ). */
      unconfirmedExpiryDays: 30,
    },
    activity: {
      availableAfterDays: 30, // [A]
      tenureShare: 0.5, // [A] the rest: contacts that later received reviews
      tenureFullMonths: 24, // [A]
      reviewedContactsFull: 10, // [A]
    },
  },

  reviews: { minDaysBetweenPerPair: 90 },

  complaints: {
    windowDays: 30,
    /** Hide listings when confirmed complaints / opened contacts in the window ≥ share and ≥ min count (TZ). */
    hideShare: 0.2,
    hideMinCount: 3,
    /** Refund for "does not answer": at least this many independent confirmed reporters (weighted). [A] */
    refundMinIndependentReporters: 2,
    /** Refunds per account per window. [A] */
    refundLimitPerWindow: 3,
    /** Reporters whose refunds / opened contacts exceed this share: their complaints weigh less. [A] */
    highRefundShare: 0.3,
    highRefundWeight: 0.5,
  },

  /** Registry mismatch: yellow "Clarify your data" for this many days, then red (TZ). */
  dataMismatchGraceDays: 14,

  /** Yellow flag only for a closed ring of companies without outside activity. [A] */
  detector: { ringMinSize: 3, ringClosedShare: 0.95 },

  /** Editing a key field within this many hours after a paid opening lets the viewer get a refund (TZ). */
  editRefundHours: 24,

  /** Against collecting contacts (TZ). [A] except the daily limit. */
  collection: {
    dailyOpenLimit: 50, // TZ starting value: new contact openings per company per calendar day
    raisedDailyOpenLimit: 150,
    /** "Company with history" for a raised limit without review. */
    historyMinMonths: 3,
    historyMinOpenings: 20,
    // signals
    burstCount: 10,
    burstMinutes: 5,
    noCardViewCount: 5,
    directionsCount: 15,
    signalWindowHours: 24,
    // response
    slowedPerHour: 5,
    failedChecksToBlock: 3,
    recoverHours: 24,
  },

  /** Contact opening log is anonymised after this many months (TZ starting value). */
  openingLogRetentionMonths: 12,

  /** Hidden from search after this many months without login; warning before (TZ). */
  inactivity: { hideAfterMonths: 6, warnDaysBefore: 14 },

  /** Straight-line distance multiplier to approximate road distance. [A] */
  roadFactor: 1.2,

  /** Start of the simulated clock; seed data is built relative to it. [A] */
  clockStart: '2026-10-05T09:00:00.000Z',
} as const;
