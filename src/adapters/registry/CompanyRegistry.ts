import type { RegistryRecord } from '../../domain/types';

/**
 * Company registry lookup (KRS/CEIDG, Handelsregister, Companies House...).
 * Swap the implementation per market; the rest of the app only sees RegistryRecord.
 */
export interface CompanyRegistry {
  /**
   * Resolves to null when the number is not found. `claimedName` is the name the company gave;
   * real registries ignore it, the stub echoes it for unknown numbers (see MockRegistry).
   */
  lookup(country: string, regNumber: string, claimedName?: string): Promise<RegistryRecord | null>;
}
