// Registry records the mock registry returns for seed companies.
import { CONFIG } from '../domain/config';
import { getCity } from '../domain/geo/cities';
import { addDays } from '../domain/time';
import type { RegistryRecord } from '../domain/types';
import { COMPANY_SPECS, MISMATCH_REGISTRY_NAME } from './companies';

export const SEED_REGISTRY_RECORDS: RegistryRecord[] = COMPANY_SPECS.map((s) => ({
  country: s.country,
  regNumber: s.regNumber,
  legalName: s.archetype === 'mismatch' ? MISMATCH_REGISTRY_NAME : s.legalName,
  address: `Registered office, ${getCity(s.homeCities[0]!).name}`,
  status: s.archetype === 'liquidated' ? 'liquidated' : 'active',
  foundedAt: addDays(CONFIG.clockStart, -Math.round(s.foundedYearsAgo * 365)),
  reportsFiled: s.reportsFiled,
}));
