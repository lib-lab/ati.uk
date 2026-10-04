import type { Cents, Id } from '../../domain/types';
import type { PaymentProvider, TopUpResult } from './PaymentProvider';

/** Test mode: every top-up succeeds instantly. */
export class MockPayments implements PaymentProvider {
  private counter = 0;

  async topUp(_companyId: Id, amount: Cents, _currency: string): Promise<TopUpResult> {
    if (amount <= 0) return { ok: false, error: 'amount_must_be_positive' };
    this.counter += 1;
    return { ok: true, externalId: `mock-${this.counter}` };
  }
}
