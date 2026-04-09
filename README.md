# NIAC Atlas

> A navigable map of imagined futures — and eventually, of all human scientific knowledge.

Starting with NASA's NIAC (NASA Innovative Advanced Concepts) program: 188
speculative aerospace concepts, searchable, browsable, connected. Designed to
expand into **the place where scientific knowledge is alive** — where modern
papers sit next to 500-year-old engineering, where a curious person can fall
into a topic and emerge hours later having made connections no one else has made,
and where the world's best scientific minds come to learn from each other.

## The direction

This is one project, one direction. Not separate initiatives — one system that
gets richer over time.

**What we're building:**

1. **A universal index of scientific knowledge.** Every paper, every book, every
   dataset that matters — modern and historical. We don't host the PDFs; we
   index the metadata, embed the abstracts, and make everything searchable and
   cross-referenceable. A search for "rotating tether" returns NIAC concepts,
   arXiv papers, historical texts, and the best explainer videos on the topic.

2. **Connections that help people discover.** AI-assisted semantic search and
   automatic cross-referencing so the platform actively surfaces relationships.
   Combine articles across centuries. Show that a 2024 JWST observation connects
   to a 1905 Einstein paper connects to a 1687 Newton manuscript. The system
   should help you *think*, not just search.

3. **A community that builds knowledge together.** Community-driven corpus
   enrichment: scanning old books, transcribing manuscripts, tagging and linking
   concepts. Community discussion on every topic — not Reddit-style noise, but
   the kind of nuanced, intelligent, collaborative discourse that makes you
   smarter for having read it.

4. **Curated voices alongside primary sources.** Trusted science communicators
   surfaced next to the papers they're explaining. Veritasium, NASA, the Dwarkesh
   Podcast, 3Blue1Brown, PBS Space Time, Quanta Magazine — the best explanations
   of hard ideas, linked to the primary sources they draw from.

5. **Deep dives into the topics that fascinate us.** Starting with the ones we
   care about most: special relativity, quantum physics, time dilation, black
   holes, gravity, ultraviolet lithography, artificial intelligence, data
   compression, the scale of the universe. These seed topics become the proof
   that the system works, then expand to whatever the community gravitates to.

**The belief underneath all of this:** you cannot understand the present without
understanding the past. Every modern discovery stands on centuries of prior work.
The system should make those lineages visible and browsable.

## Status

**v0 is live.** 188 NIAC concepts (2017–2026), fully functional web app.

What's built:
- Ingestion pipeline pulling from NASA's NTRS API
- Browse page with live search + phase/year filters + deep-linkable URLs
- Concept detail pages (magazine-style layout, related concepts, team, sources)
- Timeline view (SVG dot-on-axis visualization, phase filtering)
- Force-directed graph view (keyword/PI similarity edges, drag/zoom/click)
- Subject + keyword cloud browse page
- Dark, paper-quiet aesthetic (Rauschenberg-meets-JPL)

What's next:
- Embeddings + semantic search (Cloudflare Workers AI + Supabase pgvector)
- Source-agnostic schema so ingestion generalizes beyond NIAC
- Curated media entries (hand-picked explainer videos, podcasts, articles)
- OpenAlex / arXiv integration (tens of millions of papers, same interface)
- Interactive explainer pages (Distill-style, MDX + React widgets)
- Community contribution surfaces (transcription, tagging, discussion)
- Expand to DARPA, ESA GSP, JAXA, and the broader research corpus

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
└── web/            Astro 5 + React islands + Tailwind
    ├── src/pages/       Browse, concept/[slug], timeline, atlas, subjects
    ├── src/components/  ConceptBrowser, Timeline, Atlas (React islands)
    ├── src/layouts/     BaseLayout (nav, footer, starfield)
    └── src/lib/         Data loading, stats, related-concept graph
```

**Stack:**
- TypeScript everywhere, Node 25 native `.ts` via `--experimental-strip-types`
- Astro 5 (static site generation) + React 19 (client islands) + MDX
- Tailwind CSS 4 with `@theme` design tokens
- Cloudflare Pages (site) + Workers (search API) + Workers AI (embeddings)
- Supabase Postgres + pgvector (search index)

## Running locally

```bash
# Ingestion (refresh data from NTRS)
npm run ingest

# Dev server
npm run dev        # → http://localhost:3000

# Build static site
npm run build      # → web/dist/
```

## Known gaps

- **Year range is 2017–2026.** Older NIAC (1998–2016) needs contract-grant prefix queries.
- **Phase metadata is ~70% detected** via keyword sniffing. Hand-curation pass needed.
- **Multi-phase duplicates:** same concept with Phase I and Phase II reports appear as separate entries.
- **Graph edges are placeholder** (shared keywords/PI). Embedding-based similarity will replace them.
