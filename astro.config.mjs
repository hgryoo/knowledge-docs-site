import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const kbRepo = path.resolve(here, '../knowledge-base');
const slidesRepo = path.resolve(here, '../knowledge-slides');

export default defineConfig({
  site: 'http://localhost:9998',
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
    }),
  ],
});
