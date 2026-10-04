// Publishes the tester guide with the site: docs/OVERVIEW.md → dist/guide.html (https://<site>/guide).
// Only the guide is public; sections for the team and links to repository documents are left out.
import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

/** Sections of OVERVIEW.md that stay in the repository only. */
const TEAM_ONLY = ['Покрытие ТЗ', 'Что дальше, по важности', 'Где что лежит'];

const md = readFileSync('docs/OVERVIEW.md', 'utf8')
  .split(/^(?=## )/m)
  .filter((part) => !TEAM_ONLY.some((title) => part.startsWith(`## ${title}`)))
  .join('');
const body = marked
  .parse(md)
  // links to repository files are not public: keep the text only
  .replace(/<a href="(?!https?:)[^"]*">([^<]*)<\/a>/g, '$1')
  .replace(/<p>Что проверить:/g, '<p class="check"><strong>Что проверить:</strong>');

writeFileSync('dist/guide.html', `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Руководство тестировщика · Freight board</title>
<script>try { const t = localStorage.getItem('freight-board-prototype/theme'); if (t) document.documentElement.dataset.theme = t; } catch {}</script>
<style>
:root {
  color-scheme: light;
  --bg: #ffffff; --bg-subtle: #f6f7f9; --text: #1c1f24; --muted: #5d6470; --border: #e3e5e9;
  --accent: #2458d3;
  --check-bg: #fdf5df; --check-text: #5c3c00; --check-border: #efd89a;
  --font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
    --bg: #15171b; --bg-subtle: #1c1f24; --text: #e7e9ec; --muted: #a0a7b2; --border: #2c3037;
    --accent: #8fb0ff; --check-bg: #2c2410; --check-text: #f0d48d; --check-border: #5f4a19;
  }
}
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #15171b; --bg-subtle: #1c1f24; --text: #e7e9ec; --muted: #a0a7b2; --border: #2c3037;
  --accent: #8fb0ff; --check-bg: #2c2410; --check-text: #f0d48d; --check-border: #5f4a19;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 var(--font); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 24px; padding: 12px 24px; border-bottom: 1px solid var(--border); background: var(--bg-subtle); font-size: 14px; }
.bar nav { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.bar a { color: var(--muted); text-decoration: none; }
.bar a:hover, .bar a[aria-current='page'] { color: var(--text); }
.bar .brand { font-weight: 600; color: var(--text); }
.bar .app { margin-left: auto; color: var(--accent); }
main { max-width: 76ch; margin: 0 auto; padding: 40px 24px 64px; }
h1 { font-size: 30px; line-height: 1.25; margin: 0 0 16px; text-wrap: balance; }
h2 { font-size: 22px; line-height: 1.3; margin: 40px 0 12px; padding-top: 24px; border-top: 1px solid var(--border); }
h3 { font-size: 18px; margin: 28px 0 8px; }
p, ul, ol { margin: 0 0 12px; }
li + li { margin-top: 4px; }
a { color: var(--accent); text-underline-offset: 2px; }
a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
code { font: 0.9em var(--mono); background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 6px; padding: 1px 5px; }
pre { overflow-x: auto; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 10px; padding: 12px 16px; }
pre code { border: none; padding: 0; background: none; }
blockquote { margin: 0 0 16px; padding: 8px 16px; border-left: 3px solid var(--border); color: var(--muted); }
table { display: block; overflow-x: auto; border-collapse: collapse; margin: 0 0 16px; font-size: 15px; }
th, td { text-align: left; vertical-align: top; padding: 8px 12px; border: 1px solid var(--border); }
th { background: var(--bg-subtle); font-weight: 600; }
img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 8px; }
.check { background: var(--check-bg); color: var(--check-text); border: 1px solid var(--check-border); border-radius: 10px; padding: 12px 16px; }
@media (max-width: 640px) {
  .bar { padding: 12px 16px; }
  .bar .app { margin-left: 0; }
  main { padding: 24px 16px 48px; }
  h1 { font-size: 26px; }
}
</style>
</head>
<body>
<header class="bar"><span class="brand">Руководство тестировщика</span><a class="app" href="/">Открыть прототип →</a></header>
<main>${body}</main>
</body>
</html>
`);
console.log('guide: dist/guide.html');
