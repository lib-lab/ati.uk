// Personal data (TZ): consent, export, account deletion, retention of the contact opening log.
// Legal texts are placeholders in the UI.
import { logEvent } from '../events';
import { retentionStart } from '../rules/collection';
import { isBefore } from '../time';
import type { AppState, Company, Id } from '../types';
import { MODERATOR_ID } from '../types';
import type { CommandResult } from './result';
import type { TimeProcess } from './time';

function ownCompany(state: AppState): Company | undefined {
  return state.companies.find((c) => c.id === state.actorId && c.status !== 'deleted');
}

/**
 * Export and deletion are confirmed by typing the company name (TZ). Case and surrounding
 * spaces do not matter; everything else must match the legal name.
 */
export function confirmsCompany(company: Pick<Company, 'legalName'>, typed: string): boolean {
  const norm = (x: string) => x.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return norm(typed) !== '' && norm(typed) === norm(company.legalName);
}

function setConsent(state: AppState, personId: Id, withdraw: boolean): CommandResult {
  const company = ownCompany(state);
  const person = company?.contactPersons.find((p) => p.id === personId);
  if (!company || !person) return { ok: false, error: 'not_allowed' };
  if (withdraw === !!person.consent.withdrawnAt) return { ok: true, state };
  const consent = withdraw ? { ...person.consent, withdrawnAt: state.now } : { givenAt: state.now };
  const s = {
    ...state,
    companies: state.companies.map((c) =>
      c.id === company.id ? { ...c, contactPersons: c.contactPersons.map((p) => (p.id === personId ? { ...p, consent } : p)) } : c,
    ),
  };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'consent_changed',
      actor: company.id,
      subjectIds: [company.id],
      reasonKey: withdraw ? 'event.consent.withdrawn' : 'event.consent.given',
      params: { company: company.id },
    }),
  };
}

/** The contact person withdraws consent: their data is no longer shown, even to those who opened it. */
export const withdrawConsent = (state: AppState, personId: Id) => setConsent(state, personId, true);
export const giveConsent = (state: AppState, personId: Id) => setConsent(state, personId, false);

/** Everything the platform keeps about the company (the export the TZ asks for). */
export function exportCompanyData(state: AppState, companyId: Id) {
  const company = state.companies.find((c) => c.id === companyId);
  if (!company) return null;
  const involves = (...ids: (Id | null | undefined)[]) => ids.includes(companyId);
  return {
    exportedAt: state.now,
    company,
    listings: state.listings.filter((l) => l.ownerId === companyId),
    listingChanges: state.listingChanges.filter((c) => state.listings.some((l) => l.id === c.listingId && l.ownerId === companyId)),
    contactAccesses: state.contactAccesses.filter((a) => involves(a.viewerId, a.ownerId)),
    contactOpenings: state.contactOpenings.filter((o) => involves(o.viewerId, o.ownerId)),
    transactions: state.transactions.filter((t) => t.companyId === companyId),
    reviewsWritten: state.reviews.filter((r) => r.authorId === companyId),
    reviewsReceived: state.reviews.filter((r) => r.targetId === companyId),
    claims: state.claims.filter((c) => involves(c.claimantId, c.targetId)),
    complaints: state.complaints.filter((c) => involves(c.reporterId, c.targetId)),
    flags: state.flags.filter((f) => f.companyId === companyId),
    disputes: state.disputes.filter((d) => d.companyId === companyId),
    subscriptions: state.subscriptions.filter((x) => x.companyId === companyId),
    templates: state.templates.filter((x) => x.companyId === companyId),
    notifications: state.notifications.filter((n) => n.companyId === companyId),
    events: state.events.filter((e) => e.actor === companyId || e.subjectIds.includes(companyId)),
  };
}

/** Confirms the export request; the UI shows exportCompanyData only after this succeeds. */
export function recordExport(state: AppState, confirmation: string): CommandResult {
  const company = ownCompany(state);
  if (!company) return { ok: false, error: 'not_allowed' };
  if (!confirmsCompany(company, confirmation)) return { ok: false, error: 'confirmation_mismatch' };
  return {
    ok: true,
    state: logEvent(state, { type: 'data_exported', actor: company.id, subjectIds: [company.id], reasonKey: 'event.data.exported', params: { company: company.id } }),
  };
}

/**
 * Deleting the account removes personal data (contact persons) and hides the company; reviews,
 * claims and rating events stay, linked to the company without a person's name (TZ).
 */
export function deleteAccount(state: AppState, confirmation: string): CommandResult {
  const company = ownCompany(state);
  if (!company) return { ok: false, error: 'not_allowed' };
  if (!confirmsCompany(company, confirmation)) return { ok: false, error: 'confirmation_mismatch' };
  let s: AppState = {
    ...state,
    actorId: MODERATOR_ID,
    companies: state.companies.map((c) => (c.id === company.id ? { ...c, status: 'deleted', deletedAt: state.now, contactPersons: [] } : c)),
    listings: state.listings.map((l) => (l.ownerId === company.id && l.status === 'active' ? { ...l, status: 'removed', removedAt: state.now } : l)),
    subscriptions: state.subscriptions.filter((x) => x.companyId !== company.id),
    templates: state.templates.filter((x) => x.companyId !== company.id),
  };
  s = logEvent(s, { type: 'account_deleted', actor: company.id, subjectIds: [company.id], reasonKey: 'event.account.deleted', params: { company: company.id } });
  return { ok: true, state: s };
}

/** Daily: opening log entries older than the retention period lose the viewer (TZ: 12 months). */
export const openingRetentionProcess: TimeProcess = {
  reasonKey: 'event.openings.anonymized',
  run(state, _from, to) {
    const start = retentionStart(to);
    const old = state.contactOpenings.filter((o) => o.viewerId !== null && isBefore(o.at, start));
    if (old.length === 0) return state;
    const ids = new Set(old.map((o) => o.id));
    const s = { ...state, contactOpenings: state.contactOpenings.map((o) => (ids.has(o.id) ? { ...o, viewerId: null, anonymizedAt: to } : o)) };
    return logEvent(s, { type: 'openings_anonymized', actor: 'system', subjectIds: [], reasonKey: 'event.openings.anonymized', params: { count: old.length } });
  },
};

/**
 * No automatic cleaning of review texts. A person of a deleted company asks the moderator, who
 * removes the text of one review; stars, date and weight stay, so the rating does not change.
 */
export function hideReviewText(state: AppState, reviewId: Id, requestedBy: Id): CommandResult {
  if (state.actorId !== MODERATOR_ID) return { ok: false, error: 'not_allowed' };
  const review = state.reviews.find((r) => r.id === reviewId);
  if (!review || review.textHidden) return { ok: false, error: 'not_found' };
  if (state.companies.find((c) => c.id === requestedBy)?.status !== 'deleted') return { ok: false, error: 'not_allowed' };
  const s = {
    ...state,
    reviews: state.reviews.map((r) => (r.id === reviewId ? { ...r, text: '', textHidden: { at: state.now, requestedBy } } : r)),
  };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'review_text_hidden',
      actor: MODERATOR_ID,
      subjectIds: [review.authorId, review.targetId, requestedBy],
      reasonKey: 'event.review.textHidden',
      params: { author: review.authorId, target: review.targetId, requestedBy },
    }),
  };
}
