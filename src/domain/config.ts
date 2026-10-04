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
      /** How the author got the contact. Free (open listing) or refunded contacts weigh less. [A] */
      contactCost: { balance: 1, package: 1, free_quota: 1, open_listing: 0.5, refunded: 0.5 },
      /** Author standing grows with tenure and activity (listings posted + contacts opened). [A] */
      author: { minWeight: 0.3, fullTenureMonths: 12, fullActivity: 20, tenureShare: 0.5 },
      /**
       * Independence: the group of a review A→B is A, B and their common review partners.
       * If the group is small and most of its members' interactions stay inside it, reviews
       * within the group weigh less. [A]
       */
      independence: { maxGroupSize: 6, closedShare: 0.8, groupWeight: 0.3 },
    },
    verification: {
      // shares inside the component, sum = 1  [A]
      activeStatus: 0.4,
      age: 0.25,
      reports: 0.15,
      profileMatch: 0.2,
      ageFullYears: 5,
      ageZeroYears: 1,
    },
    claims: { penaltyPerOpenClaim: 25 }, // [A]
    activity: {
      availableAfterDays: 30, // [A]
      tenure: 0.5,
      regularity: 0.3,
      foundShare: 0.2,
      tenureFullMonths: 24,
      regularityWindowDays: 90,
      regularityFullCount: 10,
      foundShareMinRemovals: 3,
    },
  },

  reviews: { minDaysBetweenPerPair: 90 },

  complaints: { hideThreshold: 3, windowDays: 30 },

  /**
   * Yellow flag only for strong signals: a device shared by different companies, or a closed
   * ring of new companies whose interactions stay inside the ring. [A]
   */
  detector: { ringMinSize: 3, ringNewMonths: 6, ringClosedShare: 0.95 },

  inactivity: { deactivateAfterMonths: 6 },

  /** Straight-line distance multiplier to approximate road distance. [A] */
  roadFactor: 1.2,

  /** Start of the simulated clock; seed data is built relative to it. [A] */
  clockStart: '2026-10-05T09:00:00.000Z',
} as const;
