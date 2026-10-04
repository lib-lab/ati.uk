import { Link } from 'react-router-dom';
import { markAllRead, unreadCount } from '../../domain/notifications';
import type { AppState, Notification } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDateTime } from '../format';
import { t } from '../i18n';
import { notificationText } from '../eventText';
import { getCompany } from '../selectors';

export function NotificationsPage() {
  const state = useAppState((s) => s);
  const actor = getCompany(state, state.actorId);
  if (!actor) return <p className="muted">{t('notifications.notCompany')}</p>;

  const items = state.notifications.filter((n) => n.companyId === actor.id).reverse();
  const unread = unreadCount(state, actor.id);

  return (
    <section>
      <h1>{t('notifications.title')}</h1>
      <div className="inline">
        <span className="muted">{t('notifications.unread', { count: unread })}</span>
        <button className="btn btn-small" disabled={unread === 0} onClick={() => store.run((s) => ({ ok: true, state: markAllRead(s, actor.id) }))}>
          {t('notifications.markRead')}
        </button>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <p>{t('notifications.empty')}</p>
          <p className="muted small">{t('notifications.emptyHint')}</p>
        </div>
      ) : (
        <ul className="list">
          {items.map((n) => (
            <li key={n.id} className={n.readAt ? 'list-item' : 'list-item unread'}>
              <span className="muted small nowrap">{formatDateTime(n.createdAt)}</span>
              <span>
                {notificationText(state, n)}
                <ListingLinks state={state} n={n} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Links to the listings a notification is about (subscriptions, reminders, changes). */
function ListingLinks({ state, n }: { state: AppState; n: Notification }) {
  const ids = [n.params.listing, ...String(n.params.listings ?? '').split(', ')]
    .filter((id): id is string => typeof id === 'string' && state.listings.some((l) => l.id === id));
  if (ids.length === 0) return null;
  return (
    <span className="inline small notification-links">
      {ids.map((id) => <Link key={id} to={`/listing/${id}`}>{t('notifications.openListing', { listing: id })}</Link>)}
    </span>
  );
}
