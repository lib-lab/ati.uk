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

  it('short scales: at most 7 spacing steps and 5 font sizes', () => {
    const names = [...tokens.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]!);
    expect(names.filter((n) => /^--space-/.test(n)).length).toBeLessThanOrEqual(7);
    expect(names.filter((n) => /^--font-size-/.test(n)).length).toBeLessThanOrEqual(5);
  });

  it('colour pairs meet WCAG AA: text 4.5:1, control borders 3:1', () => {
    const color = (name: string) => tokens.match(new RegExp(`--${name}: (#[0-9a-f]{3,6});`, 'i'))![1]!;
    const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = (hex: string) => {
      const h = hex.slice(1).length === 3 ? [...hex.slice(1)].map((x) => x + x).join('') : hex.slice(1);
      const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16) / 255));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [luminance(color(a)), luminance(color(b))].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const text: [string, string][] = [
      ['text', 'bg'], ['muted', 'bg'], ['muted', 'bg-subtle'], ['muted', 'neutral-bg'], ['muted', 'accent-bg'],
      ['accent', 'bg'], ['accent', 'accent-bg'], ['on-accent', 'accent'], ['on-accent', 'red'],
      ['red', 'red-bg'], ['yellow', 'yellow-bg'], ['text', 'neutral-bg'],
    ];
    expect(text.filter(([fg, bg]) => ratio(fg, bg) < 4.5)).toEqual([]);
    expect(ratio('border-control', 'bg')).toBeGreaterThanOrEqual(3);
  });
});
