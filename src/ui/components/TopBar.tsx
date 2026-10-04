import { Link, NavLink } from 'react-router-dom';
import { loginAs } from '../../domain/commands/session';
import { balanceOf } from '../../domain/rules/ledger';
import { MODERATOR_ID } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDateTime, formatMoney } from '../format';
import { t } from '../i18n';

export function TopBar() {
  const state = useAppState((s) => s);
  const actor = state.companies.find((c) => c.id === state.actorId);

  const onReset = () => {
    if (window.confirm(t('topbar.resetConfirm'))) store.reset();
  };

  return (
    <header className="topbar">
      <Link to="/" className="brand">
        {t('app.title')} <span className="muted small">{t('app.prototypeBadge')}</span>
      </Link>
      <nav className="nav">
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
        <span className="small">
          <span className="muted">{t('topbar.today')}</span> {formatDateTime(state.now)} UTC
        </span>
        <button className="btn btn-ghost" onClick={onReset}>
          {t('topbar.reset')}
        </button>
      </div>
    </header>
  );
}
