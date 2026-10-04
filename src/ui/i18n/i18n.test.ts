import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { t } from './index';

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
    for (const r of ['found_on_platform', 'found_elsewhere', 'not_relevant']) {
      keys.add(`event.listing.removed.${r}`);
      keys.add(`event.rating.removed.${r}`);
    }
    for (const k of [...keys]) if (k.endsWith('.')) keys.delete(k);
    const missing = [...keys].filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  it('substitutes params and falls back to the key', () => {
    expect(t('events.score', { before: 1, after: 2 })).toBe('Score 1 → 2');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
