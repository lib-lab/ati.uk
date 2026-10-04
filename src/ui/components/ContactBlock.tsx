// "Open contact" with price, state messages and red-flag warning (TZ: listing card).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { openContact } from '../../domain/commands/contacts';
import { claimEditRefund } from '../../domain/commands/listings';
import { openingGate } from '../../domain/rules/collection';
import { revealContact, type PublicListing } from '../../domain/rules/contactPrivacy';
import { refundFor } from '../../domain/rules/complaints';
import { editRefund } from '../../domain/rules/listingEdits';
import { CONFIG } from '../../domain/config';
import { decideContact, findAccess } from '../../domain/rules/contactAccess';
import { balanceOf } from '../../domain/rules/ledger';
import type { AppState, Listing, Rating } from '../../domain/types';
import { store } from '../../store/store';
import { formatDate, formatMoney } from '../format';
import { t } from '../i18n';
import { flagLabel } from './FlagBadge';

export function ContactBlock({ state, listing, ownerRating }: { state: AppState; listing: PublicListing; ownerRating: Rating }) {
  const [confirming, setConfirming] = useState(false);
  const [human, setHuman] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewerId = state.actorId;
  // decideContact only needs public fields; the contact person stays hidden.
  const decision = decideContact(state, viewerId, listing as Listing, state.now);
  const redFlag = ownerRating.redFlags[0];
  const yellowFlag = ownerRating.yellowFlags[0];

  const doOpen = () => {
    const res = store.run((s) => openContact(s, listing.id, { viaCard: true, humanConfirmed: human }));
    setError(res.ok ? null : t(`error.${res.error}`));
    setConfirming(false);
  };

  if (decision.kind === 'own_listing' || decision.kind === 'already_open') {
    const access = findAccess(state, viewerId, listing.ownerId);
    // An already opened contact is shown on this listing only after "Show" (it is logged for change notifications).
    const revealedHere =
      decision.kind === 'own_listing' || state.contactOpenings.some((o) => o.viewerId === viewerId && o.listingId === listing.id);
    // The button shows only when something can actually be returned (e.g. not for an expired package).
    const refund = decision.kind === 'already_open' && editRefund(state, viewerId, listing.id) && refundFor(state, access, state.now).kind !== 'none';
    return (
      <div className="contact">
        {revealedHere ? (
          <ContactDetails state={state} listingId={listing.id} />
        ) : (
          <button className="btn btn-primary" onClick={doOpen}>{t('contact.showOpened')}</button>
        )}
        <p className="muted small">
          {decision.kind === 'own_listing' || !access ? t('contact.own') : t('contact.repeatNote', { date: formatDate(access.openedAt) })}
          {decision.kind === 'own_listing' && <> <Link to="/my-listings">{t('contact.manage')}</Link></>}
          {decision.kind === 'already_open' && <> <Link to={`/company/${listing.ownerId}`}>{t('contact.reviewLink')}</Link></>}
        </p>
        {refund && (
          <div className="alert alert-yellow">
            {t('contact.editRefund', { hours: CONFIG.editRefundHours })}{' '}
            <button className="btn btn-small" onClick={() => {
              const res = store.run((st) => claimEditRefund(st, listing.id));
              setError(res.ok ? null : t(`error.${res.error}`));
            }}>{t('contact.editRefundButton')}</button>
          </div>
        )}
        {error && <p className="alert alert-red">{error}</p>}
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
      {
        const pkg = state.packages.find((p) => p.id === decision.packageId)!;
        note = t('contact.packageNote', { left: pkg.size - pkg.used - 1, size: pkg.size, until: formatDate(pkg.validTo) });
      }
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
  // Limits that hold even after the human check are shown first; the check is offered only when it helps.
  const gate = openingGate(state, viewerId, state.now, true);
  const gateBlocks = gate.kind !== 'ok';
  const needsHuman = !gateBlocks && openingGate(state, viewerId, state.now, false).kind === 'human_check';
  const blocked = decision.kind === 'insufficient_funds' || gateBlocks || (needsHuman && !human);

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
      {needsHuman && (
        <label className="checkbox human-check">
          <input id="human-check" type="checkbox" checked={human} onChange={(e) => setHuman(e.target.checked)} />
          <span>{t('contact.humanCheck')}</span>
        </label>
      )}
      {gate.kind === 'blocked' && <p className="alert alert-red">{t('contact.gate.blocked')}</p>}
      {gate.kind === 'daily_limit' && <p className="alert alert-neutral">{t('contact.gate.dailyLimit', { limit: gate.limit })} <Link to="/account">{t('contact.gate.raise')}</Link></p>}
      {gate.kind === 'slow_down' && <p className="alert alert-neutral">{t('contact.gate.slowDown', { perHour: gate.perHour })}</p>}
      <p className={decision.kind === 'insufficient_funds' ? 'alert alert-neutral' : 'muted small'}>
        {note}
        {decision.kind === 'insufficient_funds' && (
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

/** The contact comes only from the domain access rule (revealContact), never from listing data. */
function ContactDetails({ state, listingId }: { state: AppState; listingId: string }) {
  const res = revealContact(state, state.actorId, listingId);
  if (!res.ok) return <p className="alert alert-neutral">{t(`contact.reveal.${res.reason}`)}</p>;
  return (
    <dl className="facts">
      <dt>{t('contact.person')}</dt>
      <dd>{res.person.name}</dd>
      <dt>{t('contact.phone')}</dt>
      <dd className="selectable">{res.person.phone}</dd>
    </dl>
  );
}
