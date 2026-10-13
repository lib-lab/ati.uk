// Display helpers for listings.
import { getCity } from '../domain/geo/cities';
import { roadDistanceKm } from '../domain/geo/distance';
import { ratePerKm } from '../domain/rules/search';
import type { PublicListing as Listing } from '../domain/rules/contactPrivacy';
import { formatDate, formatMoney, formatNumber } from './format';
import { t } from './i18n';

export function fromName(l: Listing): string {
  return getCity(l.from.cityId).name;
}

export function toName(l: Listing): string {
  return 'any' in l.to ? t('search.anyDestination') : getCity(l.to.cityId).name;
}

export function distanceKm(l: Listing): number | null {
  return 'any' in l.to ? null : roadDistanceKm(l.from.cityId, l.to.cityId);
}

export function dateText(l: Listing): string {
  return l.dateTo ? `${formatDate(l.dateFrom)} – ${formatDate(l.dateTo)}` : formatDate(l.dateFrom);
}

export function rateText(l: Listing): string {
  if (l.rate.mode !== 'fixed' || l.rate.amount === undefined) {
    return l.kind === 'cargo' ? t('rate.onRequest') : t('rate.negotiable');
  }
  return formatMoney(l.rate.amount, l.rate.currency);
}

export function ratePerKmText(l: Listing): string | null {
  const perKm = ratePerKm(l);
  return perKm === null ? null : t('rate.perKm', { amount: formatMoney(Math.round(perKm), l.rate.currency) });
}

export function bodyText(l: Listing): string {
  return l.bodyTypes.map((b) => t(`body.${b}`)).join(', ');
}

export function weightText(l: Listing): string {
  return `${formatNumber(l.weightT)} ${t('unit.t')}`;
}

export function volumeText(l: Listing): string | null {
  return l.volumeM3 === undefined ? null : `${formatNumber(l.volumeM3)} ${t('unit.m3')}`;
}
