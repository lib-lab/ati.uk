import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CITIES } from '../../domain/geo/cities';
import { countVisible, hasPriority, searchListings } from '../../domain/rules/search';
import type { BodyType, ListingKind, SearchFilters } from '../../domain/types';
import { useAppState } from '../../store/store';
import { MarkBadges, ScoreChip } from '../components/OwnerSummary';
import { t } from '../i18n';
import { bodyText, dateText, distanceKm, fromName, ratePerKmText, rateText, toName } from '../listingFormat';
import { getCompany, getRating } from '../selectors';

const BODY_TYPES: BodyType[] = ['tent', 'box', 'reefer', 'flatbed', 'tanker', 'container', 'tipper'];
const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));

export function SearchPage() {
  const state = useAppState((s) => s);
  const navigate = useNavigate();
  const actor = getCompany(state, state.actorId);
  const [filters, setFilters] = useState<SearchFilters>({ kind: actor?.role === 'shipper' ? 'truck' : 'cargo' });
  const results = useMemo(() => searchListings(state, filters, state.now), [state, filters]);
  const totalOfKind = countVisible(state, filters.kind, state.now);

  const set = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const num = (v: string) => (v === '' ? undefined : Number(v));
  const toggleBody = (b: BodyType) => {
    const current = filters.bodyTypes ?? [];
    set({ bodyTypes: current.includes(b) ? current.filter((x) => x !== b) : [...current, b] });
  };

  return (
    <section>
      <div className="tabs" role="tablist">
        {(['cargo', 'truck'] as ListingKind[]).map((k) => (
          <button key={k} role="tab" aria-selected={filters.kind === k} className={filters.kind === k ? 'tab active' : 'tab'} onClick={() => setFilters({ kind: k })}>
            {t(`kind.${k}`)}
          </button>
        ))}
      </div>

      <div className="filters">
        <label>
          <span>{t('search.from')}</span>
          <select id="f-from" value={filters.fromCityId ?? ''} onChange={(e) => set({ fromCityId: e.target.value || undefined })}>
            <option value="">{t('search.anyCity')}</option>
            {CITY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}, {c.country}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('search.to')}</span>
          <select id="f-to" value={filters.toCityId ?? ''} onChange={(e) => set({ toCityId: e.target.value || undefined })}>
            <option value="">{t('search.anyCity')}</option>
            {CITY_OPTIONS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}, {c.country}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{filters.kind === 'cargo' ? t('search.weight') : t('search.capacity')}</span>
          <span className="inline">
            <input id="f-wmin" type="number" min={0} step={0.5} placeholder={t('search.min')} value={filters.weightMin ?? ''} onChange={(e) => set({ weightMin: num(e.target.value) })} />
            <input id="f-wmax" type="number" min={0} step={0.5} placeholder={t('search.max')} value={filters.weightMax ?? ''} onChange={(e) => set({ weightMax: num(e.target.value) })} />
          </span>
        </label>
        <fieldset>
          <legend>{t('search.body')}</legend>
          <div className="chips">
            {BODY_TYPES.map((b) => (
              <label key={b} className={filters.bodyTypes?.includes(b) ? 'chip active' : 'chip'}>
                <input type="checkbox" checked={filters.bodyTypes?.includes(b) ?? false} onChange={() => toggleBody(b)} />
                {t(`body.${b}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-ghost" onClick={() => setFilters({ kind: filters.kind })}>
          {t('search.clear')}
        </button>
      </div>

      <p className="muted small">
        {t('search.found', { count: results.length })} · {t('search.sortNote')}
      </p>

      {results.length === 0 ? (
        <div className="empty">
          {totalOfKind === 0 ? (
            <p>{t('search.emptyBoard')}</p>
          ) : (
            <>
              <p>{t('search.nothingFound')}</p>
              <p className="muted small">{t('search.nothingFoundHint')}</p>
            </>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table results">
            <thead>
              <tr>
                <th>{t('search.col.route')}</th>
                <th>{t('search.col.date')}</th>
                <th>{t('search.col.body')}</th>
                <th className="num">{t('search.col.weight')}</th>
                <th className="num">{t('search.col.rate')}</th>
                <th>{t('search.col.company')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((l) => {
                const owner = getCompany(state, l.ownerId)!;
                const rating = getRating(state, owner.id);
                const km = distanceKm(l);
                const perKm = ratePerKmText(l);
                return (
                  <tr key={l.id} className="clickable" onClick={() => navigate(`/listing/${l.id}`)}>
                    <td>
                      <a href={`#/listing/${l.id}`} onClick={(e) => e.stopPropagation()}>
                        {fromName(l)} → {toName(l)}
                      </a>
                      <div className="muted small">
                        {km !== null && t('listing.distanceApprox', { km })}
                        {hasPriority(l, state.now) && <span className="badge badge-accent">{t('listing.priority')}</span>}
                        {l.isOpen && <span className="badge badge-neutral">{t('listing.open')}</span>}
                      </div>
                    </td>
                    <td className="nowrap">{dateText(l)}</td>
                    <td>{bodyText(l)}</td>
                    <td className="num nowrap">{l.weightT} t</td>
                    <td className="num nowrap">
                      {rateText(l)}
                      {perKm && <div className="muted small">{perKm}</div>}
                    </td>
                    <td>
                      <div className="inline">
                        <ScoreChip rating={rating} />
                        <span>{owner.legalName}</span>
                      </div>
                      <div className="badges">
                        <MarkBadges rating={rating} company={owner} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
