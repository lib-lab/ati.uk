// Test-mode top-up. The payment provider is called by the UI first; this records the result.
// Contact packages are paid from the balance.
import { CONFIG } from '../config';
import { logEvent, nextId } from '../events';
import { activePackage } from '../rules/contactAccess';
import { balanceOf } from '../rules/ledger';
import { addDays } from '../time';
import type { AppState, Cents, ContactPackage, Id } from '../types';
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

/**
 * Contact package (TZ monetisation): N contacts valid for D days, paid from the balance.
 * A new package is sold only when the current one is used up or expired (see DECISIONS "Packages").
 */
export function buyPackage(state: AppState): CommandResult {
  const company = state.companies.find((c) => c.id === state.actorId && c.status !== 'deleted');
  if (!company) return { ok: false, error: 'not_allowed' };
  if (activePackage(state, company.id, state.now)) return { ok: false, error: 'package_active' };
  const { size, days, price } = CONFIG.prices.package;
  if (balanceOf(state.transactions, company.id) < price) return { ok: false, error: 'insufficient_funds' };
  let [s, packageId] = nextId(state, 'p');
  let txId: Id;
  [s, txId] = nextId(s, 't');
  const pkg: ContactPackage = { id: packageId, companyId: company.id, size, used: 0, validFrom: s.now, validTo: addDays(s.now, days) };
  s = {
    ...s,
    packages: [...s.packages, pkg],
    transactions: [...s.transactions, { id: txId, companyId: company.id, type: 'package', amount: -price, createdAt: s.now, refId: packageId }],
  };
  return {
    ok: true,
    state: logEvent(s, {
      type: 'payment',
      actor: company.id,
      subjectIds: [company.id, packageId, txId],
      reasonKey: 'event.payment.package',
      params: { amount: price, size, until: pkg.validTo },
    }),
  };
}
