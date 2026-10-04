// Composition root for adapters. Replace mocks here to plug in real integrations.
import { MockEmail } from './notifications/MockEmail';
import { MockPayments } from './payments/MockPayments';
import { MockRegistry } from './registry/MockRegistry';
import type { CompanyRegistry } from './registry/CompanyRegistry';
import type { PaymentProvider } from './payments/PaymentProvider';
import type { EmailChannel } from './notifications/EmailChannel';
import { SEED_REGISTRY_RECORDS } from '../seed/registry';

export interface Adapters {
  registry: CompanyRegistry;
  payments: PaymentProvider;
  email: EmailChannel;
}

export const adapters: Adapters = {
  registry: new MockRegistry(SEED_REGISTRY_RECORDS),
  payments: new MockPayments(),
  email: new MockEmail(),
};
