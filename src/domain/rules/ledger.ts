// Internal balance: a ledger of signed transactions.
import type { Cents, Id, LedgerTransaction } from '../types';

export function balanceOf(transactions: readonly LedgerTransaction[], companyId: Id): Cents {
  let sum = 0;
  for (const t of transactions) if (t.companyId === companyId) sum += t.amount;
  return sum;
}
