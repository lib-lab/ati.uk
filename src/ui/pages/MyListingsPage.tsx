import { useState } from 'react';
import { Link } from 'react-router-dom';
import { buyPriority, extendListing, makeListingOpen, removeListing } from '../../domain/commands/listings';
import { confirmContactData, respondToComplaint } from '../../domain/commands/moderation';
import { DisputeButton } from '../components/DisputeButton';
import type { CommandResult } from '../../domain/commands/result';
import { CONFIG } from '../../domain/config';
import { isExpired } from '../../domain/rules/lifetime';
import { hasPriority } from '../../domain/rules/search';
import type { AppState, Listing, RemovalReason } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDate, formatMoney } from '../format';
import { t } from '../i18n';
import { dateText, fromName, toName } from '../listingFormat';
import { getCompany } from '../selectors';

type Tab = 'active' | 'closed';
const REASONS: RemovalReason[] = ['found_on_platform', 'found_elsewhere', 'not_relevant'];

export function MyListingsPage() {
  const state = useAppState((s) => s);
  const owner = getCompany(state, state.actorId);
  const [tab, setTab] = useState<Tab>('active');
  if (!owner) return <p className="muted">{t('my.notCompany')}</p>;

  const own = state.listings.filter((l) => l.ownerId === owner.id);
  const active = own.filter((l) => l.status === 'active').sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const closed = own.filter((l) => l.status !== 'active').sort((a, b) => (b.removedAt ?? b.expiresAt).localeCompare(a.removedAt ?? a.expiresAt));
  const items = tab === 'active' ? active : closed;

  return (
    <section>
      <div className="inline page-title">
        <h1>{t('my.title')}</h1>
        <Link to="/post" className="btn btn-primary">{t('nav.post')}</Link>
      </div>
      {owner.listingsHiddenUntilContactConfirmed && (
        <div className="alert alert-yellow">
          {t('my.hiddenNotice')}{' '}
          <button className="btn btn-small" onClick={() => store.run(confirmContactData)}>{t('my.confirmContact')}</button>
        </div>
      )}
      <ComplaintsAboutMe state={state} companyId={owner.id} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'tab active' : 'tab'} onClick={() => setTab('active')}>
          {t('my.tab.active', { count: active.length })}
        </button>
        <button role="tab" aria-selected={tab === 'closed'} className={tab === 'closed' ? 'tab active' : 'tab'} onClick={() => setTab('closed')}>
          {t('my.tab.closed', { count: closed.length })}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty"><p>{tab === 'active' ? t('my.emptyActive') : t('my.emptyClosed')}</p></div>
      ) : (
        <ul className="list">
          {items.map((l) => <MyListingRow key={l.id} state={state} listing={l} />)}
        </ul>
      )}
    </section>
  );
}

type Mode = 'idle' | 'extend' | 'remove';

function MyListingRow({ state, listing: l }: { state: AppState; listing: Listing }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState<RemovalReason>('found_on_platform');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const expiredNow = l.status === 'active' && isExpired(l, state.now);
  const canPromote = l.status === 'active' && !expiredNow;
  const canExtend = l.status !== 'removed';

  const run = (cmd: (s: AppState) => CommandResult, okText: string) => {
    const res = store.run(cmd);
    setMessage(res.ok ? { ok: true, text: okText } : { ok: false, text: t(`error.${res.error}`) });
    if (res.ok) setMode('idle');
  };

  return (
    <li className="list-item my-listing">
      <div className="my-main">
        <Link to={`/listing/${l.id}`}>{fromName(l)} → {toName(l)}</Link>
        <span className="muted small"> · {t(`kind.${l.kind}.one`)} · {dateText(l)} · {l.weightT} t · {l.id}</span>
        <div className="badges">
          {l.status === 'active' && !expiredNow && <span className="badge badge-neutral">{t('my.activeUntil', { date: formatDate(l.expiresAt) })}</span>}
          {(l.status === 'expired' || expiredNow) && <span className="badge badge-yellow">{t('my.expired', { date: formatDate(l.expiresAt) })}</span>}
          {l.status === 'removed' && (
            <span className="badge badge-neutral">
              {t('my.removed', { date: formatDate(l.removedAt ?? l.expiresAt), reason: t(`removal.${l.removalReason}`) })}
            </span>
          )}
          {l.isOpen && <span className="badge badge-neutral">{t('listing.open')}</span>}
          {hasPriority(l, state.now) && (
            <span className="badge badge-accent">{t('my.priorityUntil', { date: formatDate(l.priorityUntil!) })}</span>
          )}
          {l.reminderSentAt && l.status === 'active' && <span className="badge badge-yellow">{t('my.expiresSoon')}</span>}
        </div>
      </div>

      <div className="my-actions">
        {canPromote && !l.isOpen && (
          <button className="btn btn-small" onClick={() => run((s) => makeListingOpen(s, l.id), t('my.openDone'))}>
            {t('my.makeOpen', { price: formatMoney(CONFIG.prices.openListing) })}
          </button>
        )}
        {canPromote && !hasPriority(l, state.now) && (
          <button className="btn btn-small" onClick={() => run((s) => buyPriority(s, l.id), t('my.priorityDone'))}>
            {t('my.priority', { price: formatMoney(CONFIG.prices.priority) })}
          </button>
        )}
        {l.status === 'active' && <Link to={`/edit/${l.id}`} className="btn btn-small">{t('listing.edit')}</Link>}
        {canExtend && mode !== 'extend' && (
          <button className="btn btn-small" onClick={() => { setMode('extend'); setMessage(null); }}>{t('my.extend')}</button>
        )}
        {l.status === 'active' && mode !== 'remove' && (
          <button className="btn btn-small btn-ghost" onClick={() => { setMode('remove'); setMessage(null); }}>{t('my.remove')}</button>
        )}
      </div>

      {mode === 'extend' && (
        <div className="inline my-form">
          <label className="inline small">
            <span className="muted">{l.kind === 'cargo' ? t('my.newLoadingDate') : t('my.newAvailableDate')}</span>
            <input type="date" min={state.now.slice(0, 10)} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          <button className="btn btn-small btn-primary"
            onClick={() => run((s) => extendListing(s, l.id, newDate ? `${newDate}T00:00:00.000Z` : undefined), t('my.extendDone'))}>
            {t('my.extendConfirm')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setMode('idle')}>{t('contact.cancel')}</button>
          <span className="muted small">{t('my.extendHint')}</span>
        </div>
      )}
      {mode === 'remove' && (
        <div className="inline my-form">
          <span className="small">{t('my.removeQuestion')}</span>
          {REASONS.map((r) => (
            <label key={r} className="checkbox small">
              <input type="radio" name={`reason-${l.id}`} checked={reason === r} onChange={() => setReason(r)} />
              <span>{t(`removal.${r}`)}</span>
            </label>
          ))}
          <button className="btn btn-small btn-primary" onClick={() => run((s) => removeListing(s, l.id, reason), t('my.removeDone'))}>
            {t('my.removeConfirm')}
          </button>
          <button className="btn btn-small btn-ghost" onClick={() => setMode('idle')}>{t('contact.cancel')}</button>
        </div>
      )}
      {message && (
        <p className={message.ok ? 'small muted' : 'alert alert-red'}>
          {message.text}
          {!message.ok && message.text === t('error.insufficient_funds') && <> <Link to="/balance">{t('contact.topUpLink')}</Link></>}
        </p>
      )}
    </li>
  );
}

/** Complaints about the owner's listings: answer before the decision, dispute after it (TZ). */
function ComplaintsAboutMe({ state, companyId }: { state: AppState; companyId: string }) {
  const items = state.complaints.filter((c) => c.targetId === companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (items.length === 0) return null;
  return (
    <>
      <h2>{t('my.complaints', { count: items.length })}</h2>
      <ul className="list">
        {items.map((c) => (
          <li key={c.id} className="list-item review">
            <div>
              <strong>{t(`complaintType.${c.type}`)}</strong> · <Link to={`/listing/${c.listingId}`}>{c.listingId}</Link>{' '}
              <span className="muted small">{formatDate(c.createdAt)}</span>{' '}
              <span className={`badge ${c.status === 'confirmed' ? 'badge-red' : 'badge-neutral'}`}>{t(`complaintStatus.${c.status}`)}</span>
            </div>
            {c.response && <div className="reply small"><span className="muted">{t('my.yourAnswer')}</span> {c.response.text}</div>}
            <div className="inline">
              {c.status === 'pending' && !c.response && <ComplaintAnswer id={c.id} />}
              <DisputeButton state={state} type="complaint" subjectId={c.id} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ComplaintAnswer({ id }: { id: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline reply-form">
      <input id={`answer-${id}`} placeholder={t('my.answerPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-small" onClick={() => {
        const res = store.run((s) => respondToComplaint(s, id, text));
        if (!res.ok) setError(t(`error.${res.error}`));
      }}>{t('my.answer')}</button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
