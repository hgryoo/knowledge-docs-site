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
  /* Force all table columns visible — prevent Starlight responsive hiding */
  table { width: 100% !important; table-layout: fixed !important; font-size: 7pt !important; }
  table th, table td { display: table-cell !important; visibility: visible !important;
    overflow-wrap: break-word; word-break: break-word; padding: 3px 4px !important;
    line-height: 1.3 !important; }
  /* Prevent Starlight from collapsing columns on narrow viewports */
  .sl-markdown-content table { overflow: visible !important; max-width: none !important; }
  .sl-markdown-content table th:nth-child(n),
  .sl-markdown-content table td:nth-child(n) { display: table-cell !important; }
  /* Wide comparison tables: first column narrower */
  table th:first-child, table td:first-child { width: 14% !important; }
}
`;

const BASE = 'http://127.0.0.1:9998';
const URL_PREFIX = '/local/cub_sys/roadmap/projects/10-selected/n27-lock-manager-improvement';
const OUT_DIR = '/data/cub_sys/roadmap/projects/10-selected/N27-lock-manager-improvement';

const SURVEYS = [
  { slug: '01-00-survey_overview',           title: 'Survey Overview — Cross-Cutting Analysis',    isOverview: true },
  { slug: '01-01-survey_postgresql',         title: 'PostgreSQL — Version-by-Version Evolution',   isOverview: false },
  { slug: '01-02-survey_oracle',             title: 'Oracle — Version-by-Version Evolution',       isOverview: false },
  { slug: '01-03-survey_mysql-innodb',       title: 'MySQL InnoDB — Version-by-Version Evolution', isOverview: false },
  { slug: '01-04-survey_sqlserver',          title: 'SQL Server — Version-by-Version Evolution',   isOverview: false },
  { slug: '01-05-survey_cubrid-gap',         title: 'CUBRID — Gap Analysis',                       isOverview: false },
];

const TODAY = new Date().toISOString().slice(0, 10);
const HEADER_TITLE = 'Lock Manager Improvement — Survey Series';
const TANGRAM = `linear-gradient(to right,
  #E53935 0%,    #E53935 14%,
  #F57C00 14%,   #F57C00 28%,
  #C2185B 28%,   #C2185B 42%,
  #FFC107 42%,   #FFC107 56%,
  #1A237E 56%,   #1A237E 70%,
  #2196F3 70%,   #2196F3 84%,
  #4CAF50 84%,   #4CAF50 100%)`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function headerTpl(left, right) {
  return `
<div style="font-family: Pretendard, 'Noto Sans KR', sans-serif; width: 100%; box-sizing: border-box; padding: 0 18mm; font-size: 8pt; color: #1A237E;">
  <div style="height: 4px; background: ${TANGRAM};"></div>
  <div style="display: flex; justify-content: space-between; padding-top: 4px;">
    <span>${esc(left)}</span>
    <span>${esc(right)}</span>
  </div>
</div>`;
}

function footerTpl(left) {
  const logoImg = LOGO ? `<img src="${LOGO}" style="height: 14px; vertical-align: middle; margin-right: 6px;">` : '';
  return `
<div style="font-family: Pretendard, 'Noto Sans KR', sans-serif; width: 100%; box-sizing: border-box; padding: 0 18mm; font-size: 7.5pt; color: #6B6B6B;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <span style="display: inline-flex; align-items: center;">${logoImg}${esc(left)}</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>
</div>`;
}

const pdfOpts = (outPath) => ({
  path: outPath, format: 'A4',
  margin: { top: '22mm', right: '18mm', bottom: '22mm', left: '18mm' },
  displayHeaderFooter: true,
  headerTemplate: headerTpl(HEADER_TITLE, TODAY),
  footerTemplate: footerTpl('hgryoo'),
  printBackground: true,
  preferCSSPageSize: false,
});

// ── DOM transforms ──────────────────────────────────────────

async function strip(page, opts = {}) {
  const skipBreakBefore = opts.skipBreakBefore || []; // section numbers to NOT break before
  const log = await page.evaluate((skipSet) => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return 'NO_ROOT';

    const firstBq = root.querySelector(':scope > blockquote');
    if (firstBq) firstBq.remove();

    // Remove the Starlight-generated h1 page title (may be inside or outside .sl-markdown-content)
    const h1Wrapper = root.querySelector(':scope > div.sl-heading-wrapper.level-h1');
    if (h1Wrapper) h1Wrapper.remove();
    const bareH1 = root.querySelector(':scope > h1');
    if (bareH1) bareH1.remove();
    // Starlight often renders the title outside markdown-content in .content-panel or header
    document.querySelectorAll('h1, .sl-heading-wrapper.level-h1, [data-page-title], header.hero').forEach(el => el.remove());
    // Also remove the Starlight content-panel heading area if present
    const contentTitle = document.querySelector('.content-panel h1, main h1, .main-pane h1');
    if (contentTitle) contentTitle.closest('.sl-heading-wrapper, div')?.remove() || contentTitle.remove();

    const isH2Wrapper = (el) =>
      el && el.classList && el.classList.contains('sl-heading-wrapper') && el.classList.contains('level-h2');
    const h2WrapperText = (w) => {
      const h = w.querySelector('h2');
      return h ? (h.textContent || '').trim() : '';
    };

    const drop = /\b(Open Questions|Review Log|References)\b/i;
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

    const numbered = /^\d+\.\s/;
    const survivors = Array.from(root.querySelectorAll(':scope > div.sl-heading-wrapper.level-h2'));
    const breaks = [];
    const skipped = [];
    let isFirst = true;
    for (const w of survivors) {
      const txt = h2WrapperText(w);
      const clean = txt.replace(/^[#§\s]+/, '').trim();
      if (!numbered.test(clean)) continue;
      const secNum = clean.split('.')[0];
      // Never break before the very first section (h1 title is removed)
      if (isFirst) {
        skipped.push(secNum + '(first)');
        isFirst = false;
        continue;
      }
      if (skipSet.includes(secNum)) {
        skipped.push(secNum);
        continue;
      }
      const br = document.createElement('div');
      br.className = '__pdf_pagebreak__';
      w.parentNode.insertBefore(br, w);
      breaks.push(secNum);
    }

    return `drop=[${removedSections.join(' | ')}] break=[${breaks.join(',')}]${skipped.length ? ` skip=[${skipped.join(',')}]` : ''}`;
  }, skipBreakBefore);
  console.error(`  strip: ${log}`);
}

async function stripPurposeScope(page) {
  const log = await page.evaluate(() => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return 'NO_ROOT';

    const isH2Wrapper = (el) =>
      el && el.classList && el.classList.contains('sl-heading-wrapper') && el.classList.contains('level-h2');
    const h2WrapperText = (w) => {
      const h = w.querySelector('h2');
      return h ? (h.textContent || '').trim() : '';
    };

    const wrappers = Array.from(root.querySelectorAll(':scope > div.sl-heading-wrapper.level-h2'));
    for (const w of wrappers) {
      const txt = h2WrapperText(w);
      if (!/purpose\s*[&+]\s*scope/i.test(txt)) continue;
      const toRemove = [w];
      let n = w.nextElementSibling;
      while (n && !isH2Wrapper(n)) { toRemove.push(n); n = n.nextElementSibling; }
      toRemove.forEach((el) => el.remove());
      // also remove the preceding page-break if one was inserted by strip()
      const prev = w.previousElementSibling;
      if (prev && prev.classList && prev.classList.contains('__pdf_pagebreak__')) prev.remove();
      return `removed Purpose & Scope (${toRemove.length} els)`;
    }
    return 'no Purpose & Scope found';
  });
  console.error(`  purposeScope: ${log}`);
}

async function cleanOverviewFileTable(page) {
  const log = await page.evaluate(() => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return 'NO_ROOT';

    const tables = root.querySelectorAll('table');
    let cleaned = 0;
    for (const table of tables) {
      let thisTableCleaned = 0;
      const rows = table.querySelectorAll('tbody tr');
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 1) continue;
        const firstCell = cells[0];
        const code = firstCell.querySelector('code');
        if (code && /01-\d\d-survey/.test(code.textContent)) {
          if (cells.length >= 2) {
            const dbms = cells[1].textContent.trim();
            if (dbms && dbms !== '(this)') {
              firstCell.textContent = dbms;
            } else {
              firstCell.textContent = 'Overview';
            }
            cells[1].remove();
          }
          thisTableCleaned++;
          cleaned++;
        }
      }
      if (thisTableCleaned > 0) {
        const headerCells = table.querySelectorAll('thead th');
        if (headerCells.length >= 2) {
          headerCells[0].textContent = 'Section';
          headerCells[1].remove();
        }
      }
    }

    // Remove paragraphs below the file table that reference _ko.md, 01-NN-survey_*.md, etc.
    const paras = root.querySelectorAll('p');
    for (const p of paras) {
      const txt = p.textContent || '';
      if (/_ko\.md/i.test(txt) || /01-NN-survey/i.test(txt) || /ko_phase/i.test(txt) ||
          /Recommended reading order/i.test(txt)) {
        p.remove();
        cleaned++;
      }
    }

    return `cleaned ${cleaned} elements`;
  });
  console.error(`  fileTable: ${log}`);
}

async function deref(page) {
  const count = await page.evaluate(() => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return 0;

    const MAP = [
      // Within-series survey files
      [/`?\.?\/?(01-00-survey_overview(?:_ko)?\.md)`?/g, 'Survey Overview'],
      [/`?\.?\/?(01-01-survey_postgresql(?:_ko)?\.md)`?/g, 'PostgreSQL Survey'],
      [/`?\.?\/?(01-02-survey_oracle(?:_ko)?\.md)`?/g, 'Oracle Survey'],
      [/`?\.?\/?(01-03-survey_mysql-innodb(?:_ko)?\.md)`?/g, 'MySQL InnoDB Survey'],
      [/`?\.?\/?(01-04-survey_sqlserver(?:_ko)?\.md)`?/g, 'SQL Server Survey'],
      [/`?\.?\/?(01-05-survey_cubrid-gap(?:_ko)?\.md)`?/g, 'CUBRID Gap Analysis'],
      [/`?\.?\/?(01-06-survey_cubrid-measurement(?:_ko)?\.md)`?/g, 'CUBRID Measurement Plan'],
      // Foundation and sibling files — strip "N27" prefix
      [/`?\.?\/?00-foundation(?:_ko)?\.md`?/g, 'Background'],
      [/\bfoundation document\b/g, 'Background'],
      [/\bfoundation\b(?!\s*layer)/gi, (m) => m[0] === 'F' ? 'Background' : 'background'],
      [/`?\.\.\/\.\.\/00-pending-review\/N18-wait-event-stats\/00-foundation\.md`?/g, 'wait-event-stats project (N18)'],
      [/`?\.\.\/N18-wait-event-stats\/00-foundation\.md`?/g, 'wait-event-stats project (N18)'],
      [/`?\.\.\/\.\.\/80-external\/intra-query-parallelism\/00-foundation\.md`?/g, 'intra-query parallelism project'],
      [/`?\.\.\/\.\.\/\.\.\/cross-cutting\.md`?/g, 'cross-cutting registry'],
      // KB paths
      [/`?\$KB_ROOT\/knowledge\/code-analysis\/cubrid\/cubrid-lock-manager\.md`?/g, 'CUBRID lock-manager code analysis'],
      [/`?\$KB_ROOT\/knowledge\/code-analysis\/cubrid\/cubrid-mvcc\.md`?/g, 'CUBRID MVCC code analysis'],
      [/`?\$KB_ROOT\/knowledge\/code-analysis\/cubrid\/cubrid-lockfree-overview\.md`?/g, 'CUBRID lock-free infrastructure overview'],
      [/`?\$KB_ROOT\/knowledge\/research\/dbms-general\/database-internals\.md`?/g, 'Petrov, Database Internals'],
      [/`?\$KB_ROOT\/knowledge\/research\/dbms-general\/database-system-concepts\.md`?/g, 'Silberschatz et al., Database System Concepts'],
      [/`?\$KB_ROOT\/knowledge\/methodology\/[a-z\-]+\.md`?/g, ''],
      // Tooling paths
      [/`?\/data\/cub_sys\/benchbase\/?`?/g, 'BenchBase'],
      [/`?\/data\/cub_sys\/HammerDB\/?`?/g, 'HammerDB'],
      [/`?\/data\/cub_sys\/cubrid-engine-suite\/benchmarks\/?`?/g, 'cubrid-engine-suite benchmarks'],
      [/`?cubrid-engine-suite\/README\.md`?/g, 'cubrid-engine-suite README'],
      // Strip "N27" project code
      [/\bN27\b/g, ''],
      [/\(N18\)/g, '(N18)'], // keep N18 — it's a dependency, not this project
      // Generic leftover .md refs
      [/`?\.\.\/[A-Za-z0-9_\-\/]+\.md`?/g, (m) => {
        const name = m.replace(/[`./]/g, '').replace(/\.md$/, '').split('/').pop();
        return name;
      }],
    ];

    let n = 0;
    const walk = (node) => {
      if (node.nodeType === 3) {
        let txt = node.textContent;
        let changed = false;
        for (const [re, rep] of MAP) {
          const before = txt;
          txt = txt.replace(re, typeof rep === 'function' ? rep : rep);
          if (txt !== before) changed = true;
        }
        // Clean up double spaces from removals
        txt = txt.replace(/  +/g, ' ').replace(/\( \)/g, '').replace(/— +—/g, '—');
        if (txt !== node.textContent) { node.textContent = txt; n++; changed = true; }
      } else if (node.nodeType === 1) {
        if (node.tagName === 'CODE' && !node.closest('pre')) {
          let txt = node.textContent;
          let changed = false;
          for (const [re, rep] of MAP) {
            const before = txt;
            txt = txt.replace(re, typeof rep === 'function' ? rep : rep);
            if (txt !== before) changed = true;
          }
          txt = txt.replace(/  +/g, ' ');
          if (changed) { node.textContent = txt; n++; }
        }
        for (const c of node.childNodes) walk(c);
      }
    };
    walk(root);

    root.querySelectorAll('a[href]').forEach((a) => {
      const h = a.getAttribute('href');
      if (h && (h.endsWith('.md') || h.includes('.md#') || h.startsWith('./'))) {
        const span = document.createElement('span');
        span.innerHTML = a.innerHTML;
        a.replaceWith(span);
        n++;
      }
    });

    return n;
  });
  console.error(`  deref: ${count} replacements`);
}

async function collectHeadings(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.sl-markdown-content');
    if (!root) return [];
    const headings = [];
    root.querySelectorAll('h1, h2').forEach((h) => {
      const level = h.tagName === 'H1' ? 1 : 2;
      const text = (h.textContent || '').trim();
      if (text) headings.push({ level, text });
    });
    return headings;
  });
}

// ── Background page ─────────────────────────────────────────

async function renderBackgroundPage(browser) {
  const bgHtml = `<!DOCTYPE html>
<html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
  body { font-family: 'Noto Sans KR', Pretendard, sans-serif; margin: 0; padding: 30px 50px; color: #222; }
  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 16px 0; color: #1A237E;
       border-bottom: 3px solid #E53935; padding-bottom: 6px; }
  p { font-size: 9.5pt; line-height: 1.55; margin: 0 0 8px 0; }
  .lead { font-size: 10pt; color: #333; margin-bottom: 12px; }
  ul { font-size: 9.5pt; line-height: 1.55; margin: 4px 0 10px 18px; padding: 0; }
  li { margin-bottom: 3px; }
  .section-head { font-size: 10.5pt; font-weight: 700; color: #F57C00; margin: 14px 0 6px 0;
                   border-left: 3px solid #F57C00; padding-left: 8px; }
  strong { color: #1A237E; }
  .cost-num { display: inline-block; width: 16px; font-weight: 700; color: #E53935; }
</style>
</head><body>
<h1>Background</h1>

<p class="lead">The CUBRID lock manager is a faithful implementation of the textbook two-phase locking (2PL) model:</p>
<ul>
  <li>Multi-granularity locks (S, X, IS, IX, SIX, BU, SCH-S, SCH-M, NON_2PL)</li>
  <li>Lock conversion via least-upper-bound compatibility square table</li>
  <li>Deadlock detection — waits-for graph with timeout fallback</li>
  <li>Lock vs. latch separation (page latches managed separately by PGBUF)</li>
</ul>

<p>The model is solid on correctness, but modern concurrent workloads expose the following costs:</p>

<div class="section-head">Cost Drivers</div>
<ul>
  <li><span class="cost-num">1.</span> <strong>Hot-key contention</strong> — high-frequency S+X lock conflicts on the same row serialize at the lock table bucket mutex, causing throughput plateau.</li>
  <li><span class="cost-num">2.</span> <strong>Lock table bucket latch</strong> — bucket-level mutexes cause cache-line ping-pong on NUMA and many-core systems.</li>
  <li><span class="cost-num">3.</span> <strong>Waits-for graph cycle detection cost</strong> — detection latency grows with transaction count; reliance on the timeout fallback increases.</li>
  <li><span class="cost-num">4.</span> <strong>Lock path overhead for short read-only transactions</strong> — reads that could be satisfied by an MVCC snapshot alone still pass through the lock manager.</li>
</ul>

<div class="section-head">Directions Major Engines Have Taken</div>
<ul>
  <li><strong>Sharded / lock-free hash</strong> — PG fastpath relation lock, MySQL InnoDB sharded lock_sys (8.0.21)</li>
  <li><strong>Optimistic concurrency for short transactions</strong> — Hekaton-style (no central lock manager)</li>
  <li><strong>Predicate locks for SI / SSI</strong> — PG Serializable Snapshot Isolation</li>
  <li><strong>Adaptive deadlock detection</strong> — timeout-first, graph detection as fallback</li>
</ul>

<p>This survey series traces how four major DBMSes (PostgreSQL, Oracle, MySQL InnoDB, SQL Server) evolved their lock managers over the past three decades, identifies what CUBRID lacks relative to these comparison points, and lays out a concrete measurement plan to decide which improvement axis to pursue.</p>

</body></html>`;

  const tmpBg = path.join(OUT_DIR, '__tmp_background.pdf');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(bgHtml, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  await page.pdf(pdfOpts(tmpBg));
  await ctx.close();
  const kb = Math.round(fs.statSync(tmpBg).size / 1024);
  console.error(`→ Background page: ${tmpBg} (${kb} KB)`);
  return tmpBg;
}

// ── TOC page ────────────────────────────────────────────────

async function renderTocPage(browser, tocData) {
  const tocHtml = `<!DOCTYPE html>
<html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
  body { font-family: 'Noto Sans KR', Pretendard, sans-serif; margin: 0; padding: 30px 50px; color: #1A237E;
         display: flex; flex-direction: column; }
  .title-block { margin-bottom: 18px; }
  h1 { font-size: 22pt; font-weight: 700; margin: 0 0 4px 0; color: #1A237E;
       border-bottom: 3px solid #E53935; padding-bottom: 6px; }
  .subtitle { font-size: 9pt; color: #6B6B6B; }
  .toc-body { flex: 1; columns: 2; column-gap: 28px; }
  .toc-part { font-size: 9pt; font-weight: 700; color: #F57C00; margin: 10px 0 3px 0;
              border-left: 3px solid #F57C00; padding-left: 8px;
              break-inside: avoid; }
  .toc-part:first-child { margin-top: 0; }
  .toc-section { font-size: 7.5pt; color: #333; margin: 1px 0 1px 16px; line-height: 1.4; }
</style>
</head><body>
<div class="title-block">
  <h1>Lock Manager Improvement<br>Survey Series</h1>
  <div class="subtitle">${TODAY} · CUBRID Systems Research</div>
</div>
<div class="toc-body">
${tocData.map((part) => `
  <div class="toc-part">${esc(part.title)}</div>
  ${part.headings.filter(h => h.level === 2).map(h =>
    `<div class="toc-section">${esc(h.text)}</div>`
  ).join('\n')}
`).join('\n')}
</div>
</body></html>`;

  const tmpToc = path.join(OUT_DIR, '__tmp_toc.pdf');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setContent(tocHtml, { waitUntil: 'networkidle' });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  await page.pdf({
    ...pdfOpts(tmpToc),
  });
  await ctx.close();
  const kb = Math.round(fs.statSync(tmpToc).size / 1024);
  console.error(`→ TOC page: ${tmpToc} (${kb} KB)`);
  return tmpToc;
}

// ── per-survey render ───────────────────────────────────────

async function renderOne(browser, survey) {
  const url = `${BASE}${URL_PREFIX}/${survey.slug}/`;
  const tmpOut = path.join(OUT_DIR, `__tmp_${survey.slug}.pdf`);
  console.error(`→ ${survey.slug}`);
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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

  if (survey.isOverview) {
    await strip(page, { skipBreakBefore: ['2'] });
    await cleanOverviewFileTable(page);
  } else {
    await strip(page);
    await stripPurposeScope(page);
  }

  await deref(page);

  // Collect headings for TOC before applying print styles
  const headings = await collectHeadings(page);

  // Force all table columns visible at DOM level (Starlight hides columns via responsive CSS)
  await page.evaluate(() => {
    document.querySelectorAll('table').forEach(table => {
      // Remove any Starlight overflow wrapper
      const wrapper = table.closest('.sl-table, [class*="table"]');
      if (wrapper && wrapper !== table) {
        wrapper.style.overflow = 'visible';
        wrapper.style.maxWidth = 'none';
      }
      // Force all cells visible with inline styles
      table.querySelectorAll('th, td').forEach(cell => {
        cell.style.display = 'table-cell';
        cell.style.visibility = 'visible';
      });
    });
  });

  await page.addStyleTag({ content: PRINT_CSS });
  await page.addStyleTag({ content: EXTRA_CSS });
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(300);

  await page.pdf(pdfOpts(tmpOut));

  const kb = Math.round(fs.statSync(tmpOut).size / 1024);
  console.error(`  ✓ ${tmpOut} (${kb} KB)`);
  await ctx.close();
  return { file: tmpOut, headings, title: survey.title };
}

// ── main ────────────────────────────────────────────────────

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const results = [];
try {
  for (const s of SURVEYS) {
    const result = await renderOne(browser, s);
    results.push(result);
  }

  // Generate Background + TOC pages
  const bgFile = await renderBackgroundPage(browser);
  const tocData = results.map(r => ({ title: r.title, headings: r.headings }));
  const tocFile = await renderTocPage(browser, tocData);
  results.unshift({ file: tocFile });
  results.unshift({ file: bgFile });
} finally {
  await browser.close();
}

const combined = path.join(OUT_DIR, 'N27-survey-series.cubrid.pdf');
const { execSync } = await import('node:child_process');
const allFiles = results.map(r => `"${r.file}"`).join(' ');
execSync(`pdfunite ${allFiles} "${combined}"`);
const totalKb = Math.round(fs.statSync(combined).size / 1024);
console.error(`\n✓ Combined: ${combined} (${totalKb} KB)`);

for (const r of results) fs.unlinkSync(r.file);
console.error('  tmp files cleaned up');
