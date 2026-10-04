import { useState } from 'react';
import { requestHigherLimit } from '../../domain/commands/contacts';
import { deleteAccount, exportCompanyData, giveConsent, recordExport, withdrawConsent } from '../../domain/commands/privacy';
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!company) return <p className="muted">{t('account.notCompany')}</p>;

  const limit = dailyLimit(company);
  const used = openingsToday(state, company.id, state.now);

  const onExport = () => {
    const data = exportCompanyData(state, company.id);
    const json = JSON.stringify(data, null, 2);
    setExported(json);
    setCopied(false);
    store.run(recordExport);
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
      <button className="btn" onClick={onExport}>{t('account.export')}</button>
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
      {confirmDelete ? (
        <div className="inline">
          <span>{t('account.deleteConfirm')}</span>
          <button className="btn btn-danger" onClick={() => store.run(deleteAccount)}>{t('account.deleteYes')}</button>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>{t('contact.cancel')}</button>
        </div>
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>{t('account.delete')}</button>
      )}
    </section>
  );
}
