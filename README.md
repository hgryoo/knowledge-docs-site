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

## Private upstream repos

Both `hgryoo/knowledge-base` (analysis source) and `hgryoo/knowledge-slides`
(deck source) are private. Following the pattern set by `knowledge-base-site`:

- **Local dev**: clone both as siblings of this repo. `prebuild.sh` reads
  from `../knowledge-base/knowledge` (override with `SRC=...`), and
  `src/lib/decks.ts` reads from `../knowledge-slides/decks/`.
- **CI (GitHub Actions)**: `.github/workflows/deploy.yml` uses
  `actions/checkout` with two PATs stored as repo secrets — kept
  independent so each can rotate without breaking the other:

  | Secret | Scope | Used for |
  |---|---|---|
  | `KNOWLEDGE_BASE_TOKEN`   | `Contents: Read` on `hgryoo/knowledge-base`   | Checkout analysis docs |
  | `KNOWLEDGE_SLIDES_TOKEN` | `Contents: Read` on `hgryoo/knowledge-slides` | Checkout deck metadata + dist |

  Add a `repository_dispatch` event named `knowledge-base-push` from the
  upstream repos to re-trigger this build whenever they push. The
  knowledge-base side already runs `notify-site.yml` for that — extending
  it to dispatch here is a one-step addition.

## i18n

- English is the root locale (`/`), Korean is at `/ko/`.
- Source files live in two parallel trees in `knowledge-base/`
  (`knowledge/code-analysis/cubrid/` and `knowledge/ko/code-analysis/cubrid/`).
- Both trees use the same Quartz-style frontmatter; the content
  collection schema in `src/content.config.ts` extends Starlight's
  default schema to tolerate the extra fields.

## Slides

Two integration points (the user asked for both):

1. In-site **Slides** page (`/slides/`, `/ko/slides/`) — uses
   `src/lib/decks.ts` to read `../knowledge-slides/decks/*/metadata.json`
   at build time, renders one `DeckCard` per deck, links out to the
   standalone deck site for the actual HTML/PDF.
2. Sidebar link **Standalone site ↗** — points at
   `http://localhost:9999`, the existing
   [`knowledge-slides-site/`](../knowledge-slides-site/) landing.

The standalone site URL is currently hard-coded for local dev. Replace it
with the deployed URL before publishing.

## Design

Matches the editorial palette of the sibling slides site:

- Warm paper / oxblood-accent color tokens in light mode.
- Fraunces serif for display + Pretendard for body.
- Starlight's default sidebar + on-this-page TOC + theme toggle.
