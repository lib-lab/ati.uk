// Publishes the project documents with the site: Markdown from the repository → dist/docs/*.html,
// so that https://<site>/docs/ has every document (see docs/OVERVIEW.md). Runs after `vite build`.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { marked } from 'marked';

const OUT = 'dist/docs';

/** Repository Markdown file → page on the site (relative to /docs/), with a title and a one-line description. */
const PAGES = [
  { src: 'docs/OVERVIEW.md', out: 'overview.html', title: 'Обзор прототипа', about: 'Что это, как открыть, пользовательские пути, что проверить по UX, что дальше. Начните с него.' },
  { src: 'README.md', out: 'readme.html', title: 'README', about: 'Запуск, тестовые инструменты, все сценарии с шагами, известные ограничения.' },
  { src: 'docs/TZ.md', out: 'tz.html', title: 'Техническое задание', about: 'Исходное ТЗ на MVP и открытые вопросы.' },
  { src: 'docs/PLAN.md', out: 'plan.html', title: 'План', about: 'Утверждённый план: сущности, экраны, этапы.' },
  { src: 'docs/ROADMAP.md', out: 'roadmap.html', title: 'Роадмап', about: 'Этапы E1–E13 с критериями готовности.' },
  { src: 'docs/DECISIONS.md', out: 'decisions.html', title: 'Решения и допущения', about: 'Все решения по темам и бэклог предложений вне ТЗ.' },
  { src: 'docs/screenshots/e13/README.md', out: 'screenshots/e13/index.html', title: 'Скриншоты', about: 'Ключевые экраны до и после визуальной полировки.' },
  { src: 'CLAUDE.md', out: 'claude.html', title: 'Правила разработки', about: 'Правила работы с кодом для разработчиков.' },
];
const bySrc = new Map(PAGES.map((p) => [p.src, p]));

/** Links between documents point to their pages on the site; other links stay as they are. */
function rewriteLinks(html, page) {
  return html.replace(/href="([^"]+)"/g, (all, href) => {
    if (/^(https?:|mailto:|#)/.test(href)) return all;
    const [path, hash = ''] = href.split('#');
    let target = posix.normalize(posix.join(posix.dirname(page.src), path)).replace(/\/$/, '');
    if (!target.endsWith('.md') && bySrc.has(`${target}/README.md`)) target = `${target}/README.md`;
    const linked = bySrc.get(target);
    if (!linked) return all;
    const folder = linked.out.endsWith('index.html');
    const rel = (posix.relative(posix.dirname(page.out), linked.out.replace(/index\.html$/, '')) || '.') + (folder ? '/' : '');
    return `href="${rel}${hash ? '#' + hash : ''}"`;
  });
}

function layout(page, body) {
  const root = posix.relative(posix.dirname(page.out), '.') || '.';
  const nav = PAGES.filter((p) => p.out !== 'claude.html')
    .map((p) => `<a href="${posix.join(root, p.out.replace(/index\.html$/, ''))}"${p === page ? ' aria-current="page"' : ''}>${p.title}</a>`)
    .join('');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title} · Freight board</title>
<link rel="stylesheet" href="${root}/docs.css">
<script>try { const t = localStorage.getItem('freight-board-prototype/theme'); if (t) document.documentElement.dataset.theme = t; } catch {}</script>
</head>
<body>
<header class="bar"><a class="brand" href="${root}/">Документы прототипа</a><nav>${nav}</nav><a class="app" href="${root}/../">Открыть прототип →</a></header>
<main>${body}</main>
</body>
</html>
`;
}

/** "Что проверить:" paragraphs of the overview become highlighted notes. */
const notes = (html) => html.replace(/<p>Что проверить:/g, '<p class="check"><strong>Что проверить:</strong>');

mkdirSync(OUT, { recursive: true });
for (const page of PAGES) {
  const html = notes(rewriteLinks(marked.parse(readFileSync(page.src, 'utf8')), page));
  const file = join(OUT, page.out);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, layout(page, html));
}
cpSync('docs/screenshots', join(OUT, 'screenshots'), { recursive: true, filter: (f) => !f.endsWith('.md') });
cpSync('scripts/docs.css', join(OUT, 'docs.css'));

const index = { src: 'docs/index', out: 'index.html', title: 'Документы' };
writeFileSync(join(OUT, 'index.html'), layout(index, `<h1>Документы прототипа</h1>
<p>Кликабельный прототип биржи грузоперевозок. Прототип: <a href="../">открыть</a>.</p>
<ul class="docs">${PAGES.map((p) => `<li><a href="${p.out.replace(/index\.html$/, '')}">${p.title}</a><span>${p.about}</span></li>`).join('')}</ul>`));
console.log(`docs: ${PAGES.length} pages → ${OUT}${existsSync(join(OUT, 'screenshots')) ? ' (+ screenshots)' : ''}`);
