import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DECKS_ROOT = path.resolve(here, '../../../knowledge-slides/decks');
const DIST_ROOT = path.resolve(here, '../../../knowledge-slides/dist');

export type LangCode = 'en' | 'ko';
const LANGS: LangCode[] = ['en', 'ko'];

export type LangAssets = {
  lang: LangCode;
  html?: string;
  pdf?: string;
  thumbnail?: string;
};

export type Deck = {
  slug: string;
  title: string;
  subtitle?: string;
  date?: string;
  summary?: string;
  tags?: string[];
  languages: LangAssets[];
  primaryThumbnail?: string;
  primaryUrl?: string;
  available: boolean;
};

const STANDALONE_BASE = 'http://localhost:9999';

function distExists(file: string): boolean {
  try {
    return fs.statSync(path.join(DIST_ROOT, file)).isFile();
  } catch {
    return false;
  }
}

function detectLang(slug: string, lang: LangCode): LangAssets | null {
  const srcPath = path.join(DECKS_ROOT, slug, lang, 'slides.md');
  if (!fs.existsSync(srcPath)) return null;

  const html = `${slug}.${lang}.html`;
  const pdf = `${slug}.${lang}.pdf`;
  const thumb = `${slug}.${lang}.thumb.png`;

  return {
    lang,
    html: distExists(html) ? `${STANDALONE_BASE}/decks/${html}` : undefined,
    pdf: distExists(pdf) ? `${STANDALONE_BASE}/decks/${pdf}` : undefined,
    thumbnail: distExists(thumb)
      ? `${STANDALONE_BASE}/decks/${thumb}`
      : undefined,
  };
}

export function loadDecks(): Deck[] {
  if (!fs.existsSync(DECKS_ROOT)) return [];

  const slugs = fs
    .readdirSync(DECKS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const decks: Deck[] = [];

  for (const slug of slugs) {
    const metaPath = path.join(DECKS_ROOT, slug, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;

    let raw: Partial<Deck>;
    try {
      raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch (err) {
      console.warn(`[decks] failed to parse ${metaPath}:`, err);
      continue;
    }

    const languages = LANGS.map((l) => detectLang(slug, l)).filter(
      (x): x is LangAssets => x !== null,
    );
    if (languages.length === 0) continue;

    const firstBuilt = languages.find((l) => l.html);

    decks.push({
      slug: raw.slug ?? slug,
      title: raw.title ?? slug,
      subtitle: raw.subtitle,
      date: raw.date,
      summary: raw.summary,
      tags: raw.tags ?? [],
      languages,
      primaryThumbnail: languages.find((l) => l.thumbnail)?.thumbnail,
      primaryUrl: firstBuilt?.html,
      available: !!firstBuilt,
    });
  }

  decks.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return decks;
}

const MONTH_LABELS_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_LABELS_KO = [
  '1월', '2월', '3월', '4월', '5월', '6월',
  '7월', '8월', '9월', '10월', '11월', '12월',
];

export function monthLabel(date: string | undefined, lang: LangCode = 'en'): string {
  if (!date) return '';
  const m = Number(date.slice(5, 7));
  if (!m || m < 1 || m > 12) return '';
  return (lang === 'ko' ? MONTH_LABELS_KO : MONTH_LABELS_EN)[m - 1];
}
