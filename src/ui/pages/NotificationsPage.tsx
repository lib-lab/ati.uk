import { markAllRead, unreadCount } from '../../domain/notifications';
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
              <span>{notificationText(state, n)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
