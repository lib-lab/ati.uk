// Composition root for adapters. Replace mocks here to plug in real integrations.
import { MockEmail } from './notifications/MockEmail';
import { MockPayments } from './payments/MockPayments';
import { MockRegistry } from './registry/MockRegistry';
import type { CompanyRegistry } from './registry/CompanyRegistry';
import type { PaymentProvider } from './payments/PaymentProvider';
import type { EmailChannel } from './notifications/EmailChannel';
import { SEED_REGISTRY_RECORDS } from '../seed/registry';

/**
 * Test inbox: every e-mail of the prototype is addressed here (companies have no e-mail in the
 * TZ data model). MockEmail only keeps messages in memory; a real EmailChannel would deliver them.
 */
export const TEST_INBOX = '90569oc62@mozmail.com';

export interface Adapters {
  registry: CompanyRegistry;
  payments: PaymentProvider;
  email: EmailChannel;
}

const registry = new MockRegistry(SEED_REGISTRY_RECORDS);

export const adapters: Adapters = {
  registry,
  payments: new MockPayments(),
  email: new MockEmail(),
};

/**
 * Synchronous lookup for the daily registry check inside the simulated clock tick. Only the stub
 * can answer synchronously; with a real registry the check runs as a background job (DECISIONS).
 */
export const registryLookupSync = (country: string, regNumber: string, claimedName: string) =>
  registry.lookupSync(country, regNumber, claimedName);
