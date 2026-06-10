// render-doc.mjs — Generalized CUBRID-tone PDF renderer for ANY single
// docs-site page (local-tree or otherwise). Generalizes render-roadmap.mjs:
// same Open-Questions/Review-Log strip, same tangram header / hgryoo footer,
// same mermaid + lazy-image gates — but the page URL, output path, and header
// text come from CLI flags instead of a hardcoded DOCS list.
//
// Prereq: an Astro dev (or preview) server is already serving the site
// (default http://127.0.0.1:9998 — the docs-site `astro dev` port).
//
// Usage:
//   node pdf-export/scripts/render-doc.mjs \
//     --url  /local/cubrid_cv/issue/i4_2026-05-20_lock_perform_object_refactor/design/ \
//     --out  /data/cubrid_cv/issue/I4_2026-05-20_lock_perform_object_refactor/DESIGN.pdf \
//     --header "CUBRID Lock Manager · lock_internal_perform_lock_object Refactor Design"
//
// Flags:
//   --url <path|fullurl>   page to render (path is joined onto --base)
//   --out <abs.pdf>        output file (created/overwritten)
//   --header <text>        header-left text (header-right = today's date)
//   --footer-left <text>   footer-left text (default: hgryoo)
//   --base <origin>        server origin (default: http://127.0.0.1:9998)
//   --no-strip             keep Open Questions / Review Log sections
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

const TANGRAM = `linear-gradient(to right,
  #E53935 0%,    #E53935 14%,
  #F57C00 14%,   #F57C00 28%,
  #C2185B 28%,   #C2185B 42%,
  #FFC107 42%,   #FFC107 56%,
  #1A237E 56%,   #1A237E 70%,
  #2196F3 70%,   #2196F3 84%,
  #4CAF50 84%,   #4CAF50 100%)`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function parseArgs(argv) {
  const out = { base: 'http://127.0.0.1:9998', url: '', outFile: '', header: '', footerLeft: 'hgryoo', strip: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--url':         out.url = v; i += 1; break;
      case '--out':         out.outFile = v; i += 1; break;
      case '--header':      out.header = v; i += 1; break;
      case '--footer-left': out.footerLeft = v; i += 1; break;
      case '--base':        out.base = v.replace(/\/$/, ''); i += 1; break;
      case '--no-strip':    out.strip = false; break;
      default: break;
    }
  }
  if (!out.url || !out.outFile) {
    console.error('render-doc.mjs: --url and --out are required');
    process.exit(2);
  }
  out.fullUrl = /^https?:\/\//.test(out.url) ? out.url : `${out.base}${out.url.startsWith('/') ? '' : '/'}${out.url}`;
  return out;
}

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

async function strip(page, doStrip) {
  const log = await page.evaluate((doStrip) => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return 'NO_ROOT';

    // 1) Drop the leading head-note blockquote, if any.
    const firstBq = root.querySelector(':scope > blockquote');
    if (firstBq) firstBq.remove();

    const isH2Wrapper = (el) =>
      el && el.classList && el.classList.contains('sl-heading-wrapper') && el.classList.contains('level-h2');
    const h2WrapperText = (w) => {
      const h = w.querySelector('h2');
      return h ? (h.textContent || '').trim() : '';
    };

    // 2) Drop Open Questions + Review Log SECTIONS (wrapper + following
    //    siblings up to, but not including, the next h2 wrapper).
    const removedSections = [];
    if (doStrip) {
      const drop = /\b(Open Questions|Review Log)\b/i;
      const wrappers = Array.from(root.querySelectorAll(':scope > div.sl-heading-wrapper.level-h2'));
      for (const w of wrappers) {
        const txt = h2WrapperText(w);
        if (!drop.test(txt)) continue;
        const toRemove = [w];
        let n = w.nextElementSibling;
        while (n && !isH2Wrapper(n)) { toRemove.push(n); n = n.nextElementSibling; }
        removedSections.push(`${txt.split(' ').slice(0, 4).join(' ')} (${toRemove.length} els)`);
        toRemove.forEach((el) => el.remove());
      }
    }

    // 3) Page-break before every numbered h2 wrapper (post-drop).
    const numbered = /^\d+\.\s/;
    const survivors = Array.from(root.querySelectorAll(':scope > div.sl-heading-wrapper.level-h2'));
    const breaks = [];
    for (const w of survivors) {
      const clean = h2WrapperText(w).replace(/^[#§\s]+/, '').trim();
      if (!numbered.test(clean)) continue;
      const br = document.createElement('div');
      br.className = '__pdf_pagebreak__';
      w.parentNode.insertBefore(br, w);
      breaks.push(clean.split('.')[0]);
    }

    return `drop=[${removedSections.join(' | ')}] break=[${breaks.join(',')}]`;
  }, doStrip);
  console.error(`  strip: ${log}`);
}

const args = parseArgs(process.argv.slice(2));
const TODAY = new Date().toISOString().slice(0, 10);

const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
  console.error(`→ ${args.fullUrl}`);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const r = await page.goto(args.fullUrl, { waitUntil: 'networkidle', timeout: 60000 });
  if (!r || !r.ok()) throw new Error(`nav failed ${args.fullUrl}: ${r ? r.status() : 'none'}`);
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
  await strip(page, args.strip);
  await page.addStyleTag({ content: PRINT_CSS });
  await page.addStyleTag({ content: EXTRA_CSS });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);
  fs.mkdirSync(path.dirname(args.outFile), { recursive: true });
  await page.pdf({
    path: args.outFile, format: 'A4',
    margin: { top: '22mm', right: '18mm', bottom: '22mm', left: '18mm' },
    displayHeaderFooter: true,
    headerTemplate: header(args.header, TODAY),
    footerTemplate: footer(args.footerLeft),
    printBackground: true,
    preferCSSPageSize: false,
  });
  console.error(`  ✓ ${args.outFile} (${Math.round(fs.statSync(args.outFile).size / 1024)} KB)`);
} finally {
  await browser.close();
}
