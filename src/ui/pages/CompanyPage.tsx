import { Link, useParams } from 'react-router-dom';
import { activeFlags } from '../../domain/rules/flags';
import { activeClaims, countedReviews } from '../../domain/rules/rating';
import { interactionWeight, reviewWeight } from '../../domain/rules/reviewWeight';
import { canReply, canReplyToClaim, canSettleClaim } from '../../domain/rules/reviews';
import { fixProfileData } from '../../domain/commands/moderation';
import { explainRating, type ComponentExplanation } from '../../domain/rules/ratingExplain';
import type { AppState, Claim, Review } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { DisputeButton } from '../components/DisputeButton';
import { FlagBadge, flagLabel } from '../components/FlagBadge';
import { MarkBadges } from '../components/OwnerSummary';
import { ClaimForm, ClaimReplyForm, ReplyForm, ReviewForm, SettleButton } from '../components/ReputationForms';
import { formatDate, formatDateTime } from '../format';
import { t } from '../i18n';
import { companyName, eventText, readableParams } from '../eventText';
import { getCompany, getRating } from '../selectors';

export function CompanyPage() {
  const { id } = useParams();
  const state = useAppState((s) => s);
  const company = id ? getCompany(state, id) : undefined;
  if (!company) return <p>{t('company.notFound')}</p>;

  const rating = getRating(state, company.id);
  const explanation = explainRating(state, company.id, state.now);
  const flags = activeFlags(state.flags, company.id);
  const reviews = state.reviews.filter((r) => r.targetId === company.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const claims = state.claims.filter((c) => c.targetId === company.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const record = company.verification.record;

  return (
    <section className="profile">
      <div className="profile-head">
        <span className="score score-large">{rating.score}</span>
        <div>
          <h1>{company.legalName}</h1>
          <div className="muted">
            {t(`role.${company.role}`)} · {company.country} · {company.regNumberType} {company.regNumber} ·{' '}
            {t('company.joined', { date: formatDate(company.joinedAt) })}
            {company.status === 'deactivated' && <> · <strong>{t('company.hiddenInactive')}</strong></>}
            {company.status === 'deleted' && <> · <strong>{t('company.deleted', { date: formatDate(company.deletedAt!) })}</strong></>}
          </div>
          <div className="badges">
            <MarkBadges rating={rating} company={company} />
            <span className="muted small">{t('owner.reviews', { count: rating.countedReviews })}</span>
            {flags.slice(1).map((f) => <FlagBadge key={f.id} flag={f} />)}
          </div>
        </div>
      </div>
      {flags.length > 0 && (
        <ul className="flag-notes">
          {flags.map((f) => (
            <li key={f.id} className={f.level === 'red' ? 'alert alert-red' : 'alert alert-yellow'}>
              <strong>{flagLabel(f)}</strong> —{' '}
              {f.kind === 'data_mismatch' && f.level === 'yellow'
                ? t('flagInfo.data_mismatch.yellow', { date: formatDate(f.dueAt ?? f.createdAt) })
                : t(`flagInfo.${f.kind}`)}
              {f.note && <span className="muted"> ({f.note})</span>} · {formatDate(f.createdAt)}{' '}
              {f.kind === 'data_mismatch' && state.actorId === company.id && company.verification.record && (
                <button className="btn btn-small" onClick={() => store.run(fixProfileData)}>
                  {t('company.fixData', { name: company.verification.record.legalName })}
                </button>
              )}{' '}
              <DisputeButton state={state} type="flag" subjectId={f.id} />
            </li>
          ))}
        </ul>
      )}

      <h2>{t('company.scoreTitle')}</h2>
      <p className="muted small">{t('company.scoreHint')}</p>
      <div className="components">
        {explanation.components.map((c) => (
          <ComponentPanel key={c.key} state={state} companyId={company.id} c={c} />
        ))}
      </div>

      <h2>{t('company.reviewsTitle', { count: reviews.length })}</h2>
      <ReviewForm state={state} target={company} />
      {reviews.length === 0 ? <p className="muted">{t('company.noReviews')}</p> : (
        <ul className="list">{reviews.map((r) => <ReviewItem key={r.id} state={state} review={r} />)}</ul>
      )}

      <h2>{t('company.claimsTitle', { count: claims.length })}</h2>
      <ClaimForm state={state} target={company} />
      {claims.length === 0 ? <p className="muted">{t('company.noClaims')}</p> : (
        <ul className="list">{claims.map((c) => <ClaimItem key={c.id} state={state} claim={c} />)}</ul>
      )}

      <h2>{t('company.verificationTitle')}</h2>
      <div className="panel">
        {record ? (
          <dl className="facts">
            <dt>{t('company.registry.name')}</dt><dd>{record.legalName}</dd>
            <dt>{t('company.registry.status')}</dt><dd>{record.status ? t(`registryStatus.${record.status}`) : t('company.registry.statusUnavailable')}</dd>
            <dt>{t('company.registry.founded')}</dt><dd>{formatDate(record.foundedAt)} <span className="muted small">{t('company.registry.notScored')}</span></dd>
            <dt>{t('company.registry.reports')}</dt><dd>{record.reportsFiled ? t('common.yes') : t('common.no')} <span className="muted small">{t('company.registry.notScored')}</span></dd>
            <dt>{t('company.registry.address')}</dt><dd>{record.address}</dd>
            <dt>{t('company.registry.match')}</dt>
            <dd>{company.verification.matchesProfile ? t('common.yes') : t('company.registry.mismatch', { profile: company.legalName })}</dd>
            <dt>{t('company.registry.checked')}</dt><dd>{formatDateTime(company.verification.checkedAt)}</dd>
          </dl>
        ) : (
          <p>{t('company.registry.notFound')}</p>
        )}
      </div>
    </section>
  );
}

function ComponentPanel({ state, companyId, c }: { state: AppState; companyId: string; c: ComponentExplanation }) {
  const events = state.events
    .filter((e) => e.type === 'rating_changed' && e.subjectIds[0] === companyId && e.rating?.components.some((x) => x.key === c.key))
    .reverse();
  return (
    <details className="panel component" open={c.value !== null}>
      <summary>
        <span className="component-name">{t(`component.${c.key}`)}</span>
        <span className="num">{c.value === null ? <span className="muted">{t('owner.componentNA')}</span> : Math.round(c.value)}</span>
        <span className="muted small num">
          {t('company.weights', { nominal: c.weight, effective: Math.round(c.effectiveWeight * 100) })}
        </span>
        <span className="num small">{t('company.contribution', { points: c.contribution.toFixed(1) })}</span>
      </summary>
      <table className="breakdown">
        <tbody>
          {c.lines.map((l, i) => (
            <tr key={i}>
              <td>{t(l.key, readableParams(state, l.params))}</td>
              <td className="num nowrap">{l.points === null ? '' : `${l.points >= 0 ? '+' : '−'}${Math.abs(l.points).toFixed(1)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small">
        <div className="muted">{t('company.componentEvents')}</div>
        {events.length === 0 ? (
          <div className="muted">{t('company.noComponentEvents')}</div>
        ) : (
          <ul className="plain">
            {events.map((e) => {
              const change = e.rating!.components.find((x) => x.key === c.key)!;
              return (
                <li key={e.id}>
                  <span className="muted">{formatDate(e.at)}</span> {eventText(state, e)}:{' '}
                  {fmt(change.before)} → {fmt(change.after)} ({signed(change.contributionDelta)} {t('company.pts')}){' '}
                  <DisputeButton state={state} type="event" subjectId={e.id} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}

function ReviewItem({ state, review }: { state: AppState; review: Review }) {
  const counted = countedReviews(state, review.targetId).some((r) => r.id === review.id);
  const w = reviewWeight(state, review, state.now);
  const factors = [
    w.recency < 1 && t('company.review.factor.old', { w: w.recency }),
    w.contactCost < 1 && t('company.review.factor.free', { w: w.contactCost }),
    w.author < 1 && t('company.review.factor.author', { w: w.author.toFixed(2) }),
    w.independence < 1 && t('company.review.factor.group', { w: w.independence }),
    w.sharedDevice < 1 && t('company.review.factor.device', { w: w.sharedDevice }),
  ].filter(Boolean);
  return (
    <li className="list-item review">
      <div>
        <span className="stars" aria-label={t('company.stars', { stars: review.stars })}>{'★'.repeat(review.stars)}{'☆'.repeat(5 - review.stars)}</span>{' '}
        <Link to={`/company/${review.authorId}`}>{companyName(state, review.authorId)}</Link>{' '}
        <span className="muted small">{formatDate(review.createdAt)}</span>
        {!review.dealHappened && <span className="badge badge-neutral">{t('company.review.contactOnly')}</span>}
        {review.voided && <span className="badge badge-neutral">{t('company.review.voided')}</span>}
        {!review.voided && !counted && <span className="badge badge-yellow">{t('company.review.notCounted')}</span>}
        {counted && (
          <span className="badge badge-neutral" title={factors.join(' · ')}>
            {t('company.review.weight', { w: w.total.toFixed(2) })}
            {factors.length > 0 && `: ${factors.join(' · ')}`}
          </span>
        )}
      </div>
      {review.text && <div>{review.text}</div>}
      {review.reply && <div className="reply small"><span className="muted">{t('company.review.reply')}</span> {review.reply.text}</div>}
      {canReply(review, state.actorId) && <ReplyForm review={review} />}
    </li>
  );
}

function ClaimItem({ state, claim }: { state: AppState; claim: Claim }) {
  const counting = activeClaims(state, claim.targetId, state.now).some((c) => c.id === claim.id);
  const weight = interactionWeight(state, claim.claimantId, claim.targetId, state.now);
  return (
    <li className="list-item review">
      <div>
        <span className={`badge ${counting ? 'badge-red' : 'badge-neutral'}`}>{t(`claimStatus.${claim.status}`)}</span>{' '}
        <Link to={`/company/${claim.claimantId}`}>{companyName(state, claim.claimantId)}</Link>{' '}
        <span className="muted small">
          {formatDate(claim.createdAt)}
          {claim.resolvedAt && ` → ${formatDate(claim.resolvedAt)}`}
        </span>{' '}
        {counting && <span className="badge badge-neutral">{t('company.claim.weight', { w: weight.toFixed(2) })}</span>}
        {claim.status === 'open' && !counting && <span className="badge badge-neutral">{t('company.claim.expired')}</span>}
      </div>
      <div>{claim.text}</div>
      {claim.reply && <div className="reply small"><span className="muted">{t('company.review.reply')}</span> {claim.reply.text}</div>}
      <div className="inline">
        {canReplyToClaim(claim, state.actorId) && <ClaimReplyForm claim={claim} />}
        {canSettleClaim(claim, state.actorId) && <SettleButton claim={claim} />}
        <DisputeButton state={state} type="claim" subjectId={claim.id} />
      </div>
    </li>
  );
}

const fmt = (v: number | null) => (v === null ? t('owner.componentNA') : String(Math.round(v)));
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`;
