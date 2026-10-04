import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteSubscription, setSubscriptionFrequency } from '../../domain/commands/subscriptions';
import type { Subscription, SubscriptionFrequency } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { filtersText } from '../filterText';
import { formatDate } from '../format';
import { t } from '../i18n';
import { getCompany } from '../selectors';

/** Saved searches of the current company (TZ: "Search and subscriptions"). */
export function SubscriptionsPage() {
  const state = useAppState((s) => s);
  const actor = getCompany(state, state.actorId);
  if (!actor || actor.status === 'deleted') return <p className="muted">{t('subscriptions.notCompany')}</p>;
  const subs = state.subscriptions.filter((x) => x.companyId === actor.id);

  return (
    <section>
      <h1>{t('subscriptions.title')}</h1>
      <p className="muted small">{t('subscriptions.hint')}</p>
      {subs.length === 0 ? (
        <div className="empty">
          <p>{t('subscriptions.empty')}</p>
          <p className="muted small">{t('subscriptions.emptyHint')} <Link to="/search">{t('nav.search')}</Link></p>
        </div>
      ) : (
        <ul className="list">{subs.map((x) => <SubscriptionItem key={x.id} sub={x} />)}</ul>
      )}
    </section>
  );
}

function SubscriptionItem({ sub }: { sub: Subscription }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="list-item review">
      <div>{filtersText(sub.filters)}</div>
      <div className="muted small">
        {t('subscriptions.saved', { date: formatDate(sub.createdAt) })} · {t('subscriptions.reported', { count: sub.notifiedListingIds.length })}
        {sub.pendingListingIds.length > 0 && ` · ${t('subscriptions.pending', { count: sub.pendingListingIds.length })}`}
      </div>
      <div className="inline">
        <select id={`freq-${sub.id}`} value={sub.frequency}
          onChange={(e) => store.run((s) => setSubscriptionFrequency(s, sub.id, e.target.value as SubscriptionFrequency))}>
          <option value="instant">{t('frequency.instant')}</option>
          <option value="hourly">{t('frequency.hourly')}</option>
        </select>
        <button className="btn btn-small" onClick={() => navigate('/search', { state: { filters: sub.filters } })}>{t('subscriptions.open')}</button>
        {confirming ? (
          <>
            <span className="small">{t('subscriptions.deleteConfirm')}</span>
            <button className="btn btn-small btn-danger" onClick={() => store.run((s) => deleteSubscription(s, sub.id))}>{t('subscriptions.deleteYes')}</button>
            <button className="btn btn-small btn-ghost" onClick={() => setConfirming(false)}>{t('contact.cancel')}</button>
          </>
        ) : (
          <button className="btn btn-small btn-ghost" onClick={() => setConfirming(true)}>{t('subscriptions.delete')}</button>
        )}
      </div>
    </li>
  );
}
