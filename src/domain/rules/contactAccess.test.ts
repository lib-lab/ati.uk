import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { addDays } from '../time';
import { cargo, company, emptyState, NOW } from '../testing/fixtures';
import type { ContactAccess, LedgerTransaction } from '../types';
import { decideContact, freeContactsLeft } from './contactAccess';

const topup = (companyId: string, amount: number): LedgerTransaction => ({
  id: `t-${companyId}-${amount}`, companyId, type: 'topup', amount, createdAt: addDays(NOW, -30),
});
const access = (viewerId: string, ownerId: string, openedAt = NOW, paidWith: ContactAccess['paidWith'] = 'free_quota'): ContactAccess => ({
  id: `a-${viewerId}-${ownerId}`, viewerId, ownerId, firstListingId: '', openedAt, paidWith,
});

const base = () =>
  emptyState({
    companies: ['v', 'o', 'o2', 'o3', 'o4'].map((id) => company(id)),
    listings: [cargo('l1', 'o'), cargo('l2', 'o'), cargo('lopen', 'o2', { isOpen: true })],
  });

const listing = (s: ReturnType<typeof base>, id: string) => s.listings.find((l) => l.id === id)!;

describe('decideContact', () => {
  it('uses the free quota first', () => {
    const s = base();
    expect(decideContact(s, 'v', listing(s, 'l1'), NOW)).toEqual({ kind: 'free_quota', freeLeftAfter: 2 });
  });

  it('charges the balance when free contacts are used up', () => {
    const s = base();
    s.contactAccesses = [access('v', 'o2'), access('v', 'o3'), access('v', 'o4')];
    s.transactions = [topup('v', 2000)];
    expect(decideContact(s, 'v', listing(s, 'l1'), NOW)).toEqual({ kind: 'balance', price: CONFIG.prices.contact });
  });

  it('reports insufficient funds with price and balance', () => {
    const s = base();
    s.contactAccesses = [access('v', 'o2'), access('v', 'o3'), access('v', 'o4')];
    s.transactions = [topup('v', 300)];
    expect(decideContact(s, 'v', listing(s, 'l1'), NOW)).toEqual({ kind: 'insufficient_funds', price: CONFIG.prices.contact, balance: 300 });
  });

  it('uses an active package before the balance', () => {
    const s = base();
    s.contactAccesses = [access('v', 'o2'), access('v', 'o3'), access('v', 'o4')];
    s.packages = [{ id: 'p1', companyId: 'v', size: 20, used: 3, validFrom: addDays(NOW, -1), validTo: addDays(NOW, 29) }];
    expect(decideContact(s, 'v', listing(s, 'l1'), NOW)).toEqual({ kind: 'package', packageId: 'p1' });
    s.packages = [{ ...s.packages[0]!, used: 20 }];
    expect(decideContact(s, 'v', listing(s, 'l1'), NOW).kind).toBe('insufficient_funds');
  });

  it('is free forever once the owner’s contact was opened, on any of their listings', () => {
    const s = base();
    s.contactAccesses = [access('v', 'o', addDays(NOW, -400), 'balance')];
    expect(decideContact(s, 'v', listing(s, 'l2'), NOW)).toEqual({ kind: 'already_open' });
  });

  it('open listings are free and do not use the quota', () => {
    const s = base();
    expect(decideContact(s, 'v', listing(s, 'lopen'), NOW)).toEqual({ kind: 'open_listing' });
  });

  it('own listing needs nothing', () => {
    const s = base();
    expect(decideContact(s, 'o', listing(s, 'l1'), NOW)).toEqual({ kind: 'own_listing' });
  });

  it('is unavailable for the moderator and for inactive listings', () => {
    const s = base();
    expect(decideContact(s, 'moderator', listing(s, 'l1'), NOW)).toEqual({ kind: 'unavailable', reason: 'not_a_company' });
    const expired = { ...listing(s, 'l1'), status: 'expired' as const };
    expect(decideContact(s, 'v', expired, NOW)).toEqual({ kind: 'unavailable', reason: 'listing_inactive' });
  });
});

describe('free quota', () => {
  it('is 3 per calendar month and resets next month', () => {
    const s = base();
    s.contactAccesses = [access('v', 'o2'), access('v', 'o3'), access('v', 'o4')];
    expect(freeContactsLeft(s, 'v', NOW)).toBe(0);
    expect(freeContactsLeft(s, 'v', '2026-11-01T00:00:00.000Z')).toBe(3);
  });

  it('a refunded free contact returns the slot', () => {
    const s = base();
    s.contactAccesses = [{ ...access('v', 'o2'), refundedAt: NOW }, access('v', 'o3')];
    expect(freeContactsLeft(s, 'v', NOW)).toBe(2);
  });
});
