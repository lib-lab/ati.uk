// "Open contact" with price, state messages and red-flag warning (TZ: listing card).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { openContact } from '../../domain/commands/contacts';
import { CONFIG } from '../../domain/config';
import { decideContact, findAccess } from '../../domain/rules/contactAccess';
import { balanceOf } from '../../domain/rules/ledger';
import type { AppState, Listing, Rating } from '../../domain/types';
import { store } from '../../store/store';
import { formatDate, formatMoney } from '../format';
import { t } from '../i18n';
import { getCompany } from '../selectors';
import { flagLabel } from './FlagBadge';

export function ContactBlock({ state, listing, ownerRating }: { state: AppState; listing: Listing; ownerRating: Rating }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerId = state.actorId;
  const decision = decideContact(state, viewerId, listing, state.now);
  const redFlag = ownerRating.redFlags[0];
  const yellowFlag = ownerRating.yellowFlags[0];

  const doOpen = () => {
    const res = store.run((s) => openContact(s, listing.id));
    setError(res.ok ? null : t(`error.${res.error}`));
    setConfirming(false);
  };

  if (decision.kind === 'own_listing' || decision.kind === 'already_open') {
    const access = findAccess(state, viewerId, listing.ownerId);
    return (
      <div className="contact">
        <ContactDetails state={state} listing={listing} />
        <p className="muted small">
          {decision.kind === 'own_listing' || !access ? t('contact.own') : t('contact.repeatNote', { date: formatDate(access.openedAt) })}
          {decision.kind === 'own_listing' && <> <Link to="/my-listings">{t('contact.manage')}</Link></>}
          {decision.kind === 'already_open' && <> <Link to={`/company/${listing.ownerId}`}>{t('contact.reviewLink')}</Link></>}
        </p>
      </div>
    );
  }

  if (decision.kind === 'unavailable') {
    return (
      <div className="contact">
        <p className="muted">{decision.reason === 'not_a_company' ? t('contact.notCompany') : t('contact.inactive')}</p>
      </div>
    );
  }

  const balance = balanceOf(state.transactions, viewerId);
  let label: string;
  let note: string;
  switch (decision.kind) {
    case 'open_listing':
      label = t('contact.show');
      note = t('contact.openListingNote');
      break;
    case 'free_quota':
      label = t('contact.openFree');
      note = t('contact.freeLeft', { left: decision.freeLeftAfter + 1, total: CONFIG.freeContactsPerMonth });
      break;
    case 'package':
      label = t('contact.openPackage');
      note = t('contact.packageNote');
      break;
    case 'balance':
      label = t('contact.open', { price: formatMoney(decision.price) });
      note = t('contact.balanceNote', { price: formatMoney(decision.price), balance: formatMoney(balance) });
      break;
    case 'insufficient_funds':
      label = t('contact.open', { price: formatMoney(decision.price) });
      note = t('contact.noFunds', { price: formatMoney(decision.price), balance: formatMoney(balance) });
      break;
  }
  const blocked = decision.kind === 'insufficient_funds';

  return (
    <div className="contact">
      {redFlag && <p className="alert alert-red">{t('contact.redWarning', { flag: flagLabel(redFlag) })}</p>}
      {!redFlag && yellowFlag && <p className="alert alert-yellow">{t('contact.yellowNote')}</p>}
      {confirming ? (
        <div className="inline">
          <button className="btn btn-danger" onClick={doOpen}>
            {t('contact.openAnyway', {
              price:
                decision.kind === 'balance'
                  ? formatMoney(decision.price)
                  : decision.kind === 'package'
                    ? t('contact.pricePackage')
                    : t('contact.priceFree'),
            })}
          </button>
          <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
            {t('contact.cancel')}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" disabled={blocked} onClick={() => (redFlag ? setConfirming(true) : doOpen())}>
          {label}
        </button>
      )}
      <p className={blocked ? 'alert alert-neutral' : 'muted small'}>
        {note}
        {blocked && (
          <>
            <br />
            {t('contact.noFundsHint')} <Link to="/balance">{t('contact.topUpLink')}</Link>
          </>
        )}
      </p>
      {error && <p className="alert alert-red">{error}</p>}
    </div>
  );
}

function ContactDetails({ state, listing }: { state: AppState; listing: Listing }) {
  const owner = getCompany(state, listing.ownerId);
  const person = owner?.contactPersons.find((p) => p.id === listing.contactPersonId) ?? owner?.contactPersons[0];
  if (!person) return null;
  return (
    <dl className="facts">
      <dt>{t('contact.person')}</dt>
      <dd>{person.name}</dd>
      <dt>{t('contact.phone')}</dt>
      <dd className="selectable">{person.phone}</dd>
    </dl>
  );
}
