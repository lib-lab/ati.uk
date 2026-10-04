// Sends the e-mail copies of subscription notifications through the mail adapter, then records
// them in the domain (like a top-up: adapter first, then the command). The domain knows no adapters.
import type { EmailChannel } from '../adapters/notifications/EmailChannel';
import { recordEmailsSent } from '../domain/commands/subscriptions';
import { emailsDue } from '../domain/rules/subscriptions';
import type { AppState, Id, Notification } from '../domain/types';
import type { Store } from '../store/store';
import { notificationText } from './eventText';
import { t } from './i18n';

/** Companies have no e-mail field in the TZ data model; the prototype uses a placeholder address. */
export const emailAddress = (companyId: Id) => `notifications+${companyId}@freight-board.test`;

function subject(n: Notification): string {
  return n.type === 'subscription_match' ? t('email.subject.match', { route: n.params.route! }) : t('email.subject.digest', { count: n.params.count! });
}

export function startEmailDelivery(store: Store, email: EmailChannel): () => void {
  const inFlight = new Set<Id>();
  const deliver = () => {
    const state: AppState = store.getState();
    const due = emailsDue(state).filter((n) => !inFlight.has(n.id));
    if (due.length === 0) return;
    due.forEach((n) => inFlight.add(n.id));
    Promise.all(due.map((n) => email.send(emailAddress(n.companyId), subject(n), notificationText(state, n)))).then(
      () => {
        store.run((s) => recordEmailsSent(s, due.map((n) => n.id)));
        due.forEach((n) => inFlight.delete(n.id));
      },
      () => due.forEach((n) => inFlight.delete(n.id)), // retried on the next state change
    );
  };
  const unsubscribe = store.subscribe(deliver);
  deliver();
  return unsubscribe;
}
