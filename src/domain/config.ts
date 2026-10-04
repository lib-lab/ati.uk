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
    reviews: {
      oldAfterMonths: 12,
      oldWeight: 0.5,
      highRatedAuthorScore: 70, // [A]
      highRatedAuthorWeight: 1.5, // [A]
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

  /** Linked-accounts detector: reciprocal top marks within a few days are suspicious. [A] */
  detector: { praiseStars: 5, mutualWithinDays: 7 },

  inactivity: { deactivateAfterMonths: 6 },

  /** Straight-line distance multiplier to approximate road distance. [A] */
  roadFactor: 1.2,

  /** Start of the simulated clock; seed data is built relative to it. [A] */
  clockStart: '2026-10-05T09:00:00.000Z',
} as const;
