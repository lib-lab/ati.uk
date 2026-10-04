import type { Cents, IsoDate } from '../domain/types';

export function formatMoney(amount: Cents, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, minimumFractionDigits: amount % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(amount / 100);
}

export function formatDate(d: IsoDate): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));
}

export function formatDateTime(d: IsoDate): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(d));
}
