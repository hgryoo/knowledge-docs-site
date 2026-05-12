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
              startOnLoad: true,
              theme: isDark ? 'dark' : 'default',
              securityLevel: 'loose',
            });
          `,
        },
      ],
    }),
  ],
});
