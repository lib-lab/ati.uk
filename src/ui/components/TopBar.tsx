import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { openContact } from '../../domain/commands/contacts';
import { loginAs } from '../../domain/commands/session';
import { advanceTime } from '../../domain/commands/time';
import { CONFIG } from '../../domain/config';
import { unreadCount } from '../../domain/notifications';
import { activePackage, findAccess, freeContactsLeft } from '../../domain/rules/contactAccess';
import { isExpired } from '../../domain/rules/lifetime';
import { balanceOf } from '../../domain/rules/ledger';
import { addDays, addHours, addMonths } from '../../domain/time';
import { MODERATOR_ID, type IsoDate } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDate, formatDateTime, formatMoney } from '../format';
import { t } from '../i18n';
import { APP_TIME_PROCESSES } from '../timeProcesses';
import { LanguageSwitch } from './LanguageSwitch';
import { ThemeSwitch } from './ThemeSwitch';

const SHIFTS: { key: string; to: (now: IsoDate) => IsoDate }[] = [
  { key: 'time.plusHour', to: (now) => addHours(now, 1) },
  { key: 'time.plusDay', to: (now) => addDays(now, 1) },
  { key: 'time.plusWeek', to: (now) => addDays(now, 7) },
  { key: 'time.plusSixMonths', to: (now) => addMonths(now, 6) },
];

const BOT_ATTEMPTS = 6;

/**
 * Test tool: the current company opens contacts of different owners in a row, straight from
 * the data (without viewing the cards) and without the human check — like a scraper would.
 * A failed human check does not stop it, so persisting signals lead to a block.
 */
function simulateBot(): string {
  const start = store.getState();
  const viewerId = start.actorId;
  const owners = new Set<string>();
  const targets = start.listings.filter((l) => {
    if (l.ownerId === viewerId || l.status !== 'active' || isExpired(l, start.now) || owners.has(l.ownerId)) return false;
    if (findAccess(start, viewerId, l.ownerId) || start.companies.find((c) => c.id === l.ownerId)?.status !== 'active') return false;
    owners.add(l.ownerId);
    return true;
  });
  let opened = 0;
  for (const l of targets.slice(0, BOT_ATTEMPTS)) {
    const res = store.run((s) => openContact(s, l.id, { viaCard: false }));
    if (res.ok) opened += 1;
    else if (res.error !== 'human_check_required') return t('topbar.botDone', { opened, error: t(`error.${res.error}`) });
  }
  return t('topbar.botAll', { opened });
}

export function TopBar() {
  const state = useAppState((s) => s);
  const actor = state.companies.find((c) => c.id === state.actorId);
  const unread = actor ? unreadCount(state, actor.id) : 0;
  const pendingComplaints = state.complaints.filter((c) => c.status === 'pending').length;

  // In-page confirmation: window.confirm() is not available in every host (e.g. embedded previews).
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [bot, setBot] = useState<{ actorId: string; text: string } | null>(null);
  // On narrow screens the test tools collapse into one line (see styles: .toolbar.collapsed).
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <header>
      <div className="topbar">
        <Link to="/" className="brand" title={t('app.homeHint')} aria-label={t('app.homeHint')}>
          <HomeIcon />
        </Link>
        <nav className="nav">
          <NavLink to="/search">{t('nav.search')}</NavLink>
          {actor && <NavLink to="/post">{t('nav.post')}</NavLink>}
          {actor && <NavLink to="/my-listings">{t('nav.myListings')}</NavLink>}
          {actor && <NavLink to="/balance">{t('nav.balance')}</NavLink>}
          {actor && <NavLink to="/subscriptions">{t('nav.subscriptions')}</NavLink>}
          {actor && <NavLink to="/account">{t('nav.account')}</NavLink>}
          {actor && (
            <NavLink to="/notifications">
              {t('nav.notifications')}
              {unread > 0 && <span className="counter">{unread}</span>}
            </NavLink>
          )}
          {state.actorId === MODERATOR_ID && (
            <NavLink to="/moderation">
              {t('nav.moderation')}
              {pendingComplaints > 0 && <span className="counter">{pendingComplaints}</span>}
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
              {(() => {
                const pkg = activePackage(state, actor.id, state.now);
                return pkg && (
                  <span>
                    <span className="muted">{t('topbar.package')}</span> {pkg.size - pkg.used}/{pkg.size}{' '}
                    <span className="muted">{t('topbar.packageUntil', { date: formatDate(pkg.validTo) })}</span>
                  </span>
                );
              })()}
            </>
          ) : (
            <span className="muted">{t('role.moderator')}</span>
          )}
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
      </div>

      <div className={toolsOpen ? 'toolbar' : 'toolbar collapsed'} aria-label={t('topbar.tools')}>
        <span className="toolbar-label">{t('topbar.tools')}</span>
        <button type="button" className="toolbar-toggle" aria-expanded={toolsOpen} onClick={() => setToolsOpen((x) => !x)}>
          <span className="toolbar-label-text">{t('topbar.tools')}</span>
          <span className="toolbar-summary">{actor ? actor.legalName : t('role.moderator')} · {formatDateTime(state.now)}</span>
          <span aria-hidden="true">{toolsOpen ? '▴' : '▾'}</span>
        </button>
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
            <button key={shift.key} className="btn btn-small" onClick={() => store.run((s) => advanceTime(s, shift.to(s.now), APP_TIME_PROCESSES))}>
              {t(shift.key)}
            </button>
          ))}
        </span>
        {actor && (
          <span className="inline">
            <button className="btn btn-small" title={t('topbar.botHint', { count: BOT_ATTEMPTS })} onClick={() => setBot({ actorId: state.actorId, text: simulateBot() })}>
              {t('topbar.bot')}
            </button>
            {bot?.actorId === state.actorId && <span className="small">{bot.text}</span>}
          </span>
        )}
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

// Geometry in the 24-unit viewBox; the size comes from styles (--icon-size), like the theme switch icons.
function HomeIcon() {
  return (
    <svg className="brand-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
