import { describe, expect, it } from 'vitest';
import { cargoDraft, company, NOW } from '../testing/fixtures';
import { addDays } from '../time';
import { canPost, extendedExpiry, validateDraft } from './listingDraft';

const owner = company('o');

describe('canPost', () => {
  it('follows the role table', () => {
    expect(canPost('shipper', 'cargo')).toBe(true);
    expect(canPost('shipper', 'truck')).toBe(false);
    expect(canPost('carrier', 'truck')).toBe(true);
    expect(canPost('carrier', 'cargo')).toBe(false);
    expect(canPost('forwarder', 'cargo')).toBe(true);
    expect(canPost('forwarder', 'truck')).toBe(true);
  });
});

describe('validateDraft', () => {
  it('accepts a complete cargo draft', () => {
    expect(validateDraft(cargoDraft(), owner, NOW)).toEqual({});
  });

  it('requires the fields needed to find the listing', () => {
    const e = validateDraft(
      cargoDraft({ from: { cityId: '' }, bodyTypes: [], weightT: 0, cargoName: ' ', packaging: '', pieces: 0, contactPersonId: 'x' }),
      owner,
      NOW,
    );
    expect(Object.keys(e).sort()).toEqual(['bodyTypes', 'cargoName', 'contactPersonId', 'from', 'packaging', 'pieces', 'weightT']);
  });

  it('checks dates: not in the past, range in order, range only for cargo', () => {
    expect(validateDraft(cargoDraft({ dateFrom: addDays(NOW, -1) }), owner, NOW).dateFrom).toBe('draft.dateInPast');
    expect(validateDraft(cargoDraft({ dateTo: addDays(NOW, 1) }), owner, NOW).dateTo).toBe('draft.rangeOrder');
    expect(validateDraft(cargoDraft({ kind: 'truck', dateTo: addDays(NOW, 5) }), owner, NOW).dateTo).toBe('draft.rangeCargoOnly');
  });

  it('cargo needs a destination; trucks may go anywhere but have one body type', () => {
    expect(validateDraft(cargoDraft({ to: { any: true } }), owner, NOW).to).toBe('draft.cargoNeedsDestination');
    const truck = cargoDraft({ kind: 'truck', to: { any: true }, cargoName: undefined, packaging: undefined, pieces: undefined });
    expect(validateDraft(truck, owner, NOW)).toEqual({});
    expect(validateDraft({ ...truck, bodyTypes: ['tent', 'box'] }, owner, NOW).bodyTypes).toBe('draft.truckOneBody');
  });

  it('fixed rate needs a positive amount; "on request" does not', () => {
    expect(validateDraft(cargoDraft({ rate: { mode: 'fixed', currency: 'EUR' } }), owner, NOW).rate).toBe('draft.positive');
    expect(validateDraft(cargoDraft({ rate: { mode: 'on_request', currency: 'EUR' } }), owner, NOW)).toEqual({});
  });
});

describe('extendedExpiry', () => {
  it('uses the normal lifetime when the dates are in the future', () => {
    expect(extendedExpiry('cargo', addDays(NOW, 5), undefined, NOW)).toBe('2026-10-11T23:59:59.999Z');
  });
  it('gives at least lifetime days from now when the dates have passed', () => {
    expect(extendedExpiry('cargo', addDays(NOW, -10), undefined, NOW)).toBe('2026-10-06T23:59:59.999Z');
    expect(extendedExpiry('truck', addDays(NOW, -10), undefined, NOW)).toBe('2026-10-08T23:59:59.999Z');
  });
});
