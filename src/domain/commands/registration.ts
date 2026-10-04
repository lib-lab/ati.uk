// Registration, role change and the daily registry check (TZ screen 1, "Official check").
// The registry itself is an adapter: the UI looks the number up and passes the record in; the
// daily check gets a synchronous lookup function from the composition root.
import { CONFIG } from '../config';
import { logEvent, nextId } from '../events';
import { activeFlags, flagKindsFromVerification } from '../rules/flags';
import { normalizeRegNumber, registeredCompany, validateRegistration, verificationOf, type RegistrationInput } from '../rules/registration';
import { addDays } from '../time';
import type { AppState, Company, FlagKind, RegistryRecord, Role } from '../types';
import { addFlag, closeFlag } from './moderation';
import type { CommandResult } from './result';
import type { TimeProcess } from './time';

/** Synchronous registry lookup for the daily check (the stub's lookupSync; see DECISIONS for a real registry). */
export type RegistryLookup = (country: string, regNumber: string, claimedName: string) => RegistryRecord | null;

/**
 * Registry flags follow the latest check: missing ones are set ("Clarify your data" with 14 days,
 * "Not recommended"), ones the registry no longer supports are closed. A registry flag removed by
 * an accepted dispute is not set again.
 */
function syncRegistryFlags(state: AppState, company: Company): AppState {
  const wanted = flagKindsFromVerification(company.verification);
  const current = activeFlags(state.flags, company.id).filter((f) => f.source === 'registry');
  const disputed = (kind: FlagKind) =>
    state.disputes.some(
      (d) => d.status === 'accepted' && d.subjectType === 'flag' && state.flags.some((f) => f.id === d.subjectId && f.companyId === company.id && f.kind === kind && f.source === 'registry'),
    );
  let s = state;
  for (const kind of wanted) {
    if (current.some((f) => f.kind === kind) || disputed(kind)) continue;
    s = addFlag(s, company.id, kind, 'registry', kind === 'data_mismatch' ? { dueAt: addDays(s.now, CONFIG.dataMismatchGraceDays) } : {});
  }
  for (const f of current) {
    if (!wanted.includes(f.kind)) s = closeFlag(s, f, 'system', `event.flag.resolved.${f.kind}`);
  }
  return s;
}

/**
 * A new company: the registry record comes from the adapter (null = not found). One number per
 * country; the contact person's consent is required. The new company becomes the current actor.
 */
export function registerCompany(state: AppState, input: RegistrationInput, record: RegistryRecord | null): CommandResult {
  if (Object.keys(validateRegistration(input)).length > 0) {
    return { ok: false, error: input.consent ? 'invalid_registration' : 'consent_required' };
  }
  if (registeredCompany(state, input.country, input.regNumber)) return { ok: false, error: 'already_registered' };
  const [s0, id] = nextId(state, 'c');
  const legalName = input.legalName.trim().replace(/\s+/g, ' ');
  const company: Company = {
    id,
    legalName,
    country: input.country,
    regNumber: normalizeRegNumber(input.regNumber),
    regNumberType: input.regNumberType,
    role: input.role,
    contactPersons: [{ id: `${id}-p1`, name: input.personName.trim(), phone: input.personPhone.trim(), consent: { givenAt: s0.now } }],
    joinedAt: s0.now,
    lastLoginAt: s0.now,
    status: 'active',
    verification: verificationOf(legalName, record, s0.now),
    listingsHiddenUntilContactConfirmed: false,
    deviceId: `dev-${id}`,
  };
  let s: AppState = { ...s0, companies: [...s0.companies, company], actorId: id };
  s = logEvent(s, {
    type: 'company_registered',
    actor: id,
    subjectIds: [id],
    reasonKey: 'event.company.registered',
    params: { company: id, role: input.role },
  });
  s = syncRegistryFlags(s, company);
  return { ok: true, state: s };
}

/** The company changes its role in its profile; it decides what the company can post from now on. */
export function changeRole(state: AppState, role: Role): CommandResult {
  const company = state.companies.find((c) => c.id === state.actorId && c.status !== 'deleted');
  if (!company) return { ok: false, error: 'not_allowed' };
  if (company.role === role) return { ok: true, state };
  const s = { ...state, companies: state.companies.map((c) => (c.id === company.id ? { ...c, role } : c)) };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'profile_updated',
      actor: company.id,
      subjectIds: [company.id],
      reasonKey: 'event.profile.roleChanged',
      params: { target: company.id, from: company.role, to: role },
    }),
  };
}

/**
 * Daily registry check (once per day boundary crossed): liquidation → red flag, mismatch or
 * "not found" → "Clarify your data". Deleted companies are not checked.
 */
export function registryCheckProcess(lookup: RegistryLookup): TimeProcess {
  return {
    reasonKey: 'event.rating.registryCheck',
    run(state, from, to) {
      if (from.slice(0, 10) === to.slice(0, 10)) return state;
      let s = state;
      for (const c of state.companies) {
        if (c.status === 'deleted') continue;
        const record = lookup(c.country, c.regNumber, c.legalName);
        const checked: Company = { ...c, verification: verificationOf(c.legalName, record, to) };
        s = { ...s, companies: s.companies.map((x) => (x.id === c.id ? checked : x)) };
        s = syncRegistryFlags(s, checked);
      }
      return s;
    },
  };
}

