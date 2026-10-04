// Memoised read helpers for the UI. State objects are immutable, so caching by identity is safe.
import { computeRating } from '../domain/rules/rating';
import type { AppState, Company, Id, Rating } from '../domain/types';

const ratingCache = new WeakMap<AppState, Map<Id, Rating>>();

export function getRating(state: AppState, companyId: Id): Rating {
  let byId = ratingCache.get(state);
  if (!byId) {
    byId = new Map();
    ratingCache.set(state, byId);
  }
  let rating = byId.get(companyId);
  if (!rating) {
    rating = computeRating(state, companyId, state.now);
    byId.set(companyId, rating);
  }
  return rating;
}

export function getCompany(state: AppState, id: Id): Company | undefined {
  return state.companies.find((c) => c.id === id);
}
