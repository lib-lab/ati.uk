import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { unblockCollection } from '../../domain/commands/contacts';
import { resolveDispute } from '../../domain/commands/disputes';
import {
  confirmClaim, confirmComplaint, confirmFraud, rejectClaim, rejectComplaint, resolveFlag, runDetector, setFlag,
} from '../../domain/commands/moderation';
import type { CommandResult } from '../../domain/commands/result';
import { settleClaim } from '../../domain/commands/reviews';
import { openingsToday } from '../../domain/rules/collection';
import { complaintShare, refundFor, refundPlan } from '../../domain/rules/complaints';
import { findAccess } from '../../domain/rules/contactAccess';
import { detectSuspicions } from '../../domain/rules/detector';
import { activeClaims } from '../../domain/rules/rating';
import { MODERATOR_ID, type AppState, type Complaint, type Dispute } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { FlagBadge } from '../components/FlagBadge';
import { formatDate, formatMoney } from '../format';
import { t } from '../i18n';
import { companyName, eventText } from '../eventText';
import { fromName, toName } from '../listingFormat';

type Tab = 'complaints' | 'claims' | 'flags' | 'disputes' | 'collection';
type Run = (c: (s: AppState) => CommandResult, done: string) => void;

export function ModerationPage() {
  const state = useAppState((s) => s);
  const [tab, setTab] = useState<Tab>('complaints');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (state.actorId !== MODERATOR_ID) return <p className="muted">{t('mod.onlyModerator')}</p>;

  const run: Run = (cmd, done) => {
    const res = store.run(cmd);
    setMessage(res.ok ? { ok: true, text: done } : { ok: false, text: t(`error.${res.error}`) });
  };
  const pending = state.complaints.filter((c) => c.status === 'pending');
  const liveClaims = state.claims.filter((c) => c.status === 'open' || c.status === 'confirmed');
  const activeFlagList = state.flags.filter((f) => !f.resolvedAt);
  const openDisputes = state.disputes.filter((d) => d.status === 'open');
  const guarded = state.companies.filter((c) => c.collection && c.collection.state !== 'ok');
  const counts: Record<Tab, number> = {
    complaints: pending.length, claims: liveClaims.length, flags: activeFlagList.length, disputes: openDisputes.length, collection: guarded.length,
  };

  return (
    <section>
      <h1>{t('mod.title')}</h1>
      <div className="tabs" role="tablist">
        {(['complaints', 'claims', 'flags', 'disputes', 'collection'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab active' : 'tab'} onClick={() => { setTab(k); setMessage(null); }}>
            {t(`mod.tab.${k}`, { count: counts[k] })}
          </button>
        ))}
      </div>
      {message && <p className={message.ok ? 'alert alert-neutral' : 'alert alert-red'}>{message.text}</p>}
      {tab === 'complaints' && <Complaints state={state} pending={pending} run={run} />}
      {tab === 'claims' && <Claims state={state} run={run} />}
      {tab === 'flags' && <Flags state={state} run={run} />}
      {tab === 'disputes' && <Disputes state={state} open={openDisputes} run={run} />}
      {tab === 'collection' && <Collection state={state} run={run} />}
    </section>
  );
}

function refundPreview(state: AppState, c: Complaint): string {
  const plan = refundPlan(state, c, state.now);
  if (plan.kind === 'none') return t('mod.refundNone.outdated');
  if (plan.kind === 'wait') return t('mod.refundWait', { weight: plan.weight.toFixed(1), needed: plan.needed });
  const own = refundFor(state, findAccess(state, c.reporterId, c.targetId), state.now);
  const ownText = own.kind === 'money' ? t('mod.refundMoney', { amount: formatMoney(own.amount) })
    : own.kind === 'free_quota' ? t('mod.refundQuota') : own.kind === 'package' ? t('mod.refundPackage') : t(`mod.refundNone.${own.reason}`);
  return plan.reporterIds.length > 1 ? `${ownText} ${t('mod.refundAll', { count: plan.reporterIds.length })}` : ownText;
}

function Complaints({ state, pending, run }: { state: AppState; pending: Complaint[]; run: Run }) {
  if (pending.length === 0) return <div className="empty"><p>{t('mod.noComplaints')}</p></div>;
  return (
    <ul className="list">
      {pending.map((c) => {
        const listing = state.listings.find((l) => l.id === c.listingId);
        const share = complaintShare(state, c.targetId, state.now);
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
              {t('mod.share', { count: share.count, contacts: share.contacts, share: Math.round(share.share * 100) })}
              {' · '}
              {refundPreview(state, c)}
            </div>
            {c.response ? (
              <div className="reply small"><span className="muted">{t('mod.companyAnswer')}</span> {c.response.text}</div>
            ) : (
              <div className="muted small">{t('mod.noAnswerYet')}</div>
            )}
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

function Claims({ state, run }: { state: AppState; run: Run }) {
  const claims = state.claims.filter((c) => c.status === 'open' || c.status === 'confirmed');
  if (claims.length === 0) return <div className="empty"><p>{t('mod.noClaims')}</p></div>;
  return (
    <ul className="list">
      {claims.map((c) => {
        const counting = activeClaims(state, c.targetId, state.now).some((x) => x.id === c.id);
        return (
          <li key={c.id} className="list-item review">
            <div>
              <span className={`badge ${counting ? 'badge-red' : 'badge-neutral'}`}>{t(`claimStatus.${c.status}`)}</span>{' '}
              <Link to={`/company/${c.claimantId}`}>{companyName(state, c.claimantId)}</Link> → <Link to={`/company/${c.targetId}`}>{companyName(state, c.targetId)}</Link>{' '}
              <span className="muted small">{formatDate(c.createdAt)}</span>
              {!counting && <span className="badge badge-neutral">{t('company.claim.expired')}</span>}
            </div>
            <div>{c.text}</div>
            {c.reply && <div className="reply small"><span className="muted">{t('mod.companyAnswer')}</span> {c.reply.text}</div>}
            <div className="inline">
              {c.status === 'open' && (
                <button className="btn btn-small btn-primary" onClick={() => run((s) => confirmClaim(s, c.id), t('mod.claimConfirmed'))}>{t('mod.confirmClaim')}</button>
              )}
              <button className="btn btn-small" onClick={() => run((s) => settleClaim(s, c.id), t('mod.claimSettled'))}>{t('mod.settle')}</button>
              <button className="btn btn-small btn-ghost" onClick={() => run((s) => rejectClaim(s, c.id), t('mod.claimRejected'))}>{t('mod.rejectClaim')}</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Companies slowed down or blocked for signs of contact collection (TZ: "Against collecting contacts"). */
function Collection({ state, run }: { state: AppState; run: Run }) {
  const guarded = state.companies.filter((c) => c.collection && c.collection.state !== 'ok');
  if (guarded.length === 0) return <p className="muted">{t('mod.collection.empty')}</p>;
  return (
    <ul className="list">
      {guarded.map((c) => {
        const g = c.collection!;
        return (
          <li key={c.id} className="list-item review">
            <div className="inline">
              <span className={g.state === 'blocked' ? 'badge badge-red' : 'badge badge-yellow'}>{t(`mod.collection.state.${g.state}`)}</span>
              <Link to={`/company/${c.id}`}>{c.legalName}</Link>
              <span className="muted small">
                {t('mod.collection.since', { date: formatDate(g.since) })} · {t('mod.collection.today', { count: openingsToday(state, c.id, state.now) })}
              </span>
            </div>
            <div className="small">{g.reasons.map((r) => t(r)).join('; ')}</div>
            {g.state === 'blocked' && (
              <div>
                <button className="btn btn-small" onClick={() => run((s) => unblockCollection(s, c.id), t('event.collection.unblocked', { company: c.legalName }))}>
                  {t('mod.collection.unblock')}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Flags({ state, run }: { state: AppState; run: Run }) {
  const [companyId, setCompanyId] = useState('');
  const [kind, setKind] = useState<'fraud_blocked' | 'suspected_linked'>('fraud_blocked');
  const [note, setNote] = useState('');
  const suspicions = useMemo(() => detectSuspicions(state), [state]);
  const flags = state.flags.filter((f) => !f.resolvedAt);

  return (
    <>
      <ul className="list">
        {flags.map((f) => (
          <li key={f.id} className="list-item review">
            <div className="inline">
              <FlagBadge flag={f} />
              <Link to={`/company/${f.companyId}`}>{companyName(state, f.companyId)}</Link>
              <span className="muted small">
                {t(`flagSource.${f.source}`)} · {formatDate(f.createdAt)}
                {f.dueAt && f.level === 'yellow' && ` · ${t('mod.dueAt', { date: formatDate(f.dueAt) })}`}
                {f.note && ` · ${f.note}`}
              </span>
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
              {t('signal.closed_ring', { with: sus.ringWith.map((id) => companyName(state, id) ?? id).join(', ') })}
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-small" onClick={() => run(runDetector, t('mod.detectorDone'))}>{t('mod.runDetector')}</button>
    </>
  );
}

function disputeSubjectText(state: AppState, d: Dispute): string {
  switch (d.subjectType) {
    case 'event': {
      const e = state.events.find((x) => x.id === d.subjectId);
      return e ? `${eventText(state, e)}${e.rating ? ` (${e.rating.before} → ${e.rating.after})` : ''}` : d.subjectId;
    }
    case 'flag': {
      const f = state.flags.find((x) => x.id === d.subjectId);
      return f ? t(`flag.${f.kind}`) : d.subjectId;
    }
    case 'complaint': {
      const c = state.complaints.find((x) => x.id === d.subjectId);
      return c ? `${t(`complaintType.${c.type}`)} — ${companyName(state, c.reporterId)} (${t(`complaintStatus.${c.status}`)})` : d.subjectId;
    }
    case 'claim': {
      const c = state.claims.find((x) => x.id === d.subjectId);
      return c ? `${companyName(state, c.claimantId)}: ${c.text}` : d.subjectId;
    }
  }
}

function Disputes({ state, open, run }: { state: AppState; open: Dispute[]; run: Run }) {
  if (open.length === 0) return <div className="empty"><p>{t('mod.noDisputes')}</p></div>;
  return (
    <ul className="list">
      {open.map((d) => (
        <li key={d.id} className="list-item review">
          <div>
            <strong>{t(`mod.disputeType.${d.subjectType}`)}</strong> · <Link to={`/company/${d.companyId}`}>{companyName(state, d.companyId)}</Link>{' '}
            <span className="muted small">{formatDate(d.createdAt)}</span>
          </div>
          <div className="small">{disputeSubjectText(state, d)}</div>
          <div className="reply small"><span className="muted">{t('mod.disputeReason')}</span> {d.text}</div>
          <div className="inline">
            <button className="btn btn-small btn-primary" onClick={() => run((s) => resolveDispute(s, d.id, true), t('mod.disputeAccepted'))}>{t('mod.accept')}</button>
            <button className="btn btn-small btn-ghost" onClick={() => run((s) => resolveDispute(s, d.id, false), t('mod.disputeRejected'))}>{t('mod.reject')}</button>
            <span className="muted small">{t(`mod.acceptEffect.${d.subjectType}`)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
