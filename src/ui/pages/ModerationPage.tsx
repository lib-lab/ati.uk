import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  confirmComplaint, confirmFraud, rejectClaim, rejectComplaint, resolveFlag, runDetector, setFlag,
} from '../../domain/commands/moderation';
import type { CommandResult } from '../../domain/commands/result';
import { settleClaim } from '../../domain/commands/reviews';
import { confirmedComplaintsInWindow, refundFor } from '../../domain/rules/complaints';
import { findAccess } from '../../domain/rules/contactAccess';
import { detectLinkedAccounts } from '../../domain/rules/detector';
import { MODERATOR_ID, type AppState, type Complaint } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { FlagBadge } from '../components/FlagBadge';
import { formatDate, formatMoney } from '../format';
import { t } from '../i18n';
import { companyName } from '../eventText';
import { fromName, toName } from '../listingFormat';

type Tab = 'complaints' | 'claims' | 'flags';

export function ModerationPage() {
  const state = useAppState((s) => s);
  const [tab, setTab] = useState<Tab>('complaints');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (state.actorId !== MODERATOR_ID) return <p className="muted">{t('mod.onlyModerator')}</p>;

  const run = (cmd: (s: AppState) => CommandResult, done: string) => {
    const res = store.run(cmd);
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: t(`error.${res.error}`) });
  };
  const pending = state.complaints.filter((c) => c.status === 'pending');
  const openClaims = state.claims.filter((c) => c.status === 'open');
  const activeFlagList = state.flags.filter((f) => !f.resolvedAt);

  return (
    <section>
      <h1>{t('mod.title')}</h1>
      <div className="tabs" role="tablist">
        {(['complaints', 'claims', 'flags'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab active' : 'tab'} onClick={() => { setTab(k); setMessage(null); }}>
            {t(`mod.tab.${k}`, { count: k === 'complaints' ? pending.length : k === 'claims' ? openClaims.length : activeFlagList.length })}
          </button>
        ))}
      </div>
      {message && <p className={message.ok ? 'alert alert-neutral' : 'alert alert-red'}>{message.text}</p>}
      {tab === 'complaints' && <Complaints state={state} pending={pending} run={run} />}
      {tab === 'claims' && (
        openClaims.length === 0 ? <div className="empty"><p>{t('mod.noClaims')}</p></div> : (
          <ul className="list">
            {openClaims.map((c) => (
              <li key={c.id} className="list-item review">
                <div>
                  <Link to={`/company/${c.claimantId}`}>{companyName(state, c.claimantId)}</Link> → <Link to={`/company/${c.targetId}`}>{companyName(state, c.targetId)}</Link>{' '}
                  <span className="muted small">{formatDate(c.createdAt)}</span>
                </div>
                <div>{c.text}</div>
                <div className="inline">
                  <button className="btn btn-small" onClick={() => run((s) => settleClaim(s, c.id), t('mod.claimSettled'))}>{t('mod.settle')}</button>
                  <button className="btn btn-small btn-ghost" onClick={() => run((s) => rejectClaim(s, c.id), t('mod.claimRejected'))}>{t('mod.rejectClaim')}</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
      {tab === 'flags' && <Flags state={state} run={run} />}
    </section>
  );
}

function Complaints({ state, pending, run }: { state: AppState; pending: Complaint[]; run: (c: (s: AppState) => CommandResult, d: string) => void }) {
  if (pending.length === 0) return <div className="empty"><p>{t('mod.noComplaints')}</p></div>;
  return (
    <ul className="list">
      {pending.map((c) => {
        const listing = state.listings.find((l) => l.id === c.listingId);
        const refund = c.type === 'no_response' ? refundFor(state, findAccess(state, c.reporterId, c.targetId), state.now) : null;
        const inWindow = confirmedComplaintsInWindow(state, c.targetId, state.now).length;
        return (
          <li key={c.id} className="list-item review">
            <div>
              <strong>{t(`complaintType.${c.type}`)}</strong> · <Link to={`/company/${c.reporterId}`}>{companyName(state, c.reporterId)}</Link> →{' '}
              <Link to={`/company/${c.targetId}`}>{companyName(state, c.targetId)}</Link>{' '}
              <span className="muted small">{formatDate(c.createdAt)}</span>
            </div>
            <div className="small">
              {listing && <Link to={`/listing/${listing.id}`}>{fromName(listing)} → {toName(listing)} ({listing.id})</Link>}
              {' · '}
              {t('mod.inWindow', { count: inWindow })}
              {refund && ' · '}
              {refund && (refund.kind === 'money' ? t('mod.refundMoney', { amount: formatMoney(refund.amount) })
                : refund.kind === 'free_quota' ? t('mod.refundQuota') : t(`mod.refundNone.${refund.reason}`))}
            </div>
            <div className="inline">
              <button className="btn btn-small btn-primary" onClick={() => run((s) => confirmComplaint(s, c.id), t('mod.confirmed'))}>{t('mod.confirm')}</button>
              <button className="btn btn-small btn-ghost" onClick={() => run((s) => rejectComplaint(s, c.id), t('mod.rejected'))}>{t('mod.reject')}</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Flags({ state, run }: { state: AppState; run: (c: (s: AppState) => CommandResult, d: string) => void }) {
  const [companyId, setCompanyId] = useState('');
  const [kind, setKind] = useState<'fraud_blocked' | 'suspected_linked'>('fraud_blocked');
  const [note, setNote] = useState('');
  const suspicions = useMemo(() => detectLinkedAccounts(state), [state]);
  const flags = state.flags.filter((f) => !f.resolvedAt);

  return (
    <>
      <ul className="list">
        {flags.map((f) => (
          <li key={f.id} className="list-item review">
            <div className="inline">
              <FlagBadge flag={f} />
              <Link to={`/company/${f.companyId}`}>{companyName(state, f.companyId)}</Link>
              <span className="muted small">{t(`flagSource.${f.source}`)} · {formatDate(f.createdAt)}{f.note && ` · ${f.note}`}</span>
            </div>
            <div className="inline">
              {f.kind === 'suspected_linked' && (
                <button className="btn btn-small btn-danger" onClick={() => run((s) => confirmFraud(s, f.id), t('mod.fraudConfirmed'))}>{t('mod.confirmFraud')}</button>
              )}
              {f.source !== 'registry' ? (
                <button className="btn btn-small btn-ghost" onClick={() => run((s) => resolveFlag(s, f.id), t('mod.flagRemoved'))}>{t('mod.removeFlag')}</button>
              ) : (
                <span className="muted small">{t('mod.registryFlag')}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h2>{t('mod.setFlag')}</h2>
      <div className="inline">
        <select id="mod-company" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">{t('mod.chooseCompany')}</option>
          {state.companies.map((c) => <option key={c.id} value={c.id}>{c.legalName}</option>)}
        </select>
        <select id="mod-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="fraud_blocked">{t('flag.fraud_blocked')}</option>
          <option value="suspected_linked">{t('flag.suspected_linked')}</option>
        </select>
        <input id="mod-note" placeholder={t('mod.note')} value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-small" disabled={!companyId} onClick={() => run((s) => setFlag(s, companyId, kind, note || undefined), t('mod.flagSet'))}>
          {t('mod.setFlagButton')}
        </button>
      </div>

      <h2>{t('mod.detector')}</h2>
      <p className="muted small">{t('mod.detectorHint')}</p>
      {suspicions.length === 0 ? <p className="muted">{t('mod.noSuspicions')}</p> : (
        <ul className="plain">
          {suspicions.map((sus) => (
            <li key={sus.companyId}>
              <Link to={`/company/${sus.companyId}`}>{companyName(state, sus.companyId)}</Link>:{' '}
              {sus.signals.map((sig) => t(`signal.${sig.kind}`, { with: sig.withId ? companyName(state, sig.withId) ?? sig.withId : '' })).join('; ')}
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-small" onClick={() => run(runDetector, t('mod.detectorDone'))}>{t('mod.runDetector')}</button>
    </>
  );
}
