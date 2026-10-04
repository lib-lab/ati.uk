import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteTemplate, draftOf, editListing, postListing, saveTemplate } from '../../domain/commands/listings';
import { CITIES } from '../../domain/geo/cities';
import { postableKinds, validateDraft, type DraftErrors, type ListingDraft } from '../../domain/rules/listingDraft';
import type { BodyType, ListingKind, LoadingMethod, PaymentMethod } from '../../domain/types';
import { CONFIG } from '../../domain/config';
import { store, useAppState } from '../../store/store';
import { t } from '../i18n';
import { getCompany } from '../selectors';

const BODY_TYPES: BodyType[] = ['tent', 'box', 'reefer', 'flatbed', 'tanker', 'container', 'tipper'];
const LOADING: LoadingMethod[] = ['top', 'side', 'rear'];
const PAYMENT: PaymentMethod[] = ['bank_transfer', 'cash', 'card'];
const CITY_OPTIONS = [...CITIES].sort((a, b) => a.name.localeCompare(b.name));

/** Form state keeps raw strings for numbers and dates; converted on submit. */
interface Form {
  kind: ListingKind;
  contactPersonId: string;
  fromCityId: string;
  fromAddress: string;
  toCityId: string;
  toAny: boolean;
  dateFrom: string;
  dateTo: string;
  bodyTypes: BodyType[];
  weightT: string;
  volumeM3: string;
  loadingMethods: LoadingMethod[];
  rateMode: 'fixed' | 'on_request';
  rateAmount: string;
  vatIncluded: boolean;
  paymentMethod: PaymentMethod;
  comment: string;
  cargoName: string;
  packaging: string;
  pieces: string;
}

const day = (v: string) => (v ? `${v}T00:00:00.000Z` : '');
const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));

function toDraft(f: Form): ListingDraft {
  return {
    kind: f.kind,
    contactPersonId: f.contactPersonId,
    from: { cityId: f.fromCityId, address: f.fromAddress.trim() || undefined },
    to: f.kind === 'truck' && f.toAny ? { any: true } : { cityId: f.toCityId },
    dateFrom: day(f.dateFrom),
    dateTo: f.kind === 'cargo' && f.dateTo ? day(f.dateTo) : undefined,
    bodyTypes: f.bodyTypes,
    weightT: Number(f.weightT),
    volumeM3: numOrUndef(f.volumeM3),
    loadingMethods: f.loadingMethods,
    rate:
      f.rateMode === 'fixed'
        ? { mode: 'fixed', amount: Math.round(Number(f.rateAmount) * 100), currency: 'EUR', vatIncluded: f.vatIncluded, paymentMethod: f.paymentMethod }
        : { mode: 'on_request', currency: 'EUR' },
    comment: f.comment,
    ...(f.kind === 'cargo' ? { cargoName: f.cargoName, packaging: f.packaging, pieces: numOrUndef(f.pieces) } : {}),
  };
}

function emptyForm(kind: ListingKind, contactPersonId: string, today: string): Form {
  return {
    kind, contactPersonId, fromCityId: '', fromAddress: '', toCityId: '', toAny: false, dateFrom: today, dateTo: '',
    bodyTypes: [], weightT: '', volumeM3: '', loadingMethods: [], rateMode: 'fixed', rateAmount: '', vatIncluded: false,
    paymentMethod: 'bank_transfer', comment: '', cargoName: '', packaging: '', pieces: '',
  };
}

/** Fills the form from a (partial) draft: templates and editing. */
function formFromDraft(cur: Form, f: Partial<ListingDraft>, kind: ListingKind): Form {
  const to = f.to;
  return {
    ...cur,
    kind,
    contactPersonId: f.contactPersonId ?? cur.contactPersonId,
    fromCityId: f.from?.cityId ?? '',
    fromAddress: f.from?.address ?? '',
    toCityId: to && !('any' in to) ? to.cityId : '',
    toAny: !!to && 'any' in to,
    dateFrom: f.dateFrom ? f.dateFrom.slice(0, 10) : cur.dateFrom,
    dateTo: f.dateTo ? f.dateTo.slice(0, 10) : f.dateFrom ? '' : cur.dateTo,
    bodyTypes: f.bodyTypes ?? [],
    weightT: f.weightT !== undefined ? String(f.weightT) : '',
    volumeM3: f.volumeM3 !== undefined ? String(f.volumeM3) : '',
    loadingMethods: f.loadingMethods ?? [],
    rateMode: f.rate?.mode ?? 'fixed',
    rateAmount: f.rate?.amount !== undefined ? String(f.rate.amount / 100) : '',
    vatIncluded: f.rate?.vatIncluded ?? false,
    paymentMethod: f.rate?.paymentMethod ?? 'bank_transfer',
    comment: f.comment ?? '',
    cargoName: f.cargoName ?? '',
    packaging: f.packaging ?? '',
    pieces: f.pieces !== undefined ? String(f.pieces) : '',
  };
}

export function PostListingPage() {
  const state = useAppState((s) => s);
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const owner = getCompany(state, state.actorId);
  const editing = editId ? state.listings.find((l) => l.id === editId && l.ownerId === state.actorId) : undefined;
  const kinds = owner ? postableKinds(owner.role) : [];
  const today = state.now.slice(0, 10);
  const [form, setForm] = useState<Form>(() => {
    const empty = emptyForm(kinds[0] ?? 'cargo', owner?.contactPersons[0]?.id ?? '', today);
    return editing ? formFromDraft(empty, draftOf(editing), editing.kind) : empty;
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateMsg, setTemplateMsg] = useState<string | null>(null);

  const draft = useMemo(() => toDraft(form), [form]);
  const errors: DraftErrors = owner ? validateDraft(draft, owner, state.now) : {};
  if (!owner) return <p className="muted">{t('post.notCompany')}</p>;

  const templates = state.templates.filter((tp) => tp.companyId === owner.id && kinds.includes(tp.kind));
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const err = (field: keyof DraftErrors) => (submitted && errors[field] ? <span className="field-error">{t(errors[field]!)}</span> : null);
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const applyTemplate = (id: string) => {
    const tp = templates.find((x) => x.id === id);
    if (!tp) return;
    setForm((cur) => formFromDraft(cur, tp.fields as Partial<ListingDraft>, tp.kind));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    const res = store.run((s) => (editing ? editListing(s, editing.id, draft) : postListing(s, draft)));
    if (!res.ok) return setError(t(`error.${res.error}`));
    navigate(`/listing/${editing ? editing.id : res.state.listings.at(-1)!.id}`);
  };

  const onSaveTemplate = () => {
    const { dateFrom: _a, dateTo: _b, ...fields } = draft;
    const res = store.run((s) => saveTemplate(s, templateName, fields));
    setTemplateMsg(res.ok ? t('post.templateSaved', { name: templateName.trim() }) : t('post.templateNameRequired'));
    if (res.ok) setTemplateName('');
  };

  if (kinds.length === 0) return <p className="muted">{t('post.roleCannotPost')}</p>;

  return (
    <section>
      <h1>{editing ? t('post.editTitle', { id: editing.id }) : t('post.title')}</h1>
      {editing && <p className="alert alert-neutral">{t('post.editNote', { hours: CONFIG.editRefundHours })}</p>}
      {editId && !editing && <p className="alert alert-red">{t('error.not_allowed')}</p>}
      {!editing && kinds.length > 1 && (
        <div className="tabs" role="tablist">
          {kinds.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={form.kind === k} className={form.kind === k ? 'tab active' : 'tab'}
              onClick={() => set({ kind: k, toAny: false, dateTo: '', bodyTypes: form.bodyTypes.slice(0, k === 'truck' ? 1 : undefined) })}>
              {t(`kind.${k}.one`)}
            </button>
          ))}
        </div>
      )}
      {kinds.length === 1 && <p className="muted">{t('post.onlyKind', { kind: t(`kind.${kinds[0]}.one`) })}</p>}

      {!editing && templates.length > 0 && (
        <div className="inline template-bar">
          <label className="inline">
            <span className="muted">{t('post.fromTemplate')}</span>
            <select id="p-template" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="" disabled>{t('post.chooseTemplate')}</option>
              {templates.map((tp) => (
                <option key={tp.id} value={tp.id}>{tp.name} · {t(`kind.${tp.kind}.one`)}</option>
              ))}
            </select>
          </label>
          {templates.map((tp) => (
            <button key={tp.id} type="button" className="btn btn-small btn-ghost" onClick={() => store.run((s) => deleteTemplate(s, tp.id))}>
              {t('post.deleteTemplate', { name: tp.name })}
            </button>
          ))}
        </div>
      )}

      <form className="form" onSubmit={onSubmit} noValidate>
        <fieldset>
          <legend>{t('post.section.route')}</legend>
          <label>
            <span>{t('listing.field.from')} *</span>
            <select id="p-from" value={form.fromCityId} onChange={(e) => set({ fromCityId: e.target.value })}>
              <option value="">{t('post.chooseCity')}</option>
              {CITY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.country}</option>)}
            </select>
            {err('from')}
          </label>
          <label>
            <span>{t('post.address')}</span>
            <input id="p-address" value={form.fromAddress} onChange={(e) => set({ fromAddress: e.target.value })} />
          </label>
          <label>
            <span>{t('listing.field.to')} *</span>
            <select id="p-to" value={form.toCityId} disabled={form.toAny} onChange={(e) => set({ toCityId: e.target.value })}>
              <option value="">{t('post.chooseCity')}</option>
              {CITY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.country}</option>)}
            </select>
            {form.kind === 'truck' && (
              <span className="checkbox">
                <input id="p-toany" type="checkbox" checked={form.toAny} onChange={(e) => set({ toAny: e.target.checked })} />
                <label htmlFor="p-toany">{t('post.anyDestination')}</label>
              </span>
            )}
            {err('to')}
          </label>
          <label>
            <span>{form.kind === 'cargo' ? t('listing.field.loadingDate') : t('listing.field.availableFrom')} *</span>
            <input id="p-dfrom" type="date" min={today} value={form.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} />
            {err('dateFrom')}
          </label>
          {form.kind === 'cargo' && (
            <label>
              <span>{t('post.dateTo')}</span>
              <input id="p-dto" type="date" min={form.dateFrom || today} value={form.dateTo} onChange={(e) => set({ dateTo: e.target.value })} />
              {err('dateTo')}
            </label>
          )}
        </fieldset>

        <fieldset>
          <legend>{form.kind === 'cargo' ? t('post.section.cargo') : t('post.section.truck')}</legend>
          {form.kind === 'cargo' && (
            <>
              <label>
                <span>{t('post.cargoName')} *</span>
                <input id="p-cname" value={form.cargoName} onChange={(e) => set({ cargoName: e.target.value })} />
                {err('cargoName')}
              </label>
              <label>
                <span>{t('post.packaging')} *</span>
                <input id="p-pack" value={form.packaging} onChange={(e) => set({ packaging: e.target.value })} placeholder={t('post.packagingHint')} />
                {err('packaging')}
              </label>
              <label>
                <span>{t('post.pieces')} *</span>
                <input id="p-pieces" type="number" min={1} step={1} value={form.pieces} onChange={(e) => set({ pieces: e.target.value })} />
                {err('pieces')}
              </label>
            </>
          )}
          <div className="field-wide">
            <span className="label">{form.kind === 'cargo' ? t('post.bodyRequired') : t('post.bodyActual')} *</span>
            <div className="chips">
              {BODY_TYPES.map((b) => (
                <label key={b} className={form.bodyTypes.includes(b) ? 'chip active' : 'chip'}>
                  <input type="checkbox" checked={form.bodyTypes.includes(b)}
                    onChange={() => set({ bodyTypes: form.kind === 'truck' ? [b] : toggle(form.bodyTypes, b) })} />
                  {t(`body.${b}`)}
                </label>
              ))}
            </div>
            {err('bodyTypes')}
          </div>
          <label>
            <span>{form.kind === 'cargo' ? t('search.weight') : t('search.capacity')} *</span>
            <input id="p-weight" type="number" min={0} step={0.1} value={form.weightT} onChange={(e) => set({ weightT: e.target.value })} />
            {err('weightT')}
          </label>
          <label>
            <span>{t('search.volume')}</span>
            <input id="p-volume" type="number" min={0} step={1} value={form.volumeM3} onChange={(e) => set({ volumeM3: e.target.value })} />
            {err('volumeM3')}
          </label>
          <div className="field-wide">
            <span className="label">{form.kind === 'cargo' ? t('post.loadingRequired') : t('post.loadingAvailable')}</span>
            <div className="chips">
              {LOADING.map((m) => (
                <label key={m} className={form.loadingMethods.includes(m) ? 'chip active' : 'chip'}>
                  <input type="checkbox" checked={form.loadingMethods.includes(m)} onChange={() => set({ loadingMethods: toggle(form.loadingMethods, m) })} />
                  {t(`loading.${m}`)}
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('post.section.rate')}</legend>
          <div className="field-wide inline">
            <label className="checkbox">
              <input type="radio" name="p-rate" checked={form.rateMode === 'fixed'} onChange={() => set({ rateMode: 'fixed' })} />
              <span>{t('post.rateFixed')}</span>
            </label>
            <label className="checkbox">
              <input type="radio" name="p-rate" checked={form.rateMode === 'on_request'} onChange={() => set({ rateMode: 'on_request' })} />
              <span>{form.kind === 'cargo' ? t('rate.onRequest') : t('rate.negotiable')}</span>
            </label>
          </div>
          {form.rateMode === 'fixed' && (
            <>
              <label>
                <span>{t('post.amount')} *</span>
                <input id="p-amount" type="number" min={0} step={10} value={form.rateAmount} onChange={(e) => set({ rateAmount: e.target.value })} />
                {err('rate')}
              </label>
              <label>
                <span>{t('post.paymentMethod')}</span>
                <select id="p-payment" value={form.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value as PaymentMethod })}>
                  {PAYMENT.map((p) => <option key={p} value={p}>{t(`payment.${p}`)}</option>)}
                </select>
              </label>
              <label className="checkbox">
                <input id="p-vat" type="checkbox" checked={form.vatIncluded} onChange={(e) => set({ vatIncluded: e.target.checked })} />
                <span>{t('rate.vatIncluded')}</span>
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('post.section.contact')}</legend>
          <label>
            <span>{t('contact.person')} *</span>
            <select id="p-person" value={form.contactPersonId} onChange={(e) => set({ contactPersonId: e.target.value })}>
              {owner.contactPersons.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.phone}</option>)}
            </select>
            {err('contactPersonId')}
          </label>
          <label className="field-wide">
            <span>{t('listing.field.comment')}</span>
            <textarea id="p-comment" value={form.comment} onChange={(e) => set({ comment: e.target.value })} />
          </label>
        </fieldset>

        {submitted && Object.keys(errors).length > 0 && <p className="alert alert-red">{t('post.fixErrors')}</p>}
        {error && <p className="alert alert-red">{error}</p>}
        <div className="inline">
          <button type="submit" className="btn btn-primary">{editing ? t('post.saveChanges') : t('post.submit')}</button>
          <span className="muted small">{t('post.freeNote')}</span>
        </div>
        <div className="inline template-bar">
          <input id="p-tname" placeholder={t('post.templateName')} value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          <button type="button" className="btn btn-ghost" onClick={onSaveTemplate}>{t('post.saveTemplate')}</button>
          {templateMsg && <span className="muted small">{templateMsg}</span>}
        </div>
      </form>
    </section>
  );
}
