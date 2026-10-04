import type { RegistryRecord } from '../../domain/types';
import type { CompanyRegistry } from './CompanyRegistry';

/**
 * Deterministic stub. Known numbers (seed companies) return their stored record.
 * Unknown numbers are resolved by the last digit:
 *   0 → not found, 9 → liquidated, 8 → name mismatch, anything else → active.
 * For unknown numbers the stub has no name of its own: it returns the claimed name (a match),
 * except for 8.
 */
export class MockRegistry implements CompanyRegistry {
  private readonly known: Map<string, RegistryRecord>;

  constructor(records: RegistryRecord[] = []) {
    this.known = new Map(records.map((r) => [key(r.country, r.regNumber), r]));
  }

  async lookup(country: string, regNumber: string, claimedName = ''): Promise<RegistryRecord | null> {
    return this.lookupSync(country, regNumber, claimedName);
  }

  lookupSync(country: string, regNumber: string, claimedName = ''): RegistryRecord | null {
    const stored = this.known.get(key(country, regNumber));
    if (stored) return stored;
    const last = regNumber.trim().slice(-1);
    if (last === '0') return null;
    return {
      country,
      regNumber,
      legalName: last === '8' ? 'Registry name differs Ltd' : claimedName,
      address: 'Registry address 1',
      status: last === '9' ? 'liquidated' : 'active',
      foundedAt: '2019-01-01T00:00:00.000Z',
      reportsFiled: true,
    };
  }
}

const key = (country: string, regNumber: string) => `${country}:${regNumber.trim()}`;
