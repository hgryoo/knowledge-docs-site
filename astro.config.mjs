import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeMermaidPre from './src/lib/rehype-mermaid-pre.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const kbRepo = path.resolve(here, '../knowledge-base');
const slidesRepo = path.resolve(here, '../knowledge-slides');

// Deployed to a GitHub Pages subpath (hgryoo.dev/knowledge-docs-site/).
// The CI workflow sets SITE_BASE and SITE_URL; locally we default to
// root so `npm run dev` keeps working at http://localhost:9998/.
const siteBase = process.env.SITE_BASE || '';
const siteUrl = process.env.SITE_URL || `http://localhost:9998${siteBase}`;

export default defineConfig({
  site: siteUrl,
  base: siteBase || undefined,
  server: { host: '0.0.0.0', port: 9998 },
  vite: {
    server: {
      fs: {
        // Astro must be able to read through the symlinks into the sibling
        // knowledge-base/ and knowledge-slides/ repos.
        allow: [here, kbRepo, slidesRepo],
      },
    },
  },
  markdown: {
    // Rewrite ```mermaid fences to `<pre class="mermaid">…</pre>` markers;
    // the script registered in starlight({head}) loads mermaid.js from a
    // CDN and renders every block in the browser. No playwright/headless
    // chrome at build time.
    syntaxHighlight: { type: 'shiki', excludeLangs: ['mermaid'] },
    rehypePlugins: [rehypeMermaidPre],
  },
  integrations: [
    starlight({
      title: 'hgryoo · Docs',
      description: 'Long-form notes, code analyses, and references.',
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ko: { label: '한국어', lang: 'ko' },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/hgryoo',
        },
      ],
      sidebar: [
        {
          label: 'Code Analysis',
          translations: { ko: '코드 분석' },
          autogenerate: { directory: 'code-analysis' },
        },
        {
          label: 'Slides',
          translations: { ko: '발표 자료' },
          items: [
            {
              label: 'All decks',
              translations: { ko: '전체 목록' },
              link: '/slides/',
            },
            {
              label: 'Standalone site ↗',
              translations: { ko: '독립 사이트 ↗' },
              link: 'http://localhost:9999',
              attrs: { target: '_blank', rel: 'noopener' },
            },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'script',
          attrs: { type: 'module' },
          content: `
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

const isDark = document.documentElement.dataset.theme !== 'light';
mermaid.initialize({
  startOnLoad: false,
  theme: isDark ? 'dark' : 'default',
  securityLevel: 'loose',
});

function ready(fn) {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn);
}

ready(async () => {
  try {
    await mermaid.run({ querySelector: 'pre.mermaid' });
  } catch (e) {
    console.warn('mermaid render error', e);
  }
  attachLightbox();
});

function attachLightbox() {
  document.querySelectorAll('pre.mermaid').forEach((pre) => {
    pre.classList.add('mermaid-zoomable');
    pre.addEventListener('click', () => openLightbox(pre));
  });
}

function openLightbox(source) {
  const svg = source.querySelector('svg');
  if (!svg) return;

  const overlay = document.createElement('div');
  overlay.className = 'mermaid-lightbox';
  overlay.innerHTML = \`
    <button class="mermaid-lightbox__close" type="button" aria-label="Close diagram">×</button>
    <div class="mermaid-lightbox__hint">Wheel: zoom &nbsp;·&nbsp; Drag: pan &nbsp;·&nbsp; Esc or click outside: close</div>
    <div class="mermaid-lightbox__stage"></div>
  \`;

  const stage = overlay.querySelector('.mermaid-lightbox__stage');
  const clone = svg.cloneNode(true);
  clone.removeAttribute('width');
  clone.removeAttribute('height');
  clone.style.maxWidth = 'none';
  clone.style.maxHeight = 'none';
  clone.style.transformOrigin = '0 0';
  stage.appendChild(clone);

  // pan/zoom state
  let scale = 1, tx = 0, ty = 0;
  let panning = false, sx = 0, sy = 0, sTx = 0, sTy = 0;
  const apply = () => {
    clone.style.transform = \`translate(\${tx}px, \${ty}px) scale(\${scale})\`;
  };

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.max(0.1, Math.min(20, scale * factor));
    // zoom toward cursor
    tx = mx - ((mx - tx) * newScale) / scale;
    ty = my - ((my - ty) * newScale) / scale;
    scale = newScale;
    apply();
  }, { passive: false });

  stage.addEventListener('mousedown', (e) => {
    panning = true;
    sx = e.clientX; sy = e.clientY;
    sTx = tx; sTy = ty;
    stage.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    tx = sTx + (e.clientX - sx);
    ty = sTy + (e.clientY - sy);
    apply();
  });
  const stopPan = () => {
    panning = false;
    stage.style.cursor = 'grab';
  };
  window.addEventListener('mouseup', stopPan);

  // initial fit
  requestAnimationFrame(() => {
    const rect = stage.getBoundingClientRect();
    const bbox = clone.getBBox?.() ?? { width: clone.clientWidth, height: clone.clientHeight };
    const sx2 = rect.width  / bbox.width;
    const sy2 = rect.height / bbox.height;
    scale = Math.min(sx2, sy2) * 0.92;
    tx = (rect.width  - bbox.width  * scale) / 2;
    ty = (rect.height - bbox.height * scale) / 2;
    apply();
  });

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.mermaid-lightbox__close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);

  stage.style.cursor = 'grab';
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const obs = new MutationObserver(() => {
    if (!document.body.contains(overlay)) {
      document.body.style.overflow = '';
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true });
}
          `,
        },
      ],
    }),
  ],
});
