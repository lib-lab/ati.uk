import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adapters } from '../../adapters';
import { registerCompany } from '../../domain/commands/registration';
import { activeFlags } from '../../domain/rules/flags';
import {
  normalizeRegNumber, REGISTRATION_COUNTRIES, registryOutcome, ROLES, validateRegistration, type RegistrationField, type RegistrationInput,
} from '../../domain/rules/registration';
import type { Company, RegNumberType, Role } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDate } from '../format';
import { t } from '../i18n';

const EMPTY: RegistrationInput = {
  country: 'PL', regNumberType: 'NIP', regNumber: '', legalName: '', role: 'carrier', personName: '', personPhone: '', consent: false,
};

/** Registration (TZ screen 1): the registry result is shown right away. */
export function RegisterPage() {
  const state = useAppState((s) => s);
  const [form, setForm] = useState<RegistrationInput>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<RegistrationField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const set = (patch: Partial<RegistrationInput>) => setForm((f) => ({ ...f, ...patch }));
  const country = REGISTRATION_COUNTRIES.find((c) => c.code === form.country)!;

  const registered = registeredId ? state.companies.find((c) => c.id === registeredId) : undefined;
  if (registered) return <RegistryResult company={registered} />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateRegistration(form);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) return;
    setChecking(true);
    const record = await adapters.registry.lookup(form.country, normalizeRegNumber(form.regNumber), form.legalName.trim());
    setChecking(false);
    const res = store.run((s) => registerCompany(s, form, record));
    if (res.ok) setRegisteredId(res.state.actorId);
    else setError(res.error === 'already_registered' ? t('register.duplicate', { country: form.country }) : t(`error.${res.error}`));
  };
  const err = (field: RegistrationField) => errors[field] && <span className="field-error">{t(`register.error.${errors[field]}`)}</span>;

  return (
    <section>
      <h1>{t('register.title')}</h1>
      <p className="muted small">{t('register.testRegistry')}</p>
      <form className="form" onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>{t('register.section.company')}</legend>
          <label>
            <span>{t('register.country')} *</span>
            <select id="r-country" value={form.country}
              onChange={(e) => set({ country: e.target.value, regNumberType: REGISTRATION_COUNTRIES.find((c) => c.code === e.target.value)!.numberTypes[0]! })}>
              {REGISTRATION_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
            {err('country')}
          </label>
          <label>
            <span>{t('register.numberType')} *</span>
            <select id="r-type" value={form.regNumberType} onChange={(e) => set({ regNumberType: e.target.value as RegNumberType })}>
              {country.numberTypes.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            {err('regNumberType')}
          </label>
          <label>
            <span>{t('register.number')} *</span>
            <input id="r-number" value={form.regNumber} autoComplete="off" onChange={(e) => set({ regNumber: e.target.value })} />
            {err('regNumber')}
          </label>
          <label className="field-wide">
            <span>{t('register.legalName')} *</span>
            <input id="r-name" value={form.legalName} onChange={(e) => set({ legalName: e.target.value })} />
            {err('legalName')}
          </label>
          <label>
            <span>{t('register.role')} *</span>
            <select id="r-role" value={form.role} onChange={(e) => set({ role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)} — {t(`register.roleHint.${r}`)}</option>)}
            </select>
            {err('role')}
          </label>
        </fieldset>
        <fieldset>
          <legend>{t('register.section.person')}</legend>
          <label>
            <span>{t('register.personName')} *</span>
            <input id="r-person" value={form.personName} onChange={(e) => set({ personName: e.target.value })} />
            {err('personName')}
          </label>
          <label>
            <span>{t('register.personPhone')} *</span>
            <input id="r-phone" value={form.personPhone} placeholder="+48 600 000 000" onChange={(e) => set({ personPhone: e.target.value })} />
            {err('personPhone')}
          </label>
          <div className="field-wide">
            <label className="checkbox">
              <input id="r-consent" type="checkbox" checked={form.consent} onChange={(e) => set({ consent: e.target.checked })} />
              <span>{t('register.consent')} *</span>
            </label>
            <details className="small">
              <summary>{t('account.consentText')}</summary>
              <p className="muted">{t('account.legalStub')}</p>
            </details>
            {err('consent')}
          </div>
        </fieldset>
        <div className="inline">
          <button type="submit" className="btn btn-primary" disabled={checking}>{checking ? t('register.checking') : t('register.submit')}</button>
          <Link to="/companies">{t('contact.cancel')}</Link>
        </div>
        {error && <p className="alert alert-red">{error}</p>}
      </form>
    </section>
  );
}

function RegistryResult({ company }: { company: Company }) {
  const state = useAppState((s) => s);
  const outcome = registryOutcome(company.verification);
  const due = activeFlags(state.flags, company.id).find((f) => f.kind === 'data_mismatch')?.dueAt;
  const tone = outcome === 'liquidated' ? 'alert alert-red' : outcome === 'verified' || outcome === 'unavailable' ? 'alert alert-neutral' : 'alert alert-yellow';
  return (
    <section>
      <h1>{t('register.done', { name: company.legalName })}</h1>
      <p className={tone}>
        {t(`register.outcome.${outcome}`, { date: due ? formatDate(due) : '', registryName: company.verification.record?.legalName ?? '' })}
      </p>
      <p className="muted small">{t('register.loggedIn')}</p>
      <div className="inline">
        <Link className="btn" to={`/company/${company.id}`}>{t('register.openProfile')}</Link>
        <Link className="btn btn-ghost" to="/search">{t('nav.search')}</Link>
      </div>
    </section>
  );
}
