// build-pdf.mjs — Playwright driver for both PDF tracks.
//
// Usage (typically via ../build-pdf.sh, which spawns this):
//
//   node scripts/build-pdf.mjs \
//     --slug cubrid-lock-manager \
//     --track slide \
//     --lang en \
//     --header-left  "CUBRID Code Analysis" \
//     --header-right "2026-05-21" \
//     --footer-left  "hgryoo · Docs" \
//     --footer-right "cubrid-lock-manager"
//
// What it does:
//   1. Reads the print CSS for the requested track from ../styles/.
//   2. Connects to a docs-site preview server (started by build-pdf.sh).
//   3. Navigates to /code-analysis/cubrid/<slug>/ (or /ko/...).
//   4. Waits for the Mermaid CDN script to finish rendering all
//      <pre class="mermaid"> blocks to <svg> (timeout 30s).
//   5. Injects the print CSS via page.addStyleTag().
//   6. Calls page.pdf() with A4 + track-specific margins + custom
//      headerTemplate / footerTemplate. The slide-tone header has a
//      tangram rainbow strip; doc-tone has a thin gray rule.
//
// Per-request fields (--header-left etc.) flow into the templates so
// they vary per PDF without code edits.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PDF_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PDF_ROOT, '..');

function parseArgs(argv) {
  const out = {
    slug: '',
    track: 'slide',
    lang: 'en',
    headerLeft: '',
    headerRight: '',
    footerLeft: '',
    footerRight: '',
    baseUrl: 'http://127.0.0.1:9979',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const v = argv[i + 1];
    switch (a) {
      case '--slug':         out.slug = v; i += 1; break;
      case '--track':        out.track = v; i += 1; break;
      case '--lang':         out.lang = v; i += 1; break;
      case '--header-left':  out.headerLeft = v; i += 1; break;
      case '--header-right': out.headerRight = v; i += 1; break;
      case '--footer-left':  out.footerLeft = v; i += 1; break;
      case '--footer-right': out.footerRight = v; i += 1; break;
      case '--base-url':     out.baseUrl = v; i += 1; break;
      default: break;
    }
  }
  if (!out.slug) {
    console.error('build-pdf.mjs: --slug is required');
    process.exit(2);
  }
  if (out.track !== 'slide' && out.track !== 'doc') {
    console.error(`build-pdf.mjs: --track must be slide|doc (got: ${out.track})`);
    process.exit(2);
  }
  return out;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadLogoDataUri() {
  const file = path.join(PDF_ROOT, 'assets', 'cubrid-logo-small.png');
  if (!fs.existsSync(file)) return '';
  const b64 = fs.readFileSync(file).toString('base64');
  return `data:image/png;base64,${b64}`;
}

// Tangram rainbow strip, 7 brand colors at equal widths.
// Mirrors knowledge-slides/themes/cubrid.css gradient.
const TANGRAM_GRADIENT = `linear-gradient(to right,
  #E53935 0%,    #E53935 14%,
  #F57C00 14%,   #F57C00 28%,
  #C2185B 28%,   #C2185B 42%,
  #FFC107 42%,   #FFC107 56%,
  #1A237E 56%,   #1A237E 70%,
  #2196F3 70%,   #2196F3 84%,
  #4CAF50 84%,   #4CAF50 100%)`;

function buildHeaderTemplate(args) {
  const left = escapeHtml(args.headerLeft);
  const right = escapeHtml(args.headerRight);
  if (args.track === 'slide') {
    return `
<div style="font-family: Pretendard, 'Noto Sans KR', sans-serif; width: 100%; box-sizing: border-box; padding: 0 18mm; font-size: 8pt; color: #1A237E;">
  <div style="height: 4px; background: ${TANGRAM_GRADIENT};"></div>
  <div style="display: flex; justify-content: space-between; padding-top: 4px;">
    <span>${left}</span>
    <span>${right}</span>
  </div>
</div>`;
  }
  // doc-tone: thin neutral rule
  return `
<div style="font-family: Inter, system-ui, sans-serif; width: 100%; box-sizing: border-box; padding: 0 22mm 4px; font-size: 8pt; color: #71717a; border-bottom: 0.5pt solid #d4d4d8;">
  <div style="display: flex; justify-content: space-between;">
    <span>${left}</span>
    <span>${right}</span>
  </div>
</div>`;
}

function buildFooterTemplate(args, logoDataUri) {
  const left = escapeHtml(args.footerLeft);
  const right = escapeHtml(args.footerRight);
  const page = `<span class="pageNumber"></span> / <span class="totalPages"></span>`;
  if (args.track === 'slide') {
    const logo = logoDataUri
      ? `<img src="${logoDataUri}" style="height: 14px; vertical-align: middle; margin-right: 6px;">`
      : '';
    return `
<div style="font-family: Pretendard, 'Noto Sans KR', sans-serif; width: 100%; box-sizing: border-box; padding: 0 18mm; font-size: 7.5pt; color: #6B6B6B;">
  <div style="display: flex; justify-content: space-between; align-items: center;">
    <span style="display: inline-flex; align-items: center;">${logo}${left}</span>
    <span>${right}</span>
    <span>${page}</span>
  </div>
</div>`;
  }
  return `
<div style="font-family: Inter, system-ui, sans-serif; width: 100%; box-sizing: border-box; padding: 6px 22mm 0; font-size: 7.5pt; color: #71717a; border-top: 0.5pt solid #d4d4d8;">
  <div style="display: flex; justify-content: space-between;">
    <span>${left}</span>
    <span>${page}</span>
    <span>${right}</span>
  </div>
</div>`;
}

function pdfMargins(track) {
  return track === 'slide'
    ? { top: '22mm', right: '18mm', bottom: '22mm', left: '18mm' }
    : { top: '25mm', right: '22mm', bottom: '25mm', left: '22mm' };
}

function articleUrl(args) {
  const langPrefix = args.lang === 'ko' ? '/ko' : '';
  return `${args.baseUrl}${langPrefix}/code-analysis/cubrid/${args.slug}/`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const cssPath = path.join(PDF_ROOT, 'styles', `print-${args.track}.css`);
  if (!fs.existsSync(cssPath)) {
    console.error(`build-pdf.mjs: missing CSS for track ${args.track} at ${cssPath}`);
    process.exit(2);
  }
  const cssContent = fs.readFileSync(cssPath, 'utf-8');
  const logoDataUri = loadLogoDataUri();

  const url = articleUrl(args);
  console.error(`→ navigating to ${url}`);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    if (!resp || !resp.ok()) {
      throw new Error(`navigation failed: status ${resp ? resp.status() : 'no response'}`);
    }

    // Wait for Mermaid to swap every <pre class="mermaid"> -> contains <svg>.
    // The page already loads mermaid via CDN ESM and calls mermaid.run() in a
    // DOMContentLoaded handler — see astro.config.mjs.
    await page.waitForFunction(() => {
      const blocks = document.querySelectorAll('pre.mermaid');
      if (blocks.length === 0) return true;
      return Array.from(blocks).every((b) => b.querySelector('svg'));
    }, { timeout: 45000 });

    // Force every <img loading="lazy"> to actually fetch. Astro/Starlight
    // tags markdown images with loading="lazy" + fetchpriority="auto",
    // so anything below the initial viewport never loads under Playwright's
    // networkidle wait. Scroll once end-to-end, then strip the attribute,
    // then wait for every <img>.complete to flip true.
    await page.evaluate(async () => {
      // Strip lazy guards so .complete waits actually fire.
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
        img.removeAttribute('loading');
        img.removeAttribute('fetchpriority');
      });
      const step = 600;
      const max = document.body.scrollHeight;
      for (let y = 0; y < max; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForFunction(() => {
      const imgs = Array.from(document.images);
      return imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: 30000 });

    // Inject the track CSS AFTER mermaid renders and images load so we
    // don't fight their dynamic sizing during render.
    await page.addStyleTag({ content: cssContent });

    // Force print media so @media print rules apply during page.pdf().
    // Playwright defaults to print media for pdf() but be explicit.
    await page.emulateMedia({ media: 'print' });

    // Small settle so transformed svgs stabilize.
    await page.waitForTimeout(250);

    // Output sits next to the source markdown so the PageTitle override
    // discovers it via import.meta.glob. The KO mirror has its own folder
    // so the file ends up adjacent to the KO md, not the EN one.
    const langDir = args.lang === 'ko' ? 'ko' : '';
    const outDir = path.join(
      REPO_ROOT,
      'src',
      'content',
      'docs',
      langDir,
      'code-analysis',
      'cubrid',
    );
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${args.slug}.${args.track}.pdf`);

    await page.pdf({
      path: outFile,
      format: 'A4',
      margin: pdfMargins(args.track),
      displayHeaderFooter: true,
      headerTemplate: buildHeaderTemplate(args),
      footerTemplate: buildFooterTemplate(args, logoDataUri),
      printBackground: true,
      preferCSSPageSize: false,
    });

    console.error(`✓ wrote ${outFile}`);
    console.log(outFile);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
