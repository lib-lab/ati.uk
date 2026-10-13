import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppState } from '../../domain/types';
import { readableParams } from '../eventText';
import { formatDate, formatDateTime, formatNumber } from '../format';
import { en } from './en';
import { setLanguage, t } from './index';
import { ru } from './ru';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
  });
}

describe('i18n', () => {
  it('has a text for every event reason key used in the domain', () => {
    const keys = new Set<string>();
    for (const f of files('src/domain')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(event\.[a-zA-Z.]+)'/g)) keys.add(m[1]!);
    }
    // contactOpened keys are built from paidWith values
    for (const pw of ['free_quota', 'package', 'balance', 'open_listing']) keys.add(`event.contactOpened.${pw}`);
    for (const r of ['found_on_platform', 'found_elsewhere', 'not_relevant']) keys.add(`event.listing.removed.${r}`);
    for (const t of ['event', 'flag', 'complaint', 'claim']) {
      keys.add(`event.dispute.opened.${t}`);
      keys.add(`event.dispute.accepted.${t}`);
      keys.add(`event.rating.disputeAccepted.${t}`);
    }
    for (const type of ['outdated', 'no_response', 'wrong_contact']) keys.add(`event.complaint.filed.${type}`);
    for (const st of ['confirmed', 'rejected']) keys.add(`event.complaint.${st}`);
    for (const kind of ['fraud_blocked', 'suspected_linked', 'liquidated', 'data_mismatch']) {
      keys.add(`event.flag.set.${kind}`);
      keys.add(`event.flag.resolved.${kind}`);
    }
    for (const kind of ['fraud_blocked', 'suspected_linked']) {
      keys.add(`event.rating.flag.${kind}`);
      keys.add(`event.rating.flagResolved.${kind}`);
    }
    for (const kind of ['money', 'quota', 'package']) {
      keys.add(`event.refund.${kind}`);
      keys.add(`event.refund.${kind}Edit`);
    }
    for (const f of ['instant', 'hourly']) {
      keys.add(`event.subscription.saved.${f}`);
      keys.add(`event.subscription.frequency.${f}`);
    }
    for (const k of [...keys]) if (k.endsWith('.')) keys.delete(k);
    const missing = [...keys].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('has a text for every notification the domain creates', () => {
    const keys = [
      'notification.expiry_reminder',
      'notification.listing_expired',
      'notification.refund.money',
      'notification.refund.quota',
      'notification.complaint_resolved.confirmed',
      'notification.complaint_resolved.rejected',
      'notification.listings_hidden',
      'notification.complaint_received.outdated',
      'notification.complaint_received.no_response',
      'notification.complaint_received.wrong_contact',
      'notification.claim_received',
      'notification.deactivated',
      'notification.inactivity_warning',
      'notification.flag_set.data_mismatch',
      'notification.flag_set.suspected_linked',
      'notification.flag_set.fraud_blocked',
      'notification.flag_set.liquidated',
      'notification.flag_escalated.data_mismatch',
      'notification.dispute_resolved.accepted',
      'notification.dispute_resolved.rejected',
      'notification.listing_changed.key',
      'notification.listing_changed.minor',
      'notification.refund.moneyEdit',
      'notification.refund.quotaEdit',
      'notification.collection_slowed',
      'notification.collection_blocked',
      'notification.refund.package',
      'notification.refund.packageEdit',
      'notification.subscription_match',
      'notification.subscription_digest',
    ];
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });

  it('has a text for every explanation line used in the domain', () => {
    const keys = new Set<string>();
    for (const f of files('src/domain')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(explain\.[a-zA-Z.]+)'/g)) keys.add(m[1]!);
    }
    expect([...keys].filter((k) => !(k in en))).toEqual([]);
  });

  it('has a label for every event type and a text for every collection signal', () => {
    const types = readFileSync('src/domain/types.ts', 'utf8').match(/export type EventType =([^;]+);/)![1]!;
    const keys = [...types.matchAll(/'([a-z_]+)'/g)].map((m) => `eventType.${m[1]}`);
    for (const f of files('src/domain')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/'(collection\.signal\.[a-zA-Z]+)'/g)) keys.push(m[1]!);
    }
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });

  it('substitutes params and falls back to the key', () => {
    expect(t('events.score', { before: 1, after: 2 })).toBe('Score 1 → 2');
    expect(t('no.such.key')).toBe('no.such.key');
  });

  it('Russian has the same placeholders as English for every key', () => {
    const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const differ = Object.keys(en).filter((k) => params(en[k as keyof typeof en]) !== params(ru[k as keyof typeof en]));
    expect(differ).toEqual([]);
  });

  it('Russian translates every text (only symbols and route templates may stay the same)', () => {
    const same = Object.keys(en).filter((k) => en[k as keyof typeof en] === ru[k as keyof typeof en]);
    expect(same.sort()).toEqual(['listing.title', 'removal.undefined']);
    expect(Object.values(ru).filter((v) => v.trim() === '')).toEqual([]);
  });

  it('switches the language of t() and falls back to the key', () => {
    try {
      setLanguage('ru');
      expect(t('events.score', { before: 1, after: 2 })).toBe('Балл 1 → 2');
      expect(t('no.such.key')).toBe('no.such.key');
    } finally {
      setLanguage('en');
    }
    expect(t('events.score', { before: 1, after: 2 })).toBe('Score 1 → 2');
  });

  it('shows roles, registry statuses and yes/no in event params as labels of the current language', () => {
    const state = { companies: [] } as unknown as AppState;
    expect(readableParams(state, { from: 'carrier', to: 'forwarder', status: 'liquidated', reports: 'yes' })).toEqual({ from: 'carrier', to: 'forwarder', status: 'liquidated', reports: 'yes' });
    try {
      setLanguage('ru');
      expect(readableParams(state, { from: 'carrier', to: 'forwarder', status: 'liquidated', reports: 'yes' })).toEqual({ from: 'перевозчик', to: 'экспедитор', status: 'ликвидирована', reports: 'да' });
    } finally {
      setLanguage('en');
    }
  });

  it('formats numbers and dates for the current language; Russian dates have no trailing "г."', () => {
    const d = '2026-10-05T09:00:00.000Z';
    expect([formatNumber(13.6), formatNumber(0.5, 2), formatDate(d)]).toEqual(['13.6', '0.50', '5 Oct 2026']);
    try {
      setLanguage('ru');
      expect([formatNumber(13.6), formatNumber(0.5, 2), formatNumber(1068), formatDate(d)]).toEqual(['13,6', '0,50', '1068', '5 окт. 2026']);
      expect(formatDateTime(d)).toBe('5 окт. 2026, 09:00');
    } finally {
      setLanguage('en');
    }
  });
});
