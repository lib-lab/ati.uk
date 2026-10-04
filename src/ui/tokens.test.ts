// Guards the CLAUDE.md rule: sizes in styles and components only through tokens.css.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync('src/ui/tokens.css', 'utf8');
const styles = readFileSync('src/ui/styles.css', 'utf8');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

/** Numbers left in a CSS rule after removing what the rule allows. */
function rawNumbers(line: string): string[] {
  const rest = line
    .replace(/var\(--[a-z0-9-]+\)/g, '')
    .replace(/minmax\(0,/g, '')
    .replace(/\b(100%|1fr)/g, '')
    .replace(/grid-column: 1 \/ -1/g, '')
    .replace(/flex: 1 1/g, '')
    .replace(/calc\([^;]*\)/g, (calc) => calc.replace(/(?<![\w-])-?\d+(\.\d+)?\s*\*|\b1lh\b/g, ''));
  return (rest.match(/(?<![\w-])-?\d*\.?\d+[a-z%]*/g) ?? []).filter((n) => n !== '0');
}

describe('design tokens', () => {
  it('styles.css has no raw sizes, colours or weights outside media queries', () => {
    const lines = styles.replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
    const offending = lines.filter((l) => !l.trim().startsWith('@media') && (rawNumbers(l).length > 0 || /#[0-9a-f]{3,6}\b/i.test(l)));
    expect(offending).toEqual([]);
  });

  it('every token used in styles.css is defined in tokens.css', () => {
    const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
    const used = new Set([...styles.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]!));
    expect([...used].filter((v) => !defined.has(v))).toEqual([]);
  });

  it('components set no sizes: no inline styles, no rows/size/width/height attributes', () => {
    const offending = files('src/ui').flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => /style=\{\{|\b(rows|cols|size|width|height)=\{?["']?\d/.test(l))
        .map((l) => `${f}: ${l.trim()}`),
    );
    expect(offending).toEqual([]);
  });
});
