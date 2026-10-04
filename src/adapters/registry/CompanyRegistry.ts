import type { RegistryRecord } from '../../domain/types';

/**
 * Company registry lookup (KRS/CEIDG, Handelsregister, Companies House...).
 * Swap the implementation per market; the rest of the app only sees RegistryRecord.
 */
export interface CompanyRegistry {
  /** Resolves to null when the number is not found. */
  lookup(country: string, regNumber: string): Promise<RegistryRecord | null>;
}
