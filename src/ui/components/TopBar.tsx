import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { loginAs } from '../../domain/commands/session';
import { CONFIG } from '../../domain/config';
import { freeContactsLeft } from '../../domain/rules/contactAccess';
import { balanceOf } from '../../domain/rules/ledger';
import { MODERATOR_ID } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDateTime, formatMoney } from '../format';
import { t } from '../i18n';

export function TopBar() {
  const state = useAppState((s) => s);
  const actor = state.companies.find((c) => c.id === state.actorId);

  // In-page confirmation: window.confirm() is not available in every host (e.g. embedded previews).
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        {t('app.title')} <span className="muted small">{t('app.prototypeBadge')}</span>
      </Link>
      <nav className="nav">
        <NavLink to="/search">{t('nav.search')}</NavLink>
        <NavLink to="/companies">{t('nav.companies')}</NavLink>
      </nav>
      <div className="topbar-tools">
        <label className="inline">
          <span className="muted small">{t('topbar.actingAs')}</span>
          <select value={state.actorId} onChange={(e) => store.run((s) => loginAs(s, e.target.value))}>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} · {t(`role.${c.role}`)}
              </option>
            ))}
            <option value={MODERATOR_ID}>{t('role.moderator')}</option>
          </select>
        </label>
        {actor && (
          <span className="small">
            <span className="muted">{t('topbar.balance')}</span> {formatMoney(balanceOf(state.transactions, actor.id))}
          </span>
        )}
        {actor && (
          <span className="small">
            <span className="muted">{t('topbar.freeContacts')}</span> {freeContactsLeft(state, actor.id, state.now)}/
            {CONFIG.freeContactsPerMonth}
          </span>
        )}
        <span className="small">
          <span className="muted">{t('topbar.today')}</span> {formatDateTime(state.now)} UTC
        </span>
        {confirmingReset ? (
          <span className="inline small">
            {t('topbar.resetConfirm')}
            <button
              className="btn btn-primary"
              onClick={() => {
                store.reset();
                setConfirmingReset(false);
              }}
            >
              {t('topbar.resetYes')}
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmingReset(false)}>
              {t('topbar.resetCancel')}
            </button>
          </span>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmingReset(true)}>
            {t('topbar.reset')}
          </button>
        )}
      </div>
    </header>
  );
}
