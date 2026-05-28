import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { z } from 'astro:content';

// Extend Starlight's docs schema so the KB's extra frontmatter fields
// (category, project, sources, references, summary, created/updated dates,
// tags, etc.) don't trip strict-mode validation. Everything beyond `title`
// is optional and passes through untouched.
const kbExtensions = z.object({
  category: z.string().optional(),
  project: z.string().optional(),
  module: z.string().optional(),
  subcategory: z.string().optional(),
  // sources/references are informational metadata only. The kb and local
  // trees sometimes have list items containing colons (e.g.
  // `- AWS Blog — "Improve performance: diagnose ..."`) which YAML parses
  // as objects rather than strings. Accept any array shape.
  sources: z.array(z.unknown()).optional(),
  references: z.array(z.unknown()).optional(),
  summary: z.string().optional(),
  created: z.union([z.string(), z.date()]).optional(),
  updated: z.union([z.string(), z.date()]).optional(),
  tags: z.array(z.string()).optional(),
  // Force-attach colocated PDFs whose filename stem does NOT match this
  // page's slug (PageTitle's auto-discovery only finds <slug>.<track>.pdf).
  // Use for merged/combined PDFs — e.g. 01-survey-series.cubrid.pdf is the
  // combined export of the 01-xx survey docs and has no 01-survey-series.md
  // host of its own, so the overview page claims it explicitly. Values are
  // filenames relative to the page's own directory.
  extra_pdfs: z.array(z.string()).optional(),
});

// The KB's auto-generated README.md files have no frontmatter (and therefore
// no `title:`), so we filter them out. The `code-analysis/index.mdx` page in
// this repo serves as the category landing instead. Hidden dirs (.meta,
// .omc, .obsidian) are excluded by default by glob's dotfile handling but
// we list them explicitly for clarity.
export const collections = {
  docs: defineCollection({
    loader: glob({
      base: './src/content/docs',
      pattern: [
        '**/*.{md,mdx,mdoc}',
        '!**/README.md',
        '!**/CLAUDE.md',
        '!**/.meta/**',
        '!**/.omc/**',
        '!**/.obsidian/**',
      ],
    }),
    schema: docsSchema({ extend: kbExtensions }),
  }),
};
