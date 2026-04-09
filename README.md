# NIAC Atlas

> An atlas of every future NASA has paid people to seriously imagine.

Searchable, browsable, *interesting* index of speculative aerospace concepts.
Starting with NASA's NIAC (NASA Innovative Advanced Concepts) program, designed
to expand to DARPA, ESA GSP, JAXA, and the long tail of public speculative
research programs.

The pitch isn't "search engine for NASA papers." The pitch is **a navigable
map of imagined futures**: a graph you can wander, with each node being a
concept that someone got paid to seriously work on, tagged with the thing that
becomes possible *if it works*. The first interactive explainer page —
probably rotating tethers — turns the project from useful into shareable.

## Status

**v0 ingestion is working.** 188 real NIAC concepts pulled from NTRS, normalized
into a typed schema, and written to `data/concepts.json`. Spans 2017–2026 with
average abstract length ~1,800 chars. Phase metadata for ~58 of them via
keyword sniffing (the NTRS API doesn't expose phase as a structured field).

What's not built yet: the website, embeddings, semantic search, the graph view,
the interactive explainer pages. That's the next several sessions.

## Architecture

```
niac-atlas/
├── shared/         Types shared between ingestion and web
│   └── concept.ts  Canonical Concept schema
├── ingestion/      One-shot scripts run locally to refresh data
│   ├── ntrs.ts         Typed NTRS API client
│   └── fetch-niac.ts   Pulls all NIAC records → concepts.json
├── data/
│   ├── concepts.json   Normalized output, committed to git
│   └── raw/            Raw API responses, gitignored
└── web/            Astro site (not yet scaffolded)
```

**Stack** (decided, not yet wired up beyond ingestion):

- **Language:** TypeScript everywhere. Node 25 runs `.ts` files natively via
  `--experimental-strip-types`, so no build step for ingestion.
- **Web framework:** Astro with React islands. MDX for concept pages so we can
  embed interactive widgets inline later.
- **Hosting:** Cloudflare Pages for the site, Cloudflare Workers for the
  search endpoint.
- **Embeddings:** Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`) — runs
  on the edge, no external API key needed.
- **Database:** Supabase Postgres + pgvector for the search index. The
  authoritative content lives as MDX files in this repo; Supabase only stores
  vectors and the lookup table that maps a vector back to a slug.

The "MDX in repo for content, Supabase for search index" split is deliberate:
it lets concept pages stay statically rendered, version-controlled, and
embeddable with React widgets — while still giving us fast semantic search.

## Running ingestion

```bash
node --experimental-strip-types ingestion/fetch-niac.ts
```

Takes about 30 seconds. Hits NTRS twice per concept (once in the search
results, once for the full record with abstract) and writes
`data/concepts.json`. Re-run any time to refresh.

## What's next (the actual roadmap)

**Session 2 — generate concept pages from JSON.**
1. Scaffold the Astro app under `web/`.
2. Write a content-collection loader that turns each entry in `concepts.json`
   into a typed Astro content-collection entry.
3. Generate one MDX file per concept (or load directly via a content loader)
   and a `/concept/[slug]` route.
4. Homepage that shows a featured concept and a clean browse list.
5. Deploy to Cloudflare Pages.

**Session 3 — semantic search.**
1. Embed each concept via Workers AI.
2. Push (slug, vector) into Supabase + pgvector.
3. A `/api/search` Worker endpoint: embed query → cosine search → return slugs.
4. Search UI as a React island on the homepage.

**Session 4 — the graph view.**
1. Build a concept-similarity matrix from the embeddings (top-k neighbors per
   concept, persisted as JSON in the repo).
2. d3-force or sigma.js graph visualization on `/atlas`.
3. Click a node → fly to its concept page. Hover → preview.

**Session 5 — the first hand-crafted explainer page.**
1. Pick the rotating tether concept (or whichever is calling loudest).
2. Write a Bret-Victor / Distill-style MDX page with prose, diagrams, and
   React-island sliders.
3. This is the page we point at when we tell people what the site is.

**Session 6+ — the "if this worked" layer, broader corpus, share.**
- Hand-tag concepts with their "if this works, [thing]" payoff line.
- Expand the ingestion to NTRS broadly, then DARPA, ESA, JAXA.
- Domain, OG images, post.

## Known gaps in v0 data

- **Year range is 2017–2026.** Older NIAC studies (1998–2016) exist in NTRS
  but aren't reliably tagged with the "NIAC" keyword. A future ingestion pass
  should also query by NIAC contract-grant prefix (e.g. `80NSSC*F*`) and
  cross-reference with the Wikipedia NIAC list to recover the deep history.
- **Phase metadata is best-effort.** Sniffed from titles and keywords;
  ~70% of records come back as "unknown phase." A small hand-curated mapping
  in `shared/` could fix the most-visible cases.
- **No de-duplication of concepts across multiple papers.** A single concept
  often has separate Phase I and Phase II final reports, and they currently
  show up as two entries. Grouping these into a single concept with multiple
  phases is a job for session 2 or 3.
