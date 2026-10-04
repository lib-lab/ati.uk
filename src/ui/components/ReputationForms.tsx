// Review and claim forms shown in a company profile.
import { useState } from 'react';
import { fileClaim, postReview, replyToClaim, replyToReview, settleClaim } from '../../domain/commands/reviews';
import { canFileClaim, canReview, type Eligibility } from '../../domain/rules/reviews';
import type { AppState, Claim, Company, Review } from '../../domain/types';
import { store } from '../../store/store';
import { formatDate } from '../format';
import { t } from '../i18n';

function reasonText(e: Eligibility, kind: 'review' | 'claim'): string {
  if (e.ok) return '';
  if (e.reason === 'too_soon') return t('rep.tooSoon', { date: formatDate(e.nextAt) });
  return t(`rep.${kind}.${e.reason}`);
}

export function ReviewForm({ state, target }: { state: AppState; target: Company }) {
  const [stars, setStars] = useState<Review['stars'] | 0>(0);
  const [deal, setDeal] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const eligibility = canReview(state, state.actorId, target.id, state.now);

  if (!eligibility.ok) {
    if (eligibility.reason === 'self' || eligibility.reason === 'not_company') return null;
    return <p className="muted small">{reasonText(eligibility, 'review')}</p>;
  }

  const submit = () => {
    if (deal === null) return setMessage({ ok: false, text: t('rep.chooseDeal') });
    if (!stars) return setMessage({ ok: false, text: t('rep.chooseStars') });
    const res = store.run((s) => postReview(s, target.id, stars, deal, text));
    setMessage(res.ok ? { ok: true, text: t('rep.reviewDone') } : { ok: false, text: t(`error.${res.error}`) });
    if (res.ok) { setStars(0); setText(''); setDeal(null); }
  };

  return (
    <div className="panel rep-form">
      <div className="inline">
        <span>{t('rep.dealQuestion')}</span>
        <label className="checkbox"><input type="radio" name="deal" checked={deal === true} onChange={() => setDeal(true)} /> {t('common.yes')}</label>
        <label className="checkbox"><input type="radio" name="deal" checked={deal === false} onChange={() => setDeal(false)} /> {t('common.no')}</label>
      </div>
      {deal !== null && <p className="muted small">{deal ? t('rep.rateWork') : t('rep.rateContact')}</p>}
      <div className="inline">
        <span>{t('rep.yourReview')}</span>
        <span className="star-input" role="radiogroup" aria-label={t('rep.yourReview')}>
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button key={n} type="button" role="radio" aria-checked={stars === n} className={n <= stars ? 'star on' : 'star'}
              onClick={() => setStars(n)} title={t('company.stars', { stars: n })}>
              ★
            </button>
          ))}
        </span>
      </div>
      <p className="alert alert-neutral small">{t('rep.noPersonalData')}</p>
      <textarea id="rev-text" placeholder={t('rep.reviewPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="inline">
        <button className="btn btn-primary btn-small" onClick={submit}>{t('rep.postReview')}</button>
        <span className="muted small">{t('rep.reviewRule')}</span>
      </div>
      {message && <p className={message.ok ? 'small muted' : 'alert alert-red'}>{message.text}</p>}
    </div>
  );
}

export function ReplyForm({ review }: { review: Review }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button className="link-button small" onClick={() => setOpen(true)}>{t('rep.reply')}</button>;
  return (
    <div className="inline reply-form">
      <input id={`reply-${review.id}`} value={text} placeholder={t('rep.replyPlaceholder')} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-small btn-primary" onClick={() => {
        const res = store.run((s) => replyToReview(s, review.id, text));
        if (!res.ok) setError(t(`error.${res.error}`));
      }}>{t('rep.sendReply')}</button>
      <button className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>{t('contact.cancel')}</button>
      {error && <span className="field-error">{error}</span>}
      <span className="muted small">{t('rep.replyOnce')}</span>
    </div>
  );
}

export function ClaimForm({ state, target }: { state: AppState; target: Company }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const eligibility = canFileClaim(state, state.actorId, target.id);
  if (!eligibility.ok) {
    if (eligibility.reason === 'self' || eligibility.reason === 'not_company') return null;
    return <p className="muted small">{reasonText(eligibility, 'claim')}</p>;
  }
  if (!open) {
    return (
      <div>
        <button className="btn btn-small btn-ghost" onClick={() => setOpen(true)}>{t('rep.fileClaim')}</button>
        {message && <span className="small muted"> {message.text}</span>}
      </div>
    );
  }
  return (
    <div className="panel rep-form">
      <span>{t('rep.claimTitle')}</span>
      <p className="alert alert-neutral small">{t('rep.noPersonalData')}</p>
      <textarea id="claim-text" placeholder={t('rep.claimPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="inline">
        <button className="btn btn-small btn-primary" onClick={() => {
          const res = store.run((s) => fileClaim(s, target.id, text));
          if (res.ok) { setOpen(false); setText(''); setMessage({ ok: true, text: t('rep.claimDone') }); }
          else setMessage({ ok: false, text: t(`error.${res.error}`) });
        }}>{t('rep.submitClaim')}</button>
        <button className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>{t('contact.cancel')}</button>
        <span className="muted small">{t('rep.claimRule')}</span>
      </div>
      {message && !message.ok && <p className="alert alert-red">{message.text}</p>}
    </div>
  );
}

export function ClaimReplyForm({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button className="link-button small" onClick={() => setOpen(true)}>{t('rep.answerClaim')}</button>;
  return (
    <span className="inline reply-form">
      <input id={`claim-reply-${claim.id}`} value={text} placeholder={t('rep.replyPlaceholder')} onChange={(e) => setText(e.target.value)} />
      <button className="btn btn-small btn-primary" onClick={() => {
        const res = store.run((s) => replyToClaim(s, claim.id, text));
        if (!res.ok) setError(t(`error.${res.error}`));
      }}>{t('rep.sendReply')}</button>
      <button className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>{t('contact.cancel')}</button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}

export function SettleButton({ claim }: { claim: Claim }) {
  return (
    <button className="btn btn-small" onClick={() => store.run((s) => settleClaim(s, claim.id))}>
      {t('rep.settle')}
    </button>
  );
}
