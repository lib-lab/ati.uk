import { describe, expect, it } from 'vitest';
import { addNotification, markAllRead, unreadCount } from './notifications';
import { emptyState } from './testing/fixtures';

describe('notifications', () => {
  it('adds, counts and marks read per company', () => {
    let s = emptyState();
    s = addNotification(s, 'a', 'refund', { amount: 500 });
    s = addNotification(s, 'a', 'listing_expired');
    s = addNotification(s, 'b', 'refund');
    expect(unreadCount(s, 'a')).toBe(2);
    s = markAllRead(s, 'a');
    expect(unreadCount(s, 'a')).toBe(0);
    expect(unreadCount(s, 'b')).toBe(1);
    expect(s.notifications.find((n) => n.companyId === 'a')?.readAt).toBe(s.now);
  });

  it('markAllRead returns the same state when nothing is unread', () => {
    const s = emptyState();
    expect(markAllRead(s, 'a')).toBe(s);
  });
});
