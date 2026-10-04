import { describe, expect, it } from 'vitest';
import { computeExpiresAt, isExpired, needsExpiryReminder } from './lifetime';

describe('computeExpiresAt', () => {
  it('cargo lives until the end of loading day + 1', () => {
    expect(computeExpiresAt('cargo', '2026-10-10T08:00:00.000Z')).toBe('2026-10-11T23:59:59.999Z');
  });

  it('cargo with a loading range counts from the last day', () => {
    expect(computeExpiresAt('cargo', '2026-10-10T00:00:00.000Z', '2026-10-12T00:00:00.000Z')).toBe(
      '2026-10-13T23:59:59.999Z',
    );
  });

  it('truck lives until the end of availability date + 3', () => {
    expect(computeExpiresAt('truck', '2026-10-10T00:00:00.000Z')).toBe('2026-10-13T23:59:59.999Z');
  });

  it('handles month boundaries', () => {
    expect(computeExpiresAt('cargo', '2026-10-31T00:00:00.000Z')).toBe('2026-11-01T23:59:59.999Z');
  });
});

describe('isExpired', () => {
  const listing = { expiresAt: '2026-10-11T23:59:59.999Z' };
  it('is active before expiresAt', () => {
    expect(isExpired(listing, '2026-10-11T23:00:00.000Z')).toBe(false);
  });
  it('is expired at and after expiresAt', () => {
    expect(isExpired(listing, '2026-10-11T23:59:59.999Z')).toBe(true);
    expect(isExpired(listing, '2026-10-12T00:00:00.000Z')).toBe(true);
  });
});

describe('needsExpiryReminder', () => {
  const base = { status: 'active' as const, expiresAt: '2026-10-11T23:59:59.999Z' };
  it('not yet: more than 24h left', () => {
    expect(needsExpiryReminder(base, '2026-10-10T12:00:00.000Z')).toBe(false);
  });
  it('yes: within the last 24h', () => {
    expect(needsExpiryReminder(base, '2026-10-11T08:00:00.000Z')).toBe(true);
  });
  it('no: already sent', () => {
    expect(needsExpiryReminder({ ...base, reminderSentAt: '2026-10-11T01:00:00.000Z' }, '2026-10-11T08:00:00.000Z')).toBe(false);
  });
  it('no: already expired or not active', () => {
    expect(needsExpiryReminder(base, '2026-10-12T01:00:00.000Z')).toBe(false);
    expect(needsExpiryReminder({ ...base, status: 'removed' }, '2026-10-11T08:00:00.000Z')).toBe(false);
  });
});
