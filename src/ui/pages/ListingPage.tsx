import { Link, useParams } from 'react-router-dom';
import { hasPriority } from '../../domain/rules/search';
import { useAppState } from '../../store/store';
import { ContactBlock } from '../components/ContactBlock';
import { OwnerSummary } from '../components/OwnerSummary';
import { formatDate, formatDateTime } from '../format';
import { t } from '../i18n';
import { bodyText, dateText, distanceKm, fromName, ratePerKmText, rateText, toName } from '../listingFormat';
import { getCompany, getRating } from '../selectors';

export function ListingPage() {
  const { id } = useParams();
  const state = useAppState((s) => s);
  const listing = state.listings.find((l) => l.id === id);

  if (!listing) {
    return (
      <section>
        <Link to="/search">← {t('listing.back')}</Link>
        <p>{t('listing.notFound')}</p>
      </section>
    );
  }

  const owner = getCompany(state, listing.ownerId)!;
  const rating = getRating(state, owner.id);
  const km = distanceKm(listing);
  const perKm = ratePerKmText(listing);
  const r = listing.rate;

  return (
    <section>
      <Link to="/search">← {t('listing.back')}</Link>
      <h1>
        {t('listing.title', { kind: t(`kind.${listing.kind}.one`), from: fromName(listing), to: toName(listing) })}
      </h1>
      <div className="badges">
        {hasPriority(listing, state.now) && <span className="badge badge-accent">{t('listing.priority')}</span>}
        {listing.isOpen && <span className="badge badge-neutral">{t('listing.open')}</span>}
        <span className="muted small">{listing.id}</span>
      </div>
      {listing.status !== 'active' && <p className="alert alert-neutral">{t(`listing.status.${listing.status}`)}</p>}

      <div className="card-layout">
        <div className="panel">
          <dl className="facts">
            <dt>{t('listing.field.from')}</dt>
            <dd>{fromName(listing)}{listing.from.address && <span className="muted">, {listing.from.address}</span>}</dd>
            <dt>{t('listing.field.to')}</dt>
            <dd>{toName(listing)}</dd>
            {km !== null && (
              <>
                <dt>{t('listing.field.distance')}</dt>
                <dd>{t('listing.distanceApprox', { km })}</dd>
              </>
            )}
            <dt>{listing.kind === 'cargo' ? t('listing.field.loadingDate') : t('listing.field.availableFrom')}</dt>
            <dd>{dateText(listing)}</dd>
            {listing.kind === 'cargo' && (
              <>
                <dt>{t('listing.field.cargo')}</dt>
                <dd>{t('listing.cargoLine', { name: listing.cargoName, packaging: listing.packaging, pieces: listing.pieces })}</dd>
              </>
            )}
            <dt>{t('listing.field.body')}</dt>
            <dd>{bodyText(listing)}</dd>
            <dt>{listing.kind === 'cargo' ? t('listing.field.weight') : t('listing.field.capacity')}</dt>
            <dd>{listing.weightT} t</dd>
            {listing.volumeM3 !== undefined && (
              <>
                <dt>{t('listing.field.volume')}</dt>
                <dd>{listing.volumeM3} m³</dd>
              </>
            )}
            <dt>{t('listing.field.loading')}</dt>
            <dd>{listing.loadingMethods.map((m) => t(`loading.${m}`)).join(', ')}</dd>
            <dt>{t('listing.field.rate')}</dt>
            <dd>
              {rateText(listing)}
              {perKm && <span className="muted"> · {perKm}</span>}
              {r.mode === 'fixed' && (
                <div className="muted small">
                  {r.vatIncluded ? t('rate.vatIncluded') : t('rate.vatExcluded')}
                  {r.paymentMethod && ` · ${t(`payment.${r.paymentMethod}`)}`}
                </div>
              )}
            </dd>
            {listing.comment && (
              <>
                <dt>{t('listing.field.comment')}</dt>
                <dd>{listing.comment}</dd>
              </>
            )}
            <dt>{t('listing.field.posted')}</dt>
            <dd>{formatDateTime(listing.createdAt)}</dd>
            <dt>{t('listing.field.expires')}</dt>
            <dd>{formatDate(listing.expiresAt)}</dd>
          </dl>
        </div>

        <aside className="panel">
          <h2>{t('owner.title')}</h2>
          <OwnerSummary rating={rating} company={owner} />
          <h2>{t('contact.title')}</h2>
          <ContactBlock state={state} listing={listing} ownerRating={rating} />
        </aside>
      </div>
    </section>
  );
}
