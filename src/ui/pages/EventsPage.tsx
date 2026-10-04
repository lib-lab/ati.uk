import { useMemo, useState } from 'react';
import type { EventType } from '../../domain/types';
import { useAppState } from '../../store/store';
import { formatDateTime } from '../format';
import { t } from '../i18n';
import { companyName, eventText } from '../eventText';

const PAGE = 200;

export function EventsPage() {
  const state = useAppState((s) => s);
  const [type, setType] = useState<EventType | ''>('');
  const [companyId, setCompanyId] = useState('');

  const types = useMemo(() => [...new Set(state.events.map((e) => e.type))].sort(), [state.events]);
  const filtered = useMemo(
    () =>
      state.events
        .filter((e) => (!type || e.type === type) && (!companyId || e.actor === companyId || e.subjectIds.includes(companyId)))
        .reverse(),
    [state.events, type, companyId],
  );

  return (
    <section>
      <h1>{t('events.title')}</h1>
      <p className="muted">{t('events.hint')}</p>
      <div className="filters">
        <label>
          <span>{t('events.type')}</span>
          <select id="ev-type" value={type} onChange={(e) => setType(e.target.value as EventType | '')}>
            <option value="">{t('events.allTypes')}</option>
            {types.map((x) => (
              <option key={x} value={x}>{t(`eventType.${x}`)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>{t('events.company')}</span>
          <select id="ev-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">{t('events.allCompanies')}</option>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>{c.legalName}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">{t('events.count', { count: filtered.length })}</p>
      {filtered.length === 0 ? (
        <div className="empty"><p>{t('events.empty')}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table results">
            <thead>
              <tr>
                <th>{t('events.col.time')}</th>
                <th>{t('events.col.type')}</th>
                <th>{t('events.col.actor')}</th>
                <th>{t('events.col.subject')}</th>
                <th>{t('events.col.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, PAGE).map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{formatDateTime(e.at)}</td>
                  <td className="nowrap">{t(`eventType.${e.type}`)}</td>
                  <td>{companyName(state, e.actor) ?? e.actor}</td>
                  <td>
                    {e.subjectIds
                      .map((id) => companyName(state, id))
                      .filter(Boolean)
                      .join(', ')}
                  </td>
                  <td>
                    <div>{eventText(state, e)}</div>
                    {e.rating && (
                      <div className="small">
                        <strong>
                          {t('events.score', { before: e.rating.before, after: e.rating.after })}
                        </strong>
                        {e.rating.components.map((c) => (
                          <div key={c.key} className="muted">
                            {t(`component.${c.key}`)}: {fmt(c.before)} → {fmt(c.after)}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > PAGE && <p className="muted small">{t('events.truncated', { count: PAGE })}</p>}
    </section>
  );
}

const fmt = (v: number | null) => (v === null ? t('owner.componentNA') : String(Math.round(v)));
