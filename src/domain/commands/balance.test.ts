import { describe, expect, it } from 'vitest';
import { balanceOf } from '../rules/ledger';
import { company, emptyState } from '../testing/fixtures';
import { topUp } from './balance';

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
