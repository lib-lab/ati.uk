import { useState } from 'react';
import { requestHigherLimit } from '../../domain/commands/contacts';
import { confirmsCompany, deleteAccount, exportCompanyData, giveConsent, recordExport, withdrawConsent } from '../../domain/commands/privacy';
import { CONFIG } from '../../domain/config';
import { dailyLimit, hasHistory, openingsToday } from '../../domain/rules/collection';
import { hasConsent } from '../../domain/rules/contactPrivacy';
import { store, useAppState } from '../../store/store';
import { formatDate } from '../format';
import { t } from '../i18n';
import { getCompany } from '../selectors';

/** Account and personal data (TZ: "Personal data"). Legal texts are placeholders. */
export function AccountPage() {
  const state = useAppState((s) => s);
  const company = getCompany(state, state.actorId);
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Export and deletion are confirmed by typing the company name (TZ "Personal data").
  const [confirming, setConfirming] = useState<'export' | 'delete' | null>(null);
  const [typed, setTyped] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!company) return <p className="muted">{t('account.notCompany')}</p>;

  const limit = dailyLimit(company);
  const used = openingsToday(state, company.id, state.now);

  const startConfirm = (what: 'export' | 'delete') => {
    setConfirming(what);
    setTyped('');
    setConfirmError(null);
  };

  const onExport = () => {
    const res = store.run((s) => recordExport(s, typed));
    if (!res.ok) {
      setConfirmError(t(`error.${res.error}`));
      return;
    }
    setConfirming(null);
    const data = exportCompanyData(state, company.id);
    const json = JSON.stringify(data, null, 2);
    setExported(json);
    setCopied(false);
    // Also offer a file where the host allows downloads (embedded previews block them).
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${company.id}-data.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // the text area below is enough
    }
  };

  return (
    <section>
      <h1>{t('account.title')}</h1>
      <p className="muted">{company.legalName} · {company.regNumberType} {company.regNumber}</p>

      <h2>{t('account.persons')}</h2>
      <p className="muted small">{t('account.personsHint')}</p>
      <ul className="list">
        {company.contactPersons.map((p) => (
          <li key={p.id} className="list-item review">
            <div>
              <strong>{p.name}</strong> · <span className="selectable">{p.phone}</span>{' '}
              {hasConsent(p) ? (
                <span className="badge badge-ok">{t('account.consentGiven', { date: formatDate(p.consent.givenAt) })}</span>
              ) : (
                <span className="badge badge-yellow">{t('account.consentWithdrawn', { date: formatDate(p.consent.withdrawnAt!) })}</span>
              )}
            </div>
            <details className="small">
              <summary>{t('account.consentText')}</summary>
              <p className="muted">{t('account.legalStub')}</p>
            </details>
            <div>
              {hasConsent(p) ? (
                <button className="btn btn-small btn-ghost" onClick={() => store.run((s) => withdrawConsent(s, p.id))}>{t('account.withdraw')}</button>
              ) : (
                <button className="btn btn-small" onClick={() => store.run((s) => giveConsent(s, p.id))}>{t('account.give')}</button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h2>{t('account.limitTitle')}</h2>
      <p>
        {t('account.limit', { used, limit })}{' '}
        {limit < CONFIG.collection.raisedDailyOpenLimit && (
          <button className="btn btn-small" disabled={!hasHistory(state, company, state.now)} onClick={() => {
            const res = store.run(requestHigherLimit);
            setMessage(res.ok ? t('account.limitRaised', { limit: CONFIG.collection.raisedDailyOpenLimit }) : t(`error.${res.error}`));
          }}>{t('account.requestLimit', { limit: CONFIG.collection.raisedDailyOpenLimit })}</button>
        )}
      </p>
      <p className="muted small">
        {hasHistory(state, company, state.now)
          ? t('account.historyYes')
          : t('account.historyNo', { months: CONFIG.collection.historyMinMonths, openings: CONFIG.collection.historyMinOpenings })}
      </p>
      {company.collection && company.collection.state !== 'ok' && (
        <p className={company.collection.state === 'blocked' ? 'alert alert-red' : 'alert alert-yellow'}>
          {t(`account.collection.${company.collection.state}`, { perHour: CONFIG.collection.slowedPerHour })}{' '}
          {company.collection.reasons.map((r) => t(r)).join('; ')}
        </p>
      )}
      {message && <p className="alert alert-neutral">{message}</p>}

      <h2>{t('account.exportTitle')}</h2>
      <p className="muted small">{t('account.exportHint')}</p>
      {confirming === 'export' ? (
        <NameConfirm name={company.legalName} typed={typed} setTyped={setTyped} error={confirmError}
          action={t('account.export')} danger={false} onConfirm={onExport} onCancel={() => setConfirming(null)} />
      ) : (
        <button className="btn" onClick={() => startConfirm('export')}>{t('account.exportStart')}</button>
      )}
      {exported && (
        <div className="export">
          <button className="btn btn-small" onClick={() => {
            navigator.clipboard?.writeText(exported).then(() => setCopied(true), () => setCopied(false));
          }}>{copied ? t('account.copied') : t('account.copy')}</button>
          <textarea id="export-json" readOnly value={exported} />
        </div>
      )}

      <h2>{t('account.deleteTitle')}</h2>
      <p className="muted small">{t('account.deleteHint')}</p>
      {confirming === 'delete' ? (
        <NameConfirm name={company.legalName} typed={typed} setTyped={setTyped} error={confirmError}
          action={t('account.deleteYes')} danger note={t('account.deleteConfirm')}
          onConfirm={() => {
            const res = store.run((s) => deleteAccount(s, typed));
            if (!res.ok) setConfirmError(t(`error.${res.error}`));
          }}
          onCancel={() => setConfirming(null)} />
      ) : (
        <button className="btn btn-ghost" onClick={() => startConfirm('delete')}>{t('account.delete')}</button>
      )}
    </section>
  );
}

/** Confirmation step: type the company name. The button stays disabled until the name matches. */
function NameConfirm(props: {
  name: string;
  typed: string;
  setTyped: (v: string) => void;
  error: string | null;
  action: string;
  danger: boolean;
  note?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const matches = confirmsCompany({ legalName: props.name }, props.typed);
  return (
    <div className="name-confirm">
      {props.note && <p>{props.note}</p>}
      <label className="name-confirm-field">
        <span className="small">{t('account.typeName', { name: props.name })}</span>
        <input id="confirm-name" value={props.typed} autoComplete="off" onChange={(e) => props.setTyped(e.target.value)} />
      </label>
      <div className="inline">
        <button className={props.danger ? 'btn btn-danger' : 'btn btn-primary'} disabled={!matches} onClick={props.onConfirm}>{props.action}</button>
        <button className="btn btn-ghost" onClick={props.onCancel}>{t('contact.cancel')}</button>
      </div>
      {props.error && <p className="alert alert-red">{props.error}</p>}
    </div>
  );
}
