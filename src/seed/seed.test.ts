import { describe, expect, it } from 'vitest';
import { CONFIG } from '../domain/config';
import { activeFlags } from '../domain/rules/flags';
import { balanceOf } from '../domain/rules/ledger';
import { isExpired } from '../domain/rules/lifetime';
import { monthKey } from '../domain/time';
import { buildSeedState, SEED_ACTIVE_CARGO, SEED_ACTIVE_TRUCKS } from './index';
import { COMPANY_SPECS } from './companies';
import { RING_SPECS } from './ring';

const state = buildSeedState();

describe('seed', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(buildSeedState())).toBe(JSON.stringify(state));
  });

  it('has 15–21 companies covering all roles (18 archetypes + a ring of 3)', () => {
    expect(state.companies.length).toBeGreaterThanOrEqual(15);
    expect(state.companies.length).toBeLessThanOrEqual(21);
    const roles = new Set(state.companies.map((c) => c.role));
    expect(roles).toEqual(new Set(['shipper', 'carrier', 'forwarder']));
  });

  it('has 50+ active, non-expired listings', () => {
    const active = state.listings.filter((l) => l.status === 'active');
    // + the ring's own listings (2 cargo, 1 truck)
    expect(active.filter((l) => l.kind === 'cargo')).toHaveLength(SEED_ACTIVE_CARGO + 2);
    expect(active.filter((l) => l.kind === 'truck')).toHaveLength(SEED_ACTIVE_TRUCKS + 1);
    for (const l of active) expect(isExpired(l, state.now)).toBe(false);
  });

  it('has unique ids', () => {
    const all = [
      ...state.companies, ...state.listings, ...state.contactAccesses, ...state.transactions,
      ...state.reviews, ...state.claims, ...state.flags,
    ].map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('respects role permissions for posting', () => {
    const roleOf = new Map(state.companies.map((c) => [c.id, c.role]));
    for (const l of state.listings) {
      const role = roleOf.get(l.ownerId);
      if (l.kind === 'cargo') expect(role).not.toBe('carrier');
      else expect(role).not.toBe('shipper');
    }
  });

  it('every review is backed by a contact access, one per pair', () => {
    for (const r of state.reviews) {
      expect(state.contactAccesses.some((a) => a.viewerId === r.authorId && a.ownerId === r.targetId)).toBe(true);
    }
    const pairs = state.contactAccesses.map((a) => `${a.viewerId}>${a.ownerId}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('balances match the specs and are never negative over time', () => {
    for (const spec of [...COMPANY_SPECS, ...RING_SPECS]) {
      expect(balanceOf(state.transactions, spec.id)).toBe(spec.balanceEur * 100);
      let running = 0;
      for (const t of state.transactions.filter((t) => t.companyId === spec.id)) {
        running += t.amount;
        expect(running).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('free contacts used this month match the specs', () => {
    for (const spec of COMPANY_SPECS) {
      const used = state.contactAccesses.filter(
        (a) => a.viewerId === spec.id && a.paidWith === 'free_quota' && monthKey(a.openedAt) === monthKey(state.now),
      );
      expect(used).toHaveLength(spec.freeUsedThisMonth);
    }
  });

  it('contains the reputation archetypes scenarios need', () => {
    const red = (id: string) => activeFlags(state.flags, id).filter((f) => f.level === 'red').map((f) => f.kind);
    const yellow = (id: string) => activeFlags(state.flags, id).filter((f) => f.level === 'yellow').map((f) => f.kind);
    expect(red('c11')).toContain('liquidated');
    expect(red('c12')).toContain('data_mismatch');
    expect(red('c18')).toContain('fraud_blocked');
    expect(yellow('c13')).toEqual(['suspected_linked']);
    expect(state.reviews.filter((r) => r.targetId === 'c06')).toHaveLength(0);
    expect(state.reviews.filter((r) => r.targetId === 'c07')).toHaveLength(1);
    expect(state.claims.filter((c) => c.targetId === 'c09' && c.status === 'open')).toHaveLength(2);
    // Reliable companies have old reviews (>12 months) too.
    const old = state.reviews.filter((r) => r.targetId === 'c01' && r.createdAt < '2025-10-05');
    expect(old.length).toBeGreaterThan(0);
  });

  it('the ring reviews only inside itself and nobody outside interacts with it', () => {
    const ring = new Set(RING_SPECS.map((s) => s.id));
    const touching = [
      ...state.reviews.map((r) => [r.authorId, r.targetId]),
      ...state.contactAccesses.map((a) => [a.viewerId, a.ownerId]),
      ...state.claims.map((c) => [c.claimantId, c.targetId]),
    ].filter(([a, b]) => ring.has(a!) || ring.has(b!));
    expect(touching.length).toBe(12); // 6 reviews + 6 contacts
    expect(touching.every(([a, b]) => ring.has(a!) && ring.has(b!))).toBe(true);
  });

  it('clock starts at the configured date', () => {
    expect(state.now).toBe(CONFIG.clockStart);
  });
});
