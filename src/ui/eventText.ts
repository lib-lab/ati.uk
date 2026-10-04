// Human-readable texts for stored events and notifications.
import type { AppState, EventLogEntry, Notification } from '../domain/types';
import { formatDateTime, formatMoney } from './format';
import { t } from './i18n';

type Params = Record<string, string | number>;

/** Company ids become names, `amount` (cents) becomes money, ISO dates become dates. */
export function readableParams(state: AppState, params: Params): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === 'amount' && typeof v === 'number') out[k] = formatMoney(v);
    else if (k === 'fields' && typeof v === 'string') out[k] = v.split(', ').map((f) => t(`listing.changeField.${f}`).toLowerCase()).join('; ');
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) out[k] = formatDateTime(v);
    else if (typeof v === 'string') out[k] = companyName(state, v) ?? v;
    else out[k] = v;
  }
  return out;
}

export function companyName(state: AppState, id: string): string | undefined {
  if (id === 'moderator') return t('role.moderator');
  if (id === 'system') return t('events.system');
  return state.companies.find((c) => c.id === id)?.legalName;
}

export function eventText(state: AppState, e: EventLogEntry): string {
  return t(e.reasonKey, readableParams(state, e.params));
}

export function notificationText(state: AppState, n: Notification): string {
  const key = n.params.variant ? `notification.${n.type}.${n.params.variant}` : `notification.${n.type}`;
  return t(key, readableParams(state, n.params));
}
