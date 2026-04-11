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

**The Pantheon** — a tiered, opinionated roster of the greatest scientific minds
that ever lived. Rankings are vibes-based and non-negotiable. Each titan gets
power moves, fun facts, rivalries, influence webs, and a Tea section for the
parts of the story that complicate the hero narrative. Einstein's divorce
settlement. Newton's alchemy obsession. Turing's prosecution. The truth.

**Pulse** — a trending board that aggregates space and science topics from Reddit,
Hacker News, and ArXiv. Scores them by momentum. Presents a Kalshi-style
leaderboard. The thing that makes people come back.

**Topics** — deep pages on the subjects that matter. Special relativity, quantum
physics, black holes, propulsion, the scale of the universe. Each one connects
to NIAC concepts, papers, and explainer videos.

**The Wishlist** — community-driven quests for what to build next. Not a backlog.
A treasure hunt.

## The belief underneath all of this

You cannot understand the present without understanding the past. Every modern
discovery stands on centuries of prior work. The system should make those
lineages visible and browsable. Science is not a collection of facts — it's a
web of people arguing with each other across centuries, and occasionally being
right about something that changes everything.

## What's next

- Embeddings + semantic search (so "rotating tether" returns NIAC concepts,
  arXiv papers, historical texts, and the best explainer videos)
- OpenAlex / arXiv integration (tens of millions of papers, same interface)
- Interactive explainer pages (Distill-style, MDX + React widgets)
- Community contribution surfaces (transcription, tagging, discussion)
- Expand to DARPA, ESA, JAXA, and the broader research corpus
- More titans. More tea.

## Architecture

```
SoFarSoGood/
├── shared/         Types shared between ingestion and web
│   └── concept.ts  Canonical Concept schema
├── ingestion/      One-shot scripts run locally to refresh data
│   ├── ntrs.ts         Typed NTRS API client
│   ├── fetch-niac.ts   Pulls all NIAC records -> concepts.json
│   └── fetch-pulse.ts  Pulls trending topics -> pulse.json
├── data/
│   ├── concepts.json   188 NIAC concepts, committed to git
│   ├── pantheon.json   The GOAT roster
│   ├── pulse.json      Trending topics snapshot
│   └── raw/            Raw API responses, gitignored
└── web/            Astro 5 + React islands + Tailwind
    ├── src/pages/       Browse, concept/[slug], timeline, atlas, pantheon, pulse
    ├── src/components/  ConceptBrowser, Timeline, Atlas, PulseBoard (React islands)
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

# Refresh trending topics
npm run pulse

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
- **Phase metadata is ~70% detected** via keyword sniffing. Hand-curation pass needed.
- **Multi-phase duplicates:** same concept with Phase I and Phase II reports appear as separate entries.
- **Graph edges are placeholder** (shared keywords/PI). Embedding-based similarity will replace them.
- **Pantheon is 15 titans.** The roster grows. Nominations welcome. Tier placement is final.
