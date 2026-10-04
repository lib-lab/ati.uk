import type { Cents, Id } from '../../domain/types';

export interface TopUpResult {
  ok: boolean;
  /** Provider-side reference, stored for reconciliation. */
  externalId?: string;
  error?: string;
}

/**
 * External money in. Charges for contacts/promotion and refunds stay on the
 * internal ledger (domain/rules/ledger.ts) and do not go through the provider.
 */
export interface PaymentProvider {
  topUp(companyId: Id, amount: Cents, currency: string): Promise<TopUpResult>;
}
