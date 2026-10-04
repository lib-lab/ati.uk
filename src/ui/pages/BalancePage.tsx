import { useState } from 'react';
import { adapters } from '../../adapters';
import { buyPackage, topUp } from '../../domain/commands/balance';
import { CONFIG } from '../../domain/config';
import { activePackage, freeContactsLeft } from '../../domain/rules/contactAccess';
import { balanceOf } from '../../domain/rules/ledger';
import type { Cents } from '../../domain/types';
import { store, useAppState } from '../../store/store';
import { formatDate, formatDateTime, formatMoney } from '../format';
import { t } from '../i18n';
import { getCompany } from '../selectors';

const AMOUNTS: Cents[] = [1000, 5000, 10000];

export function BalancePage() {
  const state = useAppState((s) => s);
  const actor = getCompany(state, state.actorId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!actor) return <p className="muted">{t('balance.notCompany')}</p>;

  const onTopUp = async (amount: Cents) => {
    setBusy(true);
    const payment = await adapters.payments.topUp(actor.id, amount, CONFIG.currency);
    if (!payment.ok || !payment.externalId) {
      setMessage({ ok: false, text: t('balance.failed', { error: payment.error ?? '' }) });
    } else {
      const res = store.run((s) => topUp(s, actor.id, amount, payment.externalId!));
      setMessage(res.ok ? { ok: true, text: t('balance.done', { amount: formatMoney(amount) }) } : { ok: false, text: t(`error.${res.error}`) });
    }
    setBusy(false);
  };

  const txs = state.transactions.filter((tx) => tx.companyId === actor.id).reverse();
  const pkg = activePackage(state, actor.id, state.now);
  const offer = CONFIG.prices.package;
  const onBuy = () => {
    const res = store.run(buyPackage);
    setMessage(res.ok ? { ok: true, text: t('balance.packageBought', { size: offer.size }) } : { ok: false, text: t(`error.${res.error}`) });
  };

  return (
    <section>
      <h1>{t('balance.title')}</h1>
      <div className="panel stats">
        <div>
          <div className="muted small">{t('balance.current')}</div>
          <div className="big">{formatMoney(balanceOf(state.transactions, actor.id))}</div>
        </div>
        <div>
          <div className="muted small">{t('balance.freeContacts')}</div>
          <div className="big">
            {freeContactsLeft(state, actor.id, state.now)} / {CONFIG.freeContactsPerMonth}
          </div>
        </div>
        <div>
          <div className="muted small">{t('balance.package')}</div>
          <div className="big">{pkg ? `${pkg.size - pkg.used} / ${pkg.size}` : '—'}</div>
          {pkg && <div className="muted small">{t('balance.packageUntil', { date: formatDate(pkg.validTo) })}</div>}
        </div>
        <div>
          <div className="muted small">{t('balance.contactPrice')}</div>
          <div className="big">{formatMoney(CONFIG.prices.contact)}</div>
        </div>
      </div>

      <h2>{t('balance.topUpTitle')}</h2>
      <p className="muted small">{t('balance.testMode')}</p>
      <div className="inline">
        {AMOUNTS.map((a) => (
          <button key={a} className="btn" disabled={busy} onClick={() => onTopUp(a)}>
            + {formatMoney(a)}
          </button>
        ))}
      </div>

      <h2>{t('balance.packageTitle')}</h2>
      <p className="muted small">
        {t('balance.packageOffer', { size: offer.size, days: offer.days, price: formatMoney(offer.price), each: formatMoney(Math.round(offer.price / offer.size)) })}
      </p>
      <div className="inline">
        <button className="btn" disabled={!!pkg} onClick={onBuy}>{t('balance.buyPackage', { price: formatMoney(offer.price) })}</button>
        {pkg && <span className="muted small">{t('balance.packageActive')}</span>}
      </div>
      {message && <p className={message.ok ? 'alert alert-neutral' : 'alert alert-red'}>{message.text}</p>}

      <h2>{t('balance.history')}</h2>
      {txs.length === 0 ? (
        <div className="empty"><p>{t('balance.noTransactions')}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="table results">
            <thead>
              <tr>
                <th>{t('balance.col.date')}</th>
                <th>{t('balance.col.type')}</th>
                <th className="num">{t('balance.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id}>
                  <td className="nowrap">{formatDateTime(tx.createdAt)}</td>
                  <td>{t(`txType.${tx.type}`)}</td>
                  <td className={tx.amount < 0 ? 'num' : 'num positive'}>
                    {tx.amount > 0 ? '+' : '−'}
                    {formatMoney(Math.abs(tx.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
