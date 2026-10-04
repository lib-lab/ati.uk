// Builds a single self-contained HTML file (CSS and JS inlined) for sharing a preview,
// e.g. as a claude.ai artifact. Output: dist/preview.html. Run after `vite build`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\/?([^"]+)"[^>]*>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));
const js = [...html.matchAll(/<script type="module"[^>]*src="\/?([^"]+)"[^>]*><\/script>/g)].map((m) => readFileSync(join(dist, m[1]), 'utf8'));

// Escape closing tags inside inlined code.
const safe = (code) => code.replace(/<\/(script|style)/gi, '<\\/$1');

const out = `<title>Freight board prototype</title>
<style>${css.map(safe).join('\n')}</style>
<div id="root"></div>
<script type="module">${js.map(safe).join('\n')}</script>
`;
writeFileSync(join(dist, 'preview.html'), out);
console.log(`dist/preview.html: ${(out.length / 1024).toFixed(0)} KB`);
