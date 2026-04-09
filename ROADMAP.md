# Roadmap

Where we are, what's next, and where this is all going.

## What's done

- **Ingestion pipeline** — pulls 188 NIAC concepts from NASA's NTRS API,
  normalizes into a typed schema, writes to `data/concepts.json`.
- **Web app (Astro 5 + React islands)** — fully functional, statically rendered.
  - Browse page with live search, phase/year filters, deep-linkable URLs
  - Concept detail pages (magazine layout, related concepts, team, sources)
  - Timeline view (SVG dots-on-axis, phase filtering)
  - Force-directed graph view (keyword/PI similarity edges, drag/zoom/click)
  - Subject + keyword cloud browse page
- **Topic deep dives** — 5 curated topics (Black Holes, Gravity, Quantum Physics,
  Propulsion, Telescopes) with overviews, unsolved problems with progress
  milestones, thought experiments, historical timelines, curated media
  (Veritasium, Dwarkesh, 3Blue1Brown, PBS Space Time, Sean Carroll, etc.),
  and related NIAC concepts.
- **Wishlist** — 201 papers spanning 1850 BCE to 2024 CE, searchable/filterable
  by era and field. The seed corpus for community expansion.
- **Mission page** — unified vision, direction, and 5 ways to contribute.

---

## Near-term (next few sessions)

### Embeddings + semantic search
The technical foundation for everything that follows. Without this, search is
keyword-only and "related concepts" is placeholder heuristics.

1. Embed each concept abstract via Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`)
2. Push `(slug, vector)` into Supabase Postgres + pgvector
3. Build a `/api/search` Cloudflare Worker endpoint: embed query, cosine search, return slugs
4. Replace ConceptBrowser's in-memory string matching with semantic search
5. Replace the force graph's keyword-overlap edges with embedding-based similarity

**Why this first:** It's the single biggest UX improvement per unit of effort,
and it's the infrastructure that every later feature (cross-referencing, article
combination, broader corpus search) depends on.

### Source-agnostic schema
Generalize `shared/concept.ts` so ingestion works for any source, not just NIAC.

- Add `citationDOI`, `citationURL` fields
- Broaden `source` from `"NIAC"` to `"niac" | "arxiv" | "openalex" | "pubmed" | ...`
- Keep backward compatibility with existing `data/concepts.json`

**Why now:** Small change, but every ingestion pipeline after this benefits from
it. Do it before adding new sources so we don't migrate later.

### Curated media as a data type
Formalize the media entries that already exist inside topic deep dives into a
standalone `data/media.json` with its own schema and a `/media` route.

- Schema: title, source, type (video/podcast/book/article/documentary), URL,
  topic tags, summary, embedding (later)
- Hand-curate ~50 entries from the topic pages + new additions
- `/media` page: browsable, filterable, searchable
- Cross-link: topic pages pull from `media.json`, media entries link to topics

### Multi-phase concept grouping
Same NIAC concept often has separate Phase I and Phase II reports, appearing as
duplicate entries. Group these into "concept lineages" — a single concept page
with multiple phases as a timeline.

- Detect duplicates by title similarity + shared PI
- Add a `lineage` field linking related concept slugs
- Concept detail page shows the full phase history

### Fix pre-existing type errors
Two Astro pages (`atlas.astro`, `timeline.astro`) have import name collisions.
Two unused variables in ConceptBrowser. Quick cleanup.

---

## Medium-term (next 1-3 months)

### OpenAlex / arXiv integration
The bridge from "atlas of NIAC" to "atlas of science."

- **Phase 1:** Pull papers that cite or are cited by NIAC concepts from OpenAlex
  (~thousands of papers). Immediately useful: "see academic work related to
  this NIAC concept."
- **Phase 2:** Pull arXiv metadata for physics, math, CS, astro-ph categories.
  Embed abstracts. Same search interface, millions of papers.
- **Phase 3:** Full OpenAlex integration (~250M scholarly works with citation
  graph, author disambiguation, institutions).

### Interactive explainer pages (MDX)
Hand-crafted, Distill.pub / Bret Victor-style deep dives with prose, diagrams,
and interactive React widgets (sliders, animations, calculators).

- Pick the first topic: probably rotating tethers (strong NIAC connection) or
  the rocket equation (universally interesting, great for interactivity)
- Build the page so well that sharing it is how we get our first users

### Concept "what if it works" tags
Each NIAC concept represents a speculative technology. Tag each one with its
"if this works, [thing]" payoff line:

- "If solar gravitational lensing works, we can image exoplanet continents."
- "If pulsed fission-fusion works, we can reach Pluto in 4 years."

These payoff lines become the hooks that make browsing addictive.

### Community data enrichment (low-stakes contribution)
Before building full community features, create lightweight contribution
surfaces:

- "Help us tag" — phase metadata for the ~30% of concepts where it's unknown
- "Is this a duplicate?" — flag multi-phase duplicates for grouping
- Submit media recommendations via GitHub issue template
- Suggest wishlist entries via PR to `data/wishlist.json`

All via GitHub for now — no auth system needed.

---

## Long-term (3-12 months)

### Historical source ingestion
The hard, genuinely novel piece. No one is doing community-driven digitization
of historical scientific texts with cross-referencing to modern work.

- Start with public domain sources: Internet Archive, HathiTrust, Project
  Gutenberg, Wikisource
- Focus on the ~50 most important pre-1900 works already on the wishlist
- Build a simple transcription/proofreading interface (Distributed Proofreaders
  model)
- Tag historical works with concepts that link forward to modern entries

### Community discussion layer
Add discourse to the platform — but only after the content is strong enough to
attract serious people.

- Discussion threads per concept / per topic
- Real names / ORCID integration as an option
- Quality-first moderation (no upvote farming, no engagement bait)
- "Annotate" mode — comment on specific paragraphs of papers/concepts

### Expand to DARPA, ESA GSP, JAXA
Prove the ingestion model generalizes beyond NIAC:

- DARPA: similar speculative technology concepts, different API
- ESA GSP: European Space Agency's General Studies Programme
- JAXA: Japan Aerospace Exploration Agency
- Each gets its own `source` value; everything else (search, graph, topics)
  works automatically

### AI-assisted discovery
Once we have a large, embedded corpus with citation links:

- "Show me papers from different centuries that are circling the same idea"
- "What concepts in the NIAC corpus relate to this arXiv paper I just read?"
- "Generate a reading path from Newton's Principia to LIGO's gravitational
  wave detection"
- Automatic cross-referencing: surface connections nobody has explicitly drawn

This is where the vision of "help people make connections no one else has made"
becomes real.

---

## The north star

A place where all of human scientific knowledge is browsable, connected, and
alive. Where a curious person can start with a black hole, follow a thread
through 300 years of physics, watch the best explanation ever filmed, read the
original paper, and discover that a NASA-funded team is working on something
related right now. Where the world's best scientific minds come to learn from
each other, debate, share research, and find collaborators.

We're not there yet. But the staircase is visible.
