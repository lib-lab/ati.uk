import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { saveSubscription } from '../../domain/commands/subscriptions';
import { normalizeFilters } from '../../domain/rules/subscriptions';
import { CITIES } from '../../domain/geo/cities';
import { countVisible, hasPriority, searchListings } from '../../domain/rules/search';
import type { BodyType, ListingKind, LoadingMethod, SearchFilters, SortKey, SubscriptionFrequency } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { MarkBadges, ScoreChip } from '../components/OwnerSummary';
import { t } from '../i18n';
import { bodyText, dateText, distanceKm, fromName, ratePerKmText, rateText, toName, volumeText, weightText } from '../listingFormat';
import { getCompany, getRating } from '../selectors';

const BODY_TYPES: BodyType[] = ['tent', 'box', 'reefer', 'flatbed', 'tanker', 'container', 'tipper'];
const LOADING: LoadingMethod[] = ['top', 'side', 'rear'];
const SORTS: SortKey[] = ['loading_date', 'rate_per_km', 'rating', 'freshness'];
const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));

const num = (v: string) => (v === '' ? undefined : Number(v));
const dateIn = (v: string) => (v === '' ? undefined : `${v}T00:00:00.000Z`);
const dateOut = (iso?: string) => (iso ? iso.slice(0, 10) : '');

function toggle<T>(list: T[] | undefined, item: T): T[] {
  const current = list ?? [];
  return current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
}

export function SearchPage() {
  const state = useAppState((s) => s);
  const navigate = useNavigate();
  const actor = getCompany(state, state.actorId);
  // "Open in search" on the subscriptions page passes the saved filters.
  const location = useLocation();
  const initial = (location.state as { filters?: SearchFilters } | null)?.filters;
  const [filters, setFilters] = useState<SearchFilters>(initial ?? { kind: actor?.role === 'shipper' ? 'truck' : 'cargo' });
  const [sort, setSort] = useState<SortKey>('loading_date');
  const ratingOf = (id: string) => getRating(state, id);
  const results = useMemo(
    () => searchListings(state, filters, state.now, { sort, ratingOf: (id) => getRating(state, id) }),
    [state, filters, sort],
  );
  const totalOfKind = countVisible(state, filters.kind, state.now);

  const set = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
  // On narrow screens the filters fold behind one button (see styles: .filters.collapsed).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = Object.keys(normalizeFilters(filters)).filter((k) => k !== 'kind' && !k.endsWith('RadiusKm')).length;
  const weightLabel = filters.kind === 'cargo' ? t('search.weight') : t('search.capacity');

  return (
    <section>
      <div className="tabs" role="tablist">
        {(['cargo', 'truck'] as ListingKind[]).map((k) => (
          <button key={k} role="tab" aria-selected={filters.kind === k} className={filters.kind === k ? 'tab active' : 'tab'} onClick={() => setFilters({ kind: k })}>
            {t(`kind.${k}`)}
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-ghost filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((x) => !x)}>
        {t('search.filtersToggle', { count: activeFilters })} {filtersOpen ? '▴' : '▾'}
      </button>
      <div className={filtersOpen ? 'filters' : 'filters collapsed'}>
        <CityFilter id="from" label={t('search.from')} cityId={filters.fromCityId} radius={filters.fromRadiusKm}
          onChange={(cityId, radius) => set({ fromCityId: cityId, fromRadiusKm: radius })} />
        <CityFilter id="to" label={t('search.to')} cityId={filters.toCityId} radius={filters.toRadiusKm}
          onChange={(cityId, radius) => set({ toCityId: cityId, toRadiusKm: radius })} />
        <label>
          <span>{filters.kind === 'cargo' ? t('search.loadingDate') : t('search.availableDate')}</span>
          <span className="inline">
            <input id="f-dfrom" type="date" value={dateOut(filters.dateFrom)} onChange={(e) => set({ dateFrom: dateIn(e.target.value) })} />
            <input id="f-dto" type="date" value={dateOut(filters.dateTo)} onChange={(e) => set({ dateTo: dateIn(e.target.value) })} />
          </span>
        </label>
        <RangeFilter id="w" label={weightLabel} min={filters.weightMin} max={filters.weightMax}
          onChange={(min, max) => set({ weightMin: min, weightMax: max })} />
        <RangeFilter id="v" label={t('search.volume')} min={filters.volumeMin} max={filters.volumeMax}
          onChange={(min, max) => set({ volumeMin: min, volumeMax: max })} />
        <fieldset>
          <legend>{t('search.body')}</legend>
          <div className="chips">
            {BODY_TYPES.map((b) => (
              <Chip key={b} active={filters.bodyTypes?.includes(b) ?? false} onToggle={() => set({ bodyTypes: toggle(filters.bodyTypes, b) })}>
                {t(`body.${b}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('search.loading')}</legend>
          <div className="chips">
            {LOADING.map((m) => (
              <Chip key={m} active={filters.loadingMethods?.includes(m) ?? false} onToggle={() => set({ loadingMethods: toggle(filters.loadingMethods, m) })}>
                {t(`loading.${m}`)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <label>
          <span>{t('search.minRating')}</span>
          <input id="f-minrating" type="number" min={0} max={100} step={5} placeholder="0–100" title={t('search.minRatingHint')} value={filters.minRating ?? ''}
            onChange={(e) => set({ minRating: num(e.target.value) })} />
        </label>
        <label className="checkbox">
          <input id="f-onlyrated" type="checkbox" checked={filters.onlyRated ?? false} onChange={(e) => set({ onlyRated: e.target.checked || undefined })} />
          <span>{t('search.onlyRated')}</span>
        </label>
        <label className="checkbox">
          <input id="f-nored" type="checkbox" checked={filters.noRedFlags ?? false} onChange={(e) => set({ noRedFlags: e.target.checked || undefined })} />
          <span>{t('search.noRedFlags')}</span>
        </label>
        <button className="btn btn-ghost" onClick={() => setFilters({ kind: filters.kind })}>
          {t('search.clear')}
        </button>
      </div>

      <div className="results-head">
        <span className="muted small">{t('search.found', { count: results.length })}</span>
        <label className="inline small">
          <span className="muted">{t('search.sortBy')}</span>
          <select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map((k) => (
              <option key={k} value={k}>{t(`sort.${k}`)}</option>
            ))}
          </select>
          <span className="muted">{t('search.priorityFirst')}</span>
        </label>
        {actor && <SaveSubscription key={JSON.stringify(filters)} filters={filters} />}
      </div>

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
        <>
        <ul className="result-cards">
          {results.map((l) => {
            const owner = getCompany(state, l.ownerId)!;
            const rating = ratingOf(owner.id);
            const perKm = ratePerKmText(l);
            return (
              <li key={l.id} className="result-card clickable" onClick={() => navigate(`/listing/${l.id}`)}>
                <a className="result-card-route" href={`#/listing/${l.id}`} onClick={(e) => e.stopPropagation()}>
                  {fromName(l)} → {toName(l)}
                </a>
                <div className="result-card-facts small">
                  <span className="nowrap">{dateText(l)}</span>
                  <span>{bodyText(l)}</span>
                  <span className="nowrap">{weightText(l)}{volumeText(l) && ` · ${volumeText(l)}`}</span>
                  <span className="nowrap">{rateText(l)}{perKm && <span className="muted"> · {perKm}</span>}</span>
                </div>
                <div className="inline">
                  <ScoreChip rating={rating} />
                  <Link to={`/company/${owner.id}`} onClick={(e) => e.stopPropagation()}>{owner.legalName}</Link>
                </div>
                <div className="badges">
                  <MarkBadges rating={rating} company={owner} />
                  {hasPriority(l, state.now) && <span className="badge badge-accent">{t('listing.priority')}</span>}
                  {l.isOpen && <span className="badge badge-neutral">{t('listing.open')}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="table-wrap results-table">
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
                const rating = ratingOf(owner.id);
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
                    <td className="num nowrap">
                      {weightText(l)}
                      {volumeText(l) && <div className="muted small">{volumeText(l)}</div>}
                    </td>
                    <td className="num nowrap">
                      {rateText(l)}
                      {perKm && <div className="muted small">{perKm}</div>}
                    </td>
                    <td>
                      <div className="inline">
                        <ScoreChip rating={rating} />
                        <Link to={`/company/${owner.id}`} onClick={(e) => e.stopPropagation()}>{owner.legalName}</Link>
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
        </>
      )}
    </section>
  );
}

/** "Save as subscription": the current filters, one button (TZ). */
function SaveSubscription({ filters }: { filters: SearchFilters }) {
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('instant');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline small">
      <select id="sub-frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as SubscriptionFrequency)}>
        <option value="instant">{t('frequency.instant')}</option>
        <option value="hourly">{t('frequency.hourly')}</option>
      </select>
      <button className="btn btn-small" onClick={() => {
        const res = store.run((s) => saveSubscription(s, filters, frequency));
        setMessage(res.ok ? { ok: true, text: t('search.subscriptionSaved') } : { ok: false, text: t(`error.${res.error}`) });
      }}>{t('search.saveSubscription')}</button>
      {message && (
        <span className={message.ok ? 'muted' : 'field-error'}>
          {message.text} <Link to="/subscriptions">{t('search.manageSubscriptions')}</Link>
        </span>
      )}
    </span>
  );
}

function CityFilter(props: { id: string; label: string; cityId?: string; radius?: number; onChange: (cityId?: string, radius?: number) => void }) {
  return (
    <label>
      <span>{props.label}</span>
      <span className="inline">
        <select id={`f-${props.id}`} value={props.cityId ?? ''} onChange={(e) => props.onChange(e.target.value || undefined, props.radius)}>
          <option value="">{t('search.anyCity')}</option>
          {CITY_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>{c.name}, {c.country}</option>
          ))}
        </select>
        <input id={`f-${props.id}-radius`} type="number" min={0} step={50} placeholder={t('search.radius')} className="narrow"
          disabled={!props.cityId} value={props.radius ?? ''} onChange={(e) => props.onChange(props.cityId, num(e.target.value))} />
      </span>
    </label>
  );
}

function RangeFilter(props: { id: string; label: string; min?: number; max?: number; onChange: (min?: number, max?: number) => void }) {
  return (
    <label>
      <span>{props.label}</span>
      <span className="inline">
        <input id={`f-${props.id}min`} type="number" min={0} step={0.5} placeholder={t('search.min')} value={props.min ?? ''}
          onChange={(e) => props.onChange(num(e.target.value), props.max)} />
        <input id={`f-${props.id}max`} type="number" min={0} step={0.5} placeholder={t('search.max')} value={props.max ?? ''}
          onChange={(e) => props.onChange(props.min, num(e.target.value))} />
      </span>
    </label>
  );
}

function Chip(props: { active: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <label className={props.active ? 'chip active' : 'chip'}>
      <input type="checkbox" checked={props.active} onChange={props.onToggle} />
      {props.children}
    </label>
  );
}
