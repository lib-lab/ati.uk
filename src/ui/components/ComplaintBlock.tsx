// "Report" on the listing card: outdated, or contact does not answer / wrong.
import { useState } from 'react';
import { fileComplaint } from '../../domain/commands/moderation';
import { canComplain } from '../../domain/rules/complaints';
import type { AppState, ComplaintType, Listing } from '../../domain/types';
import { store } from '../../store/store';
import { formatDate } from '../format';
import { t } from '../i18n';

const TYPES: ComplaintType[] = ['outdated', 'no_response'];

export function ComplaintBlock({ state, listing }: { state: AppState; listing: Listing }) {
  const [message, setMessage] = useState<string | null>(null);
  const isCompany = state.companies.some((c) => c.id === state.actorId);
  if (!isCompany || listing.ownerId === state.actorId) return null;

  const mine = state.complaints.find((c) => c.reporterId === state.actorId && c.listingId === listing.id);
  if (mine) {
    return (
      <p className="muted small">
        {t('complaint.yours', { type: t(`complaintType.${mine.type}`), date: formatDate(mine.createdAt) })}{' '}
        <strong>{t(`complaintStatus.${mine.status}`)}</strong>
      </p>
    );
  }

  return (
    <div className="complaint">
      <span className="muted small">{t('complaint.report')}</span>
      <div className="inline">
        {TYPES.map((type) => {
          const e = canComplain(state, state.actorId, listing, type);
          return (
            <button key={type} className="btn btn-small btn-ghost" disabled={!e.ok}
              title={!e.ok && e.reason === 'no_access' ? t('complaint.needsAccess') : undefined}
              onClick={() => {
                const res = store.run((s) => fileComplaint(s, listing.id, type));
                setMessage(res.ok ? t('complaint.filed') : t(`error.${res.error}`));
              }}>
              {t(`complaintType.${type}`)}
            </button>
          );
        })}
      </div>
      {!canComplain(state, state.actorId, listing, 'no_response').ok && <span className="muted small">{t('complaint.needsAccess')}</span>}
      {message && <span className="small">{message}</span>}
    </div>
  );
}
