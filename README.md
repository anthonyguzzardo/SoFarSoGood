# So Far So Good

> "Up to this point, everything is fine." — the falling man, La Haine

A living atlas of scientific knowledge. Not a library. Not a database. A place
where a curious person falls into a topic at 11pm and surfaces at 3am having
connected a 2024 JWST observation to a 1905 Einstein paper to a 1687 Newton
manuscript they didn't know existed.

Started with NASA's NIAC program — 188 speculative aerospace concepts that read
like science fiction but have NASA funding behind them. Now expanding into
something bigger: the place where all of human scientific knowledge is
browsable, connected, and alive.

**Live at [hactenusbene.com](https://hactenusbene.com)**

## What's in here

**The Atlas** — 188 NIAC concepts. Searchable. Browsable. Force-directed graph
view where you can drag nodes around and watch the connections settle. Timeline
view. Deep-linked everything.

**The Pantheon** — a tiered, opinionated roster of the 25 greatest scientific minds
that ever lived. Rankings are vibes-based and non-negotiable. Each titan gets
power moves, fun facts, rivalries, influence webs, and a Tea section for the
parts of the story that complicate the hero narrative. Einstein's divorce
settlement. Newton's alchemy obsession. Turing's prosecution. The truth.

**Pulse** — a trending board that aggregates space and science topics from Reddit,
Hacker News, and ArXiv. Scores them by social momentum AND cross-references
the site's own knowledge graph to compute a **Resonance Score** — how deeply
a trending topic connects to funded research, historical lineage, editorial
conviction, and unsolved problems. Every topic gets classified into a quadrant:

- **Real Deal** — trending and knowledge-backed
- **Hype Cycle** — trending but shallow (no funded research, no depth)
- **Sleeping Giant** — deep knowledge backing, nobody talking about it yet
- **Dead Zone** — neither trending nor knowledge-backed

The thing that makes people come back.

**Topics** — deep pages on the subjects that matter. Special relativity, quantum
physics, black holes, propulsion, the scale of the universe. Each one connects
to NIAC concepts, papers, and explainer videos.

**The Graveyard** — a negative results archive. Debunked theories, retracted
papers, superseded models. Not a wall of shame — a map of explored territory.
Cold fusion, N-rays, Piltdown Man, steady-state cosmology. Each entry explains
the hypothesis, what happened, and why it matters. The graveyard also feeds
into Pulse as an anti-signal: if a trending topic overlaps with a debunked
result, the resonance score reflects that.

**The Wishlist** — community-driven quests for what to build next. Not a backlog.
A treasure hunt.

**Reading Paths** — curated multi-century narratives that connect ancient
knowledge to modern NIAC concepts. From Michell's dark stars (1783) to
NASA's solar gravity lens mission (2025). Four paths spanning 100-300 years each.

## The belief underneath all of this

You cannot understand the present without understanding the past. Every modern
discovery stands on centuries of prior work. The system should make those
lineages visible and browsable. Science is not a collection of facts — it's a
web of people arguing with each other across centuries, and occasionally being
right about something that changes everything.

## What's next

- OpenAlex / arXiv integration (tens of millions of papers, same interface)
- Interactive explainer pages (Distill-style, MDX + React widgets)
- Community contribution surfaces (transcription, tagging, discussion)
- Expand to DARPA, ESA, JAXA, and the broader research corpus
- News RSS integration for Pulse (Nature, Ars Technica, ScienceDaily)
- Citation velocity as a leading indicator in Pulse scoring
- More titans. More tea.

## Architecture

```
SoFarSoGood/
├── shared/              Types shared between ingestion and web
│   ├── concept.ts       Canonical Concept schema
│   ├── connection.ts    Ancient-to-modern knowledge threads
│   └── reading-path.ts  Multi-century narrative arcs
├── ingestion/           Scripts to refresh data (run via npm or GitHub Actions)
│   ├── ntrs.ts              Typed NASA NTRS API client
│   ├── fetch-niac.ts        Pulls all NIAC records -> concepts.json
│   ├── fetch-pulse.ts       Pulls trending topics + computes resonance -> pulse.json
│   ├── fetch-literature.ts  Citation enrichment via Semantic Scholar + OpenAlex
│   └── build-embeddings.ts  TF-IDF concept similarity -> concept-similarities.json
├── data/
│   ├── concepts.json             188 NIAC concepts
│   ├── pantheon.json             25 scientific titans
│   ├── pulse.json                Trending topics + resonance scores
│   ├── pulse-meta.json           Ingestion health metrics
│   ├── pulse-YYYY-MM-DD.json     Weekly snapshots (auto-archived after 8 weeks)
│   ├── topics.json               13 deep topic pages (equations, open questions)
│   ├── editorial.json            "What if it works" annotations + tiers
│   ├── connections.json          15 ancient-to-modern knowledge threads
│   ├── negative-results.json     12 debunked/retracted/superseded results
│   ├── concept-similarities.json TF-IDF similarity edges (345 edges)
│   ├── wishlist.json             Community quest items
│   ├── reading-paths.json        Curated multi-century narratives
│   └── .cache/                   API response cache (6h TTL, gitignored)
├── .github/workflows/
│   ├── pulse.yml                 Twice daily: 06:00 + 18:00 UTC
│   └── literature.yml            Weekly: Sundays 08:00 UTC
└── web/                 Astro 5 + React islands + Tailwind
    ├── src/pages/       12 routes: index, pulse, atlas, explore, pantheon, etc.
    ├── src/components/  PulseBoard, ConceptBrowser, Timeline, Atlas (React islands)
    ├── src/layouts/     BaseLayout (nav, footer, starfield)
    └── src/lib/         Typed data loaders, stats, pulse helpers
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

# Refresh trending topics + compute resonance scores
npm run pulse

# Backdate 4 weeks of pulse snapshots
npm run pulse:backdate

# Literature enrichment (citations, verification)
npm run literature:verify
npm run literature:citations

# Dev server
npm run dev        # -> http://localhost:3000

# Build static site
npm run build      # -> web/dist/
```

## Contributing

Want to help? See **[CONTRIBUTING.md](CONTRIBUTING.md)** for the full guide.

Short version: fork the repo, make a branch, open a pull request. Nobody pushes
directly to `main` except maintainers.

## Known gaps

- **Year range is 2017-2026.** Older NIAC (1998-2016) needs contract-grant prefix queries.
- **Phase metadata is ~70% detected** via keyword sniffing. Hand-curation pass via `phase-overrides.json`.
- **Multi-phase duplicates:** same concept with Phase I and Phase II reports appear as separate entries.
- **Graveyard is 12 entries.** Covers the classics but needs expansion. Community submissions welcome.
- **Graveyard-to-Pulse keyword matching is conservative.** Only fires when topic search terms appear verbatim in negative-result text. Will improve as both datasets grow.
- **Pantheon is 25 titans.** The roster grows. Nominations welcome. Tier placement is final.
