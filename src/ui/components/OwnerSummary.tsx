// Score, primary mark, review count and "new member" label. Click the score for details.
import { useState } from 'react';
import { primaryMark } from '../../domain/rules/rating';
import type { Company, Rating } from '../../domain/types';
import { t } from '../i18n';
import { FlagBadge } from './FlagBadge';

export function ScoreChip({ rating }: { rating: Rating }) {
  return <span className="score">{rating.score}</span>;
}

export function MarkBadges({ rating, company }: { rating: Rating; company: Company }) {
  const mark = primaryMark(rating, company);
  return (
    <>
      {mark.kind === 'flag' ? (
        <FlagBadge flag={mark.flag} />
      ) : mark.kind === 'verified' ? (
        <span className="badge badge-ok">✓ {t('owner.verified')}</span>
      ) : (
        <span className="badge badge-neutral">{t('owner.notVerified')}</span>
      )}
      {rating.isNewMember && <span className="badge badge-neutral">{t('owner.newMember')}</span>}
    </>
  );
}

export function OwnerSummary({ rating, company }: { rating: Rating; company: Company }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="owner">
      <div className="owner-head">
        <button
          className="score-button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={open ? t('owner.hideBreakdown') : t('owner.showBreakdown')}
        >
          <ScoreChip rating={rating} />
        </button>
        <div className="owner-name">
          <div>{company.legalName}</div>
          <div className="muted small">
            {t(`role.${company.role}`)} · {company.country} · {t('owner.reviews', { count: rating.countedReviews })}
          </div>
        </div>
      </div>
      <div className="badges">
        <MarkBadges rating={rating} company={company} />
        {/* The first flag is the primary mark; show the others next to it. */}
        {[...rating.redFlags, ...rating.yellowFlags].slice(1).map((f) => (
          <FlagBadge key={f.id} flag={f} />
        ))}
      </div>
      <button className="link-button small" onClick={() => setOpen((v) => !v)}>
        {open ? t('owner.hideBreakdown') : t('owner.showBreakdown')}
      </button>
      {open && (
        <table className="breakdown">
          <tbody>
            {rating.components.map((c) => (
              <tr key={c.key}>
                <td>{t(`component.${c.key}`)}</td>
                <td className="num">{c.value === null ? <span className="muted">{t('owner.componentNA')}</span> : Math.round(c.value)}</td>
                <td className="num muted small">
                  {c.value === null ? '' : t('owner.weightShare', { share: Math.round(c.effectiveWeight * 100) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
