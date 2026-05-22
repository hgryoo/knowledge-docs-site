// Fix: Starlight wraps each heading in <div class="sl-heading-wrapper level-h2">.
// Walk siblings of the *wrapper*, not the h2 inside it. Same for page-break
// insertion.
import { chromium } from '/data/hgryoo/knowledge-docs-site/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SITE = '/data/hgryoo/knowledge-docs-site';
const PRINT_CSS = fs.readFileSync(`${SITE}/pdf-export/styles/print-cubrid.css`, 'utf-8');
const LOGO = (() => {
  const f = `${SITE}/pdf-export/assets/cubrid-logo-small.png`;
  return fs.existsSync(f) ? `data:image/png;base64,${fs.readFileSync(f).toString('base64')}` : '';
})();
const EXTRA_CSS = `
@media print {
  .__pdf_pagebreak__ {
    display: block;
    height: 0;
    page-break-before: always;
    break-before: page;
  }
}
`;

const BASE = 'http://127.0.0.1:9998';
const URL_PREFIX = '/local/cub_sys/roadmap/projects/10-selected/n27-lock-manager-improvement';
const OUT_DIR = '/data/cub_sys/roadmap/projects/10-selected/N27-lock-manager-improvement';

const DOCS = [
  { slug: '04-bottleneck-scenarios', header: 'CUBRID Lock Manager · Bottleneck Scenarios' },
  { slug: '05-execution-cubrid',     header: 'CUBRID Lock Manager · Execution Guide (CUBRID)' },
  { slug: '06-execution-postgresql', header: 'CUBRID Lock Manager · Execution Guide (PostgreSQL)' },
];
const TODAY = new Date().toISOString().slice(0, 10);
const TANGRAM = `linear-gradient(to right,
  #E53935 0%,    #E53935 14%,
  #F57C00 14%,   #F57C00 28%,
  #C2185B 28%,   #C2185B 42%,
  #FFC107 42%,   #FFC107 56%,
  #1A237E 56%,   #1A237E 70%,
  #2196F3 70%,   #2196F3 84%,
  #4CAF50 84%,   #4CAF50 100%)`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function header(left, right) {
  return `
<div style="font-family: Pretendard, 'Noto Sans KR', sans-serif; width: 100%; box-sizing: border-box; padding: 0 18mm; font-size: 8pt; color: #1A237E;">
  <div style="height: 4px; background: ${TANGRAM};"></div>
  <div style="display: flex; justify-content: space-between; padding-top: 4px;">
    <span>${esc(left)}</span>
    <span>${esc(right)}</span>
  </div>
</div>`;
}

function footer(left) {
  const logoImg = LOGO ? `<img src="${LOGO}" style="height: 14px; vertical-align: middle; margin-right: 6px;">` : '';
  return `
<div style="font-family: Pretendard, 'Noto Sans KR', sans-serif; width: 100%; box-sizing: border-box; padding: 0 18mm; font-size: 7.5pt; color: #6B6B6B;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <span style="display: inline-flex; align-items: center;">${logoImg}${esc(left)}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`;
}

async function strip(page) {
  const log = await page.evaluate(() => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return 'NO_ROOT';

    // 1) Drop the head-note blockquote (the leading `> Self-contained...` block).
    const firstBq = root.querySelector(':scope > blockquote');
    if (firstBq) firstBq.remove();

    const isH2Wrapper = (el) =>
      el && el.classList && el.classList.contains('sl-heading-wrapper') && el.classList.contains('level-h2');
    const h2WrapperText = (w) => {
      const h = w.querySelector('h2');
      return h ? (h.textContent || '').trim() : '';
    };

    // 2) Drop Open Questions + Review Log SECTIONS — remove the wrapper plus
    //    every following sibling up to (but not including) the next h2 wrapper.
    const drop = /\b(Open Questions|Review Log)\b/i;
    const wrappers = Array.from(root.querySelectorAll(':scope > div.sl-heading-wrapper.level-h2'));
    const removedSections = [];
    for (const w of wrappers) {
      const txt = h2WrapperText(w);
      if (!drop.test(txt)) continue;
      const toRemove = [w];
      let n = w.nextElementSibling;
      while (n && !isH2Wrapper(n)) { toRemove.push(n); n = n.nextElementSibling; }
      removedSections.push(`${txt.split(' ').slice(0,4).join(' ')} (${toRemove.length} els)`);
      toRemove.forEach((el) => el.remove());
    }

    // 3) Insert a page-break anchor before every numbered h2 wrapper (post-drop).
    const numbered = /^\d+\.\s/;
    const survivors = Array.from(root.querySelectorAll(':scope > div.sl-heading-wrapper.level-h2'));
    const breaks = [];
    for (const w of survivors) {
      const txt = h2WrapperText(w);
      const clean = txt.replace(/^[#§\s]+/, '').trim();
      if (!numbered.test(clean)) continue;
      const br = document.createElement('div');
      br.className = '__pdf_pagebreak__';
      w.parentNode.insertBefore(br, w);
      breaks.push(clean.split('.')[0]);
    }

    return `drop=[${removedSections.join(' | ')}] break=[${breaks.join(',')}]`;
  });
  console.error(`  strip: ${log}`);
}

async function renderOne(browser, doc) {
  const url = `${BASE}${URL_PREFIX}/${doc.slug}/`;
  const out = path.join(OUT_DIR, `${doc.slug}.cubrid.pdf`);
  console.error(`→ ${doc.slug}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const r = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  if (!r || !r.ok()) throw new Error(`nav failed ${url}: ${r ? r.status() : 'none'}`);
  await page.waitForFunction(() => {
    const bs = document.querySelectorAll('pre.mermaid');
    if (bs.length === 0) return true;
    return Array.from(bs).every((b) => b.querySelector('svg'));
  }, { timeout: 45000 }).catch(() => {});
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.removeAttribute('loading'); img.removeAttribute('fetchpriority');
    });
    const max = document.body.scrollHeight;
    for (let y = 0; y < max; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0), { timeout: 30000 }).catch(() => {});
  await strip(page);
  await page.addStyleTag({ content: PRINT_CSS });
  await page.addStyleTag({ content: EXTRA_CSS });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  await page.pdf({
    path: out, format: 'A4',
    margin: { top: '22mm', right: '18mm', bottom: '22mm', left: '18mm' },
    displayHeaderFooter: true,
    headerTemplate: header(doc.header, TODAY),
    footerTemplate: footer('hgryoo'),
    printBackground: true,
    preferCSSPageSize: false,
  });
  console.error(`  ✓ ${out} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
  await ctx.close();
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try { for (const d of DOCS) await renderOne(browser, d); } finally { await browser.close(); }
