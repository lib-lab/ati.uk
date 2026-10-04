// In-app notifications. Producers (reminders, subscriptions, refunds...) call addNotification.
import { nextId } from './events';
import type { AppState, Id, NotificationType } from './types';

export function addNotification(
  state: AppState,
  companyId: Id,
  type: NotificationType,
  params: Record<string, string | number> = {},
): AppState {
  const [s, id] = nextId(state, 'n');
  return { ...s, notifications: [...s.notifications, { id, companyId, type, createdAt: s.now, params }] };
}

export function unreadCount(state: Pick<AppState, 'notifications'>, companyId: Id): number {
  return state.notifications.filter((n) => n.companyId === companyId && !n.readAt).length;
}

export function markAllRead(state: AppState, companyId: Id): AppState {
  if (unreadCount(state, companyId) === 0) return state;
  return {
    ...state,
    notifications: state.notifications.map((n) => (n.companyId === companyId && !n.readAt ? { ...n, readAt: state.now } : n)),
  };
}
