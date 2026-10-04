// Test-mode top-up. The payment provider is called by the UI first; this records the result.
import { logEvent, nextId } from '../events';
import type { AppState, Cents, Id } from '../types';
import type { CommandResult } from './result';

export function topUp(state: AppState, companyId: Id, amount: Cents, externalId: string): CommandResult {
  if (!state.companies.some((c) => c.id === companyId)) return { ok: false, error: 'company_not_found' };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, error: 'not_allowed' };
  const [s, txId] = nextId(state, 't');
  const next: AppState = {
    ...s,
    transactions: [...s.transactions, { id: txId, companyId, type: 'topup', amount, createdAt: s.now, refId: externalId }],
  };
  return {
    ok: true,
    state: logEvent(next, {
      type: 'balance_topup',
      actor: companyId,
      subjectIds: [companyId, txId],
      reasonKey: 'event.topup',
      params: { amount },
    }),
  };
}
