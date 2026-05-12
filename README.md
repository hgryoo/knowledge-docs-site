# knowledge-docs-site

Astro [Starlight](https://starlight.astro.build/) site that renders the
analysis documents from the sibling [`knowledge-base/`](../knowledge-base/)
repo. Replaces Quartz4 for the long-form code-analysis side of the
knowledge base — Quartz is still better as a wiki/graph, but Starlight
gives nicer reading + reference UX for module-by-module deep dives.

A **Slides** tab links to the sibling
[`knowledge-slides-site/`](../knowledge-slides-site/) and also embeds a
lightweight in-site deck index.

## Layout

```
src/content/docs/
├── index.mdx                       # editorial landing (EN)
├── slides.mdx                      # in-site deck index (EN)
├── code-analysis/
│   ├── index.mdx                   # category landing (EN, in repo)
│   └── cubrid/                     # rsync'd from knowledge-base (EN)
└── ko/
    ├── index.mdx                   # editorial landing (KO)
    ├── slides.mdx                  # in-site deck index (KO)
    └── code-analysis/
        ├── index.mdx               # category landing (KO, in repo)
        └── cubrid/                 # rsync'd from knowledge-base (KO)
```

The two `cubrid/` directories are materialized by `prebuild.sh` (rsync +
frontmatter sanitize) and listed in `.gitignore`. Same pattern as the
sibling [`knowledge-base-site`](../knowledge-base-site/).

## Run locally

```bash
./install.sh           # prereq check, npm install, prebuild content
npm run dev            # http://localhost:9998
```

When the upstream knowledge-base changes:

```bash
npm run refresh        # rsync + sanitize, picks up new docs
```

Astro hot-reload picks up the rsync'd files within a second.

## Private upstream repo

The analysis source `hgryoo/knowledge-base` is private. Following the
pattern set by `knowledge-base-site`:

- **Local dev**: clone `knowledge-base` as a sibling of this repo.
  `prebuild.sh` reads from `../knowledge-base/knowledge` (override
  with `SRC=...`).
- **CI (GitHub Actions)**: `.github/workflows/deploy.yml` uses
  `actions/checkout` with a `KNOWLEDGE_BASE_TOKEN` repo secret (PAT
  with `Contents: Read` on `hgryoo/knowledge-base`).

  Add a `repository_dispatch` event named `knowledge-base-push` from
  the upstream repo to re-trigger this build whenever it pushes. The
  knowledge-base side already runs `notify-site.yml` for that —
  extending it to dispatch here is a one-step addition.

## i18n

- English is the root locale (`/`), Korean is at `/ko/`.
- Source files live in two parallel trees in `knowledge-base/`
  (`knowledge/code-analysis/cubrid/` and `knowledge/ko/code-analysis/cubrid/`).
- Both trees use the same Quartz-style frontmatter; the content
  collection schema in `src/content.config.ts` extends Starlight's
  default schema to tolerate the extra fields.

## Slides

This site links out to the standalone
[`knowledge-slides-site`](https://hgryoo.dev/knowledge-slides-site/) for
the deck listing — both via the hero "View slides ↗" action and the
sidebar "Slides ↗" item. There is no in-site deck index here; the
standalone site already owns that view.

## Design

Matches the editorial palette of the sibling slides site:

- Warm paper / oxblood-accent color tokens in light mode.
- Fraunces serif for display + Pretendard for body.
- Starlight's default sidebar + on-this-page TOC + theme toggle.
