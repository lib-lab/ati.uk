import { describe, expect, it } from 'vitest';
import { MockRegistry } from './MockRegistry';
import { SEED_REGISTRY_RECORDS } from '../../seed/registry';

describe('MockRegistry', () => {
  const registry = new MockRegistry(SEED_REGISTRY_RECORDS);

  it('returns stored records for seed companies', async () => {
    const rec = await registry.lookup('PL', '5251234561');
    expect(rec?.legalName).toBe('Vistula Logistics sp. z o.o.');
  });

  it('resolves unknown numbers by the last digit', async () => {
    expect(await registry.lookup('PL', '1111111110')).toBeNull();
    expect((await registry.lookup('PL', '1111111119'))?.status).toBe('liquidated');
    expect((await registry.lookup('PL', '1111111118'))?.legalName).toBe('Registry name differs Ltd');
    expect((await registry.lookup('PL', '1111111112'))?.status).toBe('active');
    // unknown numbers echo the claimed name (a match), except 8
    expect((await registry.lookup('PL', '1111111112', 'New Co'))?.legalName).toBe('New Co');
    expect((await registry.lookup('PL', '1111111118', 'New Co'))?.legalName).toBe('Registry name differs Ltd');
  });
});
