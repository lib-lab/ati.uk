import { describe, expect, it } from 'vitest';
import { MockRegistry } from '../../adapters/registry/MockRegistry';
import { buildSeedState } from '../../seed';
import { SEED_REGISTRY_RECORDS } from '../../seed/registry';
import { CONFIG } from '../config';
import { activeFlags } from '../rules/flags';
import { registryOutcome, validateRegistration, type RegistrationInput } from '../rules/registration';
import { cargoDraft, company, emptyState, NOW } from '../testing/fixtures';
import { addDays, addHours } from '../time';
import type { AppState, RegistryRecord } from '../types';
import { postListing } from './listings';
import { changeRole, registerCompany, registryCheckProcess } from './registration';
import type { CommandResult } from './result';
import { advanceTime, TIME_PROCESSES } from './time';

const registry = new MockRegistry(SEED_REGISTRY_RECORDS);
const lookup = (country: string, n: string, name: string) => registry.lookupSync(country, n, name);
const ok = (r: CommandResult): AppState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const input = (overrides: Partial<RegistrationInput> = {}): RegistrationInput => ({
  country: 'PL', regNumberType: 'NIP', regNumber: '7011234562', legalName: 'Nowa Firma sp. z o.o.', role: 'carrier',
  personName: 'Jan Nowak', personPhone: '+48 600 100 200', consent: true, ...overrides,
});
const register = (s: AppState, i: RegistrationInput) => registerCompany(s, i, lookup(i.country, i.regNumber, i.legalName));
const newest = (s: AppState) => s.companies.at(-1)!;

describe('registration', () => {
  it('a regular number: verified, no flags; the new company becomes current, consent is dated', () => {
    const s = ok(register(emptyState(), input({ regNumber: '701-123-45-62' })));
    const c = newest(s);
    expect(c).toMatchObject({ legalName: 'Nowa Firma sp. z o.o.', regNumber: '7011234562', role: 'carrier', status: 'active', joinedAt: NOW });
    expect(c.contactPersons[0]!.consent).toEqual({ givenAt: NOW });
    expect(s.actorId).toBe(c.id);
    expect(registryOutcome(c.verification)).toBe('verified');
    expect(activeFlags(s.flags, c.id)).toEqual([]);
    expect(s.events.at(-1)?.reasonKey).toBe('event.company.registered');
  });

  it('registry outcomes by the stub: 9 → "Not recommended", 8 → "Clarify your data" for 14 days, 0 → not found', () => {
    const liquidated = ok(register(emptyState(), input({ regNumber: '7011234569' })));
    expect(registryOutcome(newest(liquidated).verification)).toBe('liquidated');
    expect(activeFlags(liquidated.flags, newest(liquidated).id)).toEqual([expect.objectContaining({ kind: 'liquidated', level: 'red', source: 'registry' })]);

    const mismatch = ok(register(emptyState(), input({ regNumber: '7011234568' })));
    expect(registryOutcome(newest(mismatch).verification)).toBe('mismatch');
    expect(activeFlags(mismatch.flags, newest(mismatch).id)).toEqual([
      expect.objectContaining({ kind: 'data_mismatch', level: 'yellow', dueAt: addDays(NOW, CONFIG.dataMismatchGraceDays) }),
    ]);

    const notFound = ok(register(emptyState(), input({ regNumber: '7011234560' })));
    expect(registryOutcome(newest(notFound).verification)).toBe('not_found');
    expect(activeFlags(notFound.flags, newest(notFound).id).map((f) => f.kind)).toEqual(['data_mismatch']);
  });

  it('one company — one account: a number already registered in the country is refused, however it is written', () => {
    const seed = buildSeedState();
    expect(register(seed, input({ regNumber: '525-123-45-61', legalName: 'Vistula Logistics sp. z o.o.' }))).toEqual({ ok: false, error: 'already_registered' });
    // the same number in another country is another company
    expect(register(seed, input({ country: 'CZ', regNumberType: 'ICO', regNumber: '5251234561' })).ok).toBe(true);
    // a deleted company's number stays taken
    const deleted = { ...seed, companies: seed.companies.map((c) => (c.id === 'c01' ? { ...c, status: 'deleted' as const } : c)) };
    expect(register(deleted, input({ regNumber: '5251234561' }))).toEqual({ ok: false, error: 'already_registered' });
  });

  it('consent and the required fields are checked', () => {
    expect(register(emptyState(), input({ consent: false }))).toEqual({ ok: false, error: 'consent_required' });
    expect(register(emptyState(), input({ personPhone: 'call me' }))).toEqual({ ok: false, error: 'invalid_registration' });
    expect(validateRegistration(input({ regNumberType: 'ICO' }))).toEqual({ regNumberType: 'wrongType' });
    expect(validateRegistration(input({ regNumber: '12', legalName: ' ', personName: '' }))).toEqual({ regNumber: 'format', legalName: 'required', personName: 'required' });
  });
});

describe('role change', () => {
  it('changes what the company can post from now on', () => {
    let s = ok(register(emptyState(), input({ role: 'carrier' })));
    const draft = { ...cargoDraft(), contactPersonId: `${newest(s).id}-p1` };
    expect(postListing(s, draft)).toEqual({ ok: false, error: 'role_cannot_post' });
    s = ok(changeRole(s, 'shipper'));
    expect(newest(s).role).toBe('shipper');
    expect(s.events.at(-1)?.reasonKey).toBe('event.profile.roleChanged');
    expect(postListing(s, draft).ok).toBe(true);
    expect(changeRole({ ...s, actorId: 'moderator' }, 'carrier')).toEqual({ ok: false, error: 'not_allowed' });
  });
});

describe('daily registry check', () => {
  const record = (overrides: Partial<RegistryRecord> = {}): RegistryRecord => ({
    country: 'PL', regNumber: 'REG-a', legalName: 'Company a', address: 'x', status: 'active', foundedAt: addDays(NOW, -4000), reportsFiled: true, ...overrides,
  });
  const run = (s: AppState, lookupFn: (c: string, n: string, name: string) => RegistryRecord | null, to = addDays(NOW, 1)) =>
    ok(advanceTime(s, to, [...TIME_PROCESSES, registryCheckProcess(lookupFn)]));

  it('liquidation → red flag; a mismatch → "Clarify your data"; fixed data closes the flag; only once a day', () => {
    const s0 = emptyState({ companies: [company('a')] });
    expect(run(s0, () => record({ status: 'liquidated' }), addHours(NOW, 3)).flags).toEqual([]); // same day: no check
    const liquidated = run(s0, () => record({ status: 'liquidated' }));
    expect(activeFlags(liquidated.flags, 'a')).toEqual([expect.objectContaining({ kind: 'liquidated', level: 'red', source: 'registry' })]);
    expect(liquidated.companies[0]!.verification.checkedAt).toBe(addDays(NOW, 1));

    const mismatch = run(s0, () => record({ legalName: 'Other name' }));
    expect(activeFlags(mismatch.flags, 'a').map((f) => f.kind)).toEqual(['data_mismatch']);
    const fixed = run(mismatch, () => record(), addDays(NOW, 2));
    expect(activeFlags(fixed.flags, 'a')).toEqual([]);
  });

  it('a registry flag removed by an accepted dispute is not set again', () => {
    let s = run(emptyState({ companies: [company('a')] }), () => record({ status: 'liquidated' }));
    const flag = activeFlags(s.flags, 'a')[0]!;
    s = {
      ...s,
      flags: s.flags.map((f) => (f.id === flag.id ? { ...f, resolvedAt: s.now } : f)),
      disputes: [{ id: 'd1', companyId: 'a', subjectType: 'flag', subjectId: flag.id, text: 'Registry error', status: 'accepted', createdAt: s.now, resolvedAt: s.now }],
    };
    s = run(s, () => record({ status: 'liquidated' }), addDays(NOW, 2));
    expect(activeFlags(s.flags, 'a')).toEqual([]);
  });

  it('the seed is stable under the check: a day later no registry flag appears or disappears', () => {
    const seed = buildSeedState();
    const before = seed.flags.filter((f) => !f.resolvedAt && f.source === 'registry').map((f) => `${f.companyId}:${f.kind}`);
    const after = run(seed, lookup);
    expect(after.flags.filter((f) => !f.resolvedAt && f.source === 'registry').map((f) => `${f.companyId}:${f.kind}`)).toEqual(before);
  });
});
