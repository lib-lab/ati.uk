// Registration (TZ screen 1): country, registration number, role, contact person and consent.
import type { AppState, Company, RegistryRecord, RegNumberType, Role, Verification } from '../types';
import { profileMatchesRecord } from './flags';

/** Countries of the pilot (as in the seed) and the registration numbers each accepts; the first is the default. */
export const REGISTRATION_COUNTRIES: { code: string; numberTypes: RegNumberType[] }[] = [
  { code: 'AT', numberTypes: ['VAT'] },
  { code: 'CZ', numberTypes: ['ICO', 'VAT'] },
  { code: 'DE', numberTypes: ['VAT'] },
  { code: 'EE', numberTypes: ['VAT'] },
  { code: 'HU', numberTypes: ['VAT'] },
  { code: 'LT', numberTypes: ['VAT'] },
  { code: 'LV', numberTypes: ['VAT'] },
  { code: 'NL', numberTypes: ['KVK', 'VAT'] },
  { code: 'PL', numberTypes: ['NIP', 'VAT'] },
  { code: 'SK', numberTypes: ['VAT'] },
];

export const ROLES: Role[] = ['shipper', 'carrier', 'forwarder'];

export interface RegistrationInput {
  country: string;
  regNumberType: RegNumberType;
  regNumber: string;
  legalName: string;
  role: Role;
  personName: string;
  personPhone: string;
  /** The contact person agrees to show their name and phone to companies that open the contact. */
  consent: boolean;
}

export type RegistrationField = keyof RegistrationInput;

/** Spaces, dots and dashes are formatting: "PL 525-123-45-61" and "PL5251234561" are one number. */
export function normalizeRegNumber(n: string): string {
  return n.replace(/[\s.\-/]/g, '').toUpperCase();
}

const PHONE = /^\+?[0-9][0-9 ()-]{5,}$/;

/** Field errors (i18n keys under "register.error."), empty when the input is complete. */
export function validateRegistration(input: RegistrationInput): Partial<Record<RegistrationField, string>> {
  const errors: Partial<Record<RegistrationField, string>> = {};
  const country = REGISTRATION_COUNTRIES.find((c) => c.code === input.country);
  if (!country) errors.country = 'required';
  else if (!country.numberTypes.includes(input.regNumberType)) errors.regNumberType = 'wrongType';
  const number = normalizeRegNumber(input.regNumber);
  if (!number) errors.regNumber = 'required';
  else if (!/^[A-Z0-9]{5,20}$/.test(number)) errors.regNumber = 'format';
  if (!input.legalName.trim()) errors.legalName = 'required';
  if (!ROLES.includes(input.role)) errors.role = 'required';
  if (!input.personName.trim()) errors.personName = 'required';
  if (!input.personPhone.trim()) errors.personPhone = 'required';
  else if (!PHONE.test(input.personPhone.trim())) errors.personPhone = 'format';
  if (!input.consent) errors.consent = 'consent';
  return errors;
}

/**
 * One company — one account: the number is taken if any company of that country has it,
 * including a deleted one (see DECISIONS "Registration").
 */
export function registeredCompany(state: Pick<AppState, 'companies'>, country: string, regNumber: string): Company | undefined {
  const n = normalizeRegNumber(regNumber);
  return state.companies.find((c) => c.country === country && normalizeRegNumber(c.regNumber) === n);
}

export function verificationOf(legalName: string, record: RegistryRecord | null, checkedAt: string): Verification {
  return { checkedAt, record, matchesProfile: record ? profileMatchesRecord(legalName, record.legalName) : false };
}

/** What the registration screen shows right away. */
export type RegistryOutcome = 'verified' | 'mismatch' | 'liquidated' | 'not_found' | 'unavailable';

export function registryOutcome(v: Verification): RegistryOutcome {
  if (!v.record) return 'not_found';
  if (v.record.status !== undefined && v.record.status !== 'active') return 'liquidated';
  if (!v.matchesProfile) return 'mismatch';
  return v.record.status === undefined ? 'unavailable' : 'verified';
}
