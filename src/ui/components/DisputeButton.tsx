// "Dispute" next to a rating event, flag, complaint or claim (TZ: "Disputes").
import { useState } from 'react';
import { canDispute, openDispute, openDisputeFor } from '../../domain/commands/disputes';
import type { AppState, DisputeSubject } from '../../domain/types';
import { store } from '../../store/store';
import { t } from '../i18n';

export function DisputeButton({ state, type, subjectId }: { state: AppState; type: DisputeSubject; subjectId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = openDisputeFor(state, type, subjectId);
  const last = state.disputes.filter((d) => d.subjectType === type && d.subjectId === subjectId && d.status !== 'open').at(-1);

  if (pending) return <span className="badge badge-yellow">{t('dispute.pending')}</span>;
  if (!canDispute(state, type, subjectId, state.actorId)) {
    return last ? <span className="badge badge-neutral">{t(`dispute.${last.status}`)}</span> : null;
  }
  if (!open) {
    return (
      <>
        {last && <span className="badge badge-neutral">{t(`dispute.${last.status}`)}</span>}
        <button className="link-button small" onClick={() => setOpen(true)}>{t('dispute.button')}</button>
      </>
    );
  }
  return (
    <span className="inline dispute-form">
      <input id={`dispute-${subjectId}`} placeholder={t('dispute.placeholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-small btn-primary" onClick={() => {
        const res = store.run((s) => openDispute(s, type, subjectId, text));
        if (res.ok) setOpen(false);
        else setError(t(`error.${res.error}`));
      }}>{t('dispute.send')}</button>
      <button className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>{t('contact.cancel')}</button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
