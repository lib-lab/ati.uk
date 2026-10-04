// Human-readable description of saved search filters (subscriptions page).
import { getCity } from '../domain/geo/cities';
import type { SearchFilters } from '../domain/types';
import { formatDate } from './format';
import { t } from './i18n';

function place(cityId: string, radius?: number): string {
  const name = getCity(cityId).name;
  return radius ? t('filters.radius', { city: name, km: radius }) : name;
}

function range(min: number | undefined, max: number | undefined, unit: string): string | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) return `${min}–${max} ${unit}`;
  return min !== undefined ? t('filters.atLeast', { value: `${min} ${unit}` }) : t('filters.atMost', { value: `${max} ${unit}` });
}

export function filtersText(f: SearchFilters): string {
  const parts: string[] = [t(`kind.${f.kind}`)];
  const from = f.fromCityId ? place(f.fromCityId, f.fromRadiusKm) : t('filters.anywhere');
  const to = f.toCityId ? place(f.toCityId, f.toRadiusKm) : t('filters.anywhere');
  parts.push(`${from} → ${to}`);
  if (f.dateFrom || f.dateTo) {
    parts.push(f.dateFrom && f.dateTo
      ? `${formatDate(f.dateFrom)} – ${formatDate(f.dateTo)}`
      : f.dateFrom ? t('filters.dateFrom', { date: formatDate(f.dateFrom) }) : t('filters.dateTo', { date: formatDate(f.dateTo!) }));
  }
  if (f.bodyTypes?.length) parts.push(f.bodyTypes.map((b) => t(`body.${b}`)).join(', '));
  const weight = range(f.weightMin, f.weightMax, 't');
  if (weight) parts.push(`${f.kind === 'cargo' ? t('filters.weight') : t('filters.capacity')} ${weight}`);
  const volume = range(f.volumeMin, f.volumeMax, 'm³');
  if (volume) parts.push(`${t('filters.volume')} ${volume}`);
  if (f.loadingMethods?.length) parts.push(`${t('filters.loading')} ${f.loadingMethods.map((m) => t(`loading.${m}`).toLowerCase()).join(', ')}`);
  if (f.minRating !== undefined) parts.push(t('filters.minRating', { min: f.minRating }));
  if (f.onlyRated) parts.push(t('filters.onlyRated'));
  if (f.noRedFlags) parts.push(t('filters.noRedFlags'));
  return parts.join(' · ');
}
