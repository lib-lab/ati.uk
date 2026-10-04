import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { loginAs } from '../../domain/commands/session';
import { advanceTime } from '../../domain/commands/time';
import { CONFIG } from '../../domain/config';
import { unreadCount } from '../../domain/notifications';
import { freeContactsLeft } from '../../domain/rules/contactAccess';
import { balanceOf } from '../../domain/rules/ledger';
import { addDays, addMonths } from '../../domain/time';
import { MODERATOR_ID, type IsoDate } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDateTime, formatMoney } from '../format';
import { t } from '../i18n';

const SHIFTS: { key: string; to: (now: IsoDate) => IsoDate }[] = [
  { key: 'time.plusDay', to: (now) => addDays(now, 1) },
  { key: 'time.plusWeek', to: (now) => addDays(now, 7) },
  { key: 'time.plusSixMonths', to: (now) => addMonths(now, 6) },
];

export function TopBar() {
  const state = useAppState((s) => s);
  const actor = state.companies.find((c) => c.id === state.actorId);
  const unread = actor ? unreadCount(state, actor.id) : 0;

  // In-page confirmation: window.confirm() is not available in every host (e.g. embedded previews).
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <header>
      <div className="topbar">
        <Link to="/" className="brand">
          {t('app.title')} <span className="muted small">{t('app.prototypeBadge')}</span>
        </Link>
        <nav className="nav">
          <NavLink to="/search">{t('nav.search')}</NavLink>
          {actor && <NavLink to="/post">{t('nav.post')}</NavLink>}
          {actor && <NavLink to="/my-listings">{t('nav.myListings')}</NavLink>}
          {actor && <NavLink to="/balance">{t('nav.balance')}</NavLink>}
          {actor && (
            <NavLink to="/notifications">
              {t('nav.notifications')}
              {unread > 0 && <span className="counter">{unread}</span>}
            </NavLink>
          )}
          <NavLink to="/events">{t('nav.events')}</NavLink>
        </nav>
        <div className="topbar-account small">
          {actor ? (
            <>
              <span>
                <span className="muted">{t('topbar.balance')}</span> {formatMoney(balanceOf(state.transactions, actor.id))}
              </span>
              <span>
                <span className="muted">{t('topbar.freeContacts')}</span> {freeContactsLeft(state, actor.id, state.now)}/
                {CONFIG.freeContactsPerMonth}
              </span>
            </>
          ) : (
            <span className="muted">{t('role.moderator')}</span>
          )}
        </div>
      </div>

      <div className="toolbar" aria-label={t('topbar.tools')}>
        <span className="toolbar-label">{t('topbar.tools')}</span>
        <label className="inline">
          <span className="muted">{t('topbar.actingAs')}</span>
          <select id="actor" value={state.actorId} onChange={(e) => store.run((s) => loginAs(s, e.target.value))}>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legalName} · {t(`role.${c.role}`)}
              </option>
            ))}
            <option value={MODERATOR_ID}>{t('role.moderator')}</option>
          </select>
          <Link to="/companies" className="small">{t('nav.companies')}</Link>
        </label>
        <span className="inline">
          <span className="muted">{t('topbar.today')}</span>
          <strong className="nowrap">{formatDateTime(state.now)} UTC</strong>
          {SHIFTS.map((shift) => (
            <button key={shift.key} className="btn btn-small" onClick={() => store.run((s) => advanceTime(s, shift.to(s.now)))}>
              {t(shift.key)}
            </button>
          ))}
        </span>
        <span className="inline toolbar-end">
          {confirmingReset ? (
            <>
              {t('topbar.resetConfirm')}
              <button
                className="btn btn-small btn-primary"
                onClick={() => {
                  store.reset();
                  setConfirmingReset(false);
                }}
              >
                {t('topbar.resetYes')}
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => setConfirmingReset(false)}>
                {t('topbar.resetCancel')}
              </button>
            </>
          ) : (
            <button className="btn btn-small btn-ghost" onClick={() => setConfirmingReset(true)}>
              {t('topbar.reset')}
            </button>
          )}
        </span>
      </div>
    </header>
  );
}
