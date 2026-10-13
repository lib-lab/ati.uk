import type { Cents, IsoDate } from '../domain/types';
import { getLanguage } from './i18n';

const LOCALES = { en: 'en-GB', ru: 'ru-RU' } as const;
const locale = () => LOCALES[getLanguage()];
// Russian dates come as "5 окт. 2026 г."; without "г." they read as well and do not clash with a full stop after them.
const tidy = (text: string) => (getLanguage() === 'ru' ? text.replace(/\s?г\./, '') : text);

/** A number with the decimal separator of the language; `digits` fixes the number of decimals. */
export function formatNumber(n: number, digits?: number): string {
  const options = digits === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: digits, maximumFractionDigits: digits };
  return new Intl.NumberFormat(locale(), { ...options, useGrouping: false }).format(n);
}

export function formatMoney(amount: Cents, currency = 'EUR'): string {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency, minimumFractionDigits: amount % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(amount / 100);
}

export function formatDate(d: IsoDate): string {
  return tidy(new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d)));
}

export function formatDateTime(d: IsoDate): string {
  return tidy(new Intl.DateTimeFormat(locale(), {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
  }).format(new Date(d)));
}
