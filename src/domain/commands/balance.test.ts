import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { refundFor } from '../rules/complaints';
import { balanceOf } from '../rules/ledger';
import { cargo, company, emptyState, NOW } from '../testing/fixtures';
import { addDays } from '../time';
import type { AppState } from '../types';
import { buyPackage, topUp } from './balance';
import { openContact } from './contacts';
import { refundContact } from './moderation';
import type { CommandResult } from './result';
import { advanceTime } from './time';

describe('topUp', () => {
  const s = emptyState({ companies: [company('a')] });

  it('adds a top-up transaction and logs it', () => {
    const res = topUp(s, 'a', 1000, 'mock-1');
    if (!res.ok) throw new Error(res.error);
    expect(balanceOf(res.state.transactions, 'a')).toBe(1000);
    expect(res.state.transactions[0]).toMatchObject({ type: 'topup', amount: 1000, refId: 'mock-1' });
    expect(res.state.events[0]).toMatchObject({ type: 'balance_topup', params: { amount: 1000 } });
  });

  it('rejects non-positive or fractional amounts and unknown companies', () => {
    expect(topUp(s, 'a', 0, 'x').ok).toBe(false);
    expect(topUp(s, 'a', -100, 'x').ok).toBe(false);
    expect(topUp(s, 'a', 10.5, 'x').ok).toBe(false);
    expect(topUp(s, 'zzz', 100, 'x')).toEqual({ ok: false, error: 'company_not_found' });
  });
});

describe('contact packages', () => {
  const { size, days, price } = CONFIG.prices.package;
  const ok = (r: CommandResult): AppState => {
    if (!r.ok) throw new Error(r.error);
    return r.state;
  };
  /** Viewer "v" (free contacts used up this month) and `owners` companies with one cargo listing each. */
  function market(balance: number, owners = 3): AppState {
    const ownerIds = Array.from({ length: owners }, (_, i) => `o${i}`);
    return emptyState({
      actorId: 'v',
      companies: [company('v'), ...ownerIds.map((id) => company(id, { role: 'shipper' }))],
      listings: ownerIds.map((id) => cargo(`l-${id}`, id, { dateFrom: addDays(NOW, 40) })), // still active after the package expires
      transactions: [{ id: 't0', companyId: 'v', type: 'topup', amount: balance, createdAt: addDays(NOW, -40) }],
      contactAccesses: ['x1', 'x2', 'x3'].map((x) => ({ id: `v-${x}`, viewerId: 'v', ownerId: x, firstListingId: '', openedAt: NOW, paidWith: 'free_quota' as const })),
    });
  }

  it('buying: paid from the balance, valid for the configured days, logged', () => {
    const s = ok(buyPackage(market(price + 500)));
    expect(s.packages).toEqual([{ id: expect.any(String), companyId: 'v', size, used: 0, validFrom: NOW, validTo: addDays(NOW, days) }]);
    expect(balanceOf(s.transactions, 'v')).toBe(500);
    expect(s.transactions.at(-1)).toMatchObject({ type: 'package', amount: -price, refId: s.packages[0]!.id });
    expect(s.events.at(-1)).toMatchObject({ type: 'payment', reasonKey: 'event.payment.package' });
  });

  it('not enough balance, or a package still active: refused', () => {
    expect(buyPackage(market(price - 1))).toEqual({ ok: false, error: 'insufficient_funds' });
    const s = ok(buyPackage(market(price * 2)));
    expect(buyPackage(s)).toEqual({ ok: false, error: 'package_active' });
    // used up → a new one can be bought
    const usedUp = { ...s, packages: s.packages.map((p) => ({ ...p, used: p.size })) };
    expect(ok(buyPackage(usedUp)).packages).toHaveLength(2);
  });

  it('openings after the free ones come from the package, the balance does not change; after expiry the balance pays again', () => {
    let s = ok(buyPackage(market(price + 1000)));
    const balance = balanceOf(s.transactions, 'v');
    s = ok(openContact(s, 'l-o0'));
    expect(s.contactAccesses.at(-1)).toMatchObject({ paidWith: 'package', packageId: s.packages[0]!.id });
    expect(s.packages[0]!.used).toBe(1);
    expect(balanceOf(s.transactions, 'v')).toBe(balance);
    s = ok(advanceTime(s, addDays(NOW, 35))); // "+1 week" × 5: the package has expired
    // use up the new month's free contacts, so the next opening is paid
    s = { ...s, contactAccesses: [...s.contactAccesses, ...['y1', 'y2', 'y3'].map((x) => ({ id: `v-${x}`, viewerId: 'v', ownerId: x, firstListingId: '', openedAt: s.now, paidWith: 'free_quota' as const }))] };
    const before = balanceOf(s.transactions, 'v');
    s = ok(openContact(s, 'l-o1'));
    expect(s.contactAccesses.at(-1)).toMatchObject({ paidWith: 'balance' });
    expect(balanceOf(s.transactions, 'v')).toBe(before - CONFIG.prices.contact);
    expect(s.packages[0]!.used).toBe(1);
  });

  it('a confirmed complaint returns a package contact to the package while it is valid', () => {
    let s = ok(buyPackage(market(price)));
    s = ok(openContact(s, 'l-o0'));
    const access = s.contactAccesses.at(-1)!;
    const back = refundContact(s, 'v', 'o0', 'cmp1');
    expect(back.packages[0]!.used).toBe(0);
    expect(back.contactAccesses.find((a) => a.id === access.id)!.refundedAt).toBe(NOW);
    expect(back.events.at(-1)).toMatchObject({ reasonKey: 'event.refund.package' });
    expect(back.notifications.at(-1)).toMatchObject({ type: 'refund', params: { variant: 'package' } });
    const expired = { ...s, now: addDays(NOW, days + 1) };
    expect(refundFor(expired, access, expired.now)).toEqual({ kind: 'none', reason: 'package_expired' });
  });
});
