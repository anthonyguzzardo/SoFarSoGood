# Pulse — the trending board

## What this is

A new `/pulse` page (and homepage section) that shows what the world is
talking about across the topics in the atlas. Think Kalshi's market
leaderboard but for science/space topics — a dynamic surface of collective
human interest, ranked by momentum, that makes you want to click around.

The atlas today is a library. Pulse turns it into a living room where people
are already talking.

---

## The page: `/pulse`

### Layout (top to bottom)

```
┌─────────────────────────────────────────────────────────┐
│  PULSE          "what the world is thinking about"      │
│  ─────────────────────────────────────────────────────── │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │  TRENDING NOW                          filter: 24h ▾││
│  │                                                     ││
│  │  1. ▲ Solar sails        ██████████████  +340%      ││
│  │  2. ▲ Fusion propulsion  ████████████    +280%      ││
│  │  3. ▲ Space elevators    ██████████      +195%      ││
│  │  4. — Titan exploration  █████████       steady     ││
│  │  5. ▲ Lunar habitats     ████████        +120%      ││
│  │  6. ▼ Quantum comms      ███████          -15%      ││
│  │  7. ▲ Nuclear thermal    ██████          +90%       ││
│  │  8. — Asteroid mining    █████           steady     ││
│  │                                                     ││
│  │  Each row: click → expands to show WHY it's         ││
│  │  trending (top reddit thread, youtube vid, tweet)   ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ TOP VIDEO    │ │ TOP THREAD   │ │ TOP TWEET    │    │
│  │              │ │              │ │              │    │
│  │ [thumbnail]  │ │ r/space      │ │ @researcher  │    │
│  │ "Why NASA    │ │ "This NIAC   │ │ "Our lab     │    │
│  │  is betting  │ │  concept     │ │  just proved  │    │
│  │  on solar    │ │  could       │ │  this works"  │    │
│  │  sails"      │ │  actually…"  │ │              │    │
│  │ 2.1M views   │ │ 4.2k upvotes│ │ 12k likes    │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                         │
│  ─────────────────────────────────────────────────────── │
│  RISING CONCEPTS                                        │
│                                                         │
│  Grid of concept-cards from the atlas that match        │
│  trending topics, styled like the "Start here" cards    │
│  but with a momentum badge (▲ +340%) overlaid           │
│                                                         │
│  ─────────────────────────────────────────────────────── │
│  COMMUNITY PICKS                                        │
│                                                         │
│  Books, papers, documentaries, podcasts that keep       │
│  getting recommended across platforms for these topics.  │
│  Cards with: title, source count ("mentioned 47 times   │
│  across 3 platforms"), link out                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Homepage integration

A compact version goes on the homepage between "Start here" and "Spotlight":

```
┌─────────────────────────────────────────────────────────┐
│  THE PULSE                                   See all →  │
│                                                         │
│  ▲ Solar sails +340%    ▲ Fusion +280%    ▲ Elevators   │
│                                                         │
│  Compact horizontal scroll of top 5-8 trending topics   │
│  Each is a pill/chip that links to /pulse#topic         │
└─────────────────────────────────────────────────────────┘
```

### Nav update

Add "Pulse" to the main nav bar, between Browse and Explore:

```
Browse  Pulse  Explore  Paths  Wishlist  Mission
```

---

## Data: where the signal comes from

### v0 — build-time ingestion (fits current Astro static architecture)

A new ingestion script (`ingestion/fetch-pulse.ts`) that runs at build time
or on a cron (daily/hourly). It pulls from:

**Reddit (most accessible, highest signal)**
- Subreddits: r/space, r/spacex, r/nasa, r/futurology, r/physics,
  r/aerospace, r/science, r/engineering
- What to pull: top posts by score in last 24h/7d/30d
- Match against our topic/keyword list using text similarity
- Reddit API: free tier exists, or use Pushshift/Arctic Shift archives

**YouTube**
- Search API for our keywords, sort by view count + recency
- Pull: title, view count, channel, thumbnail, publish date
- YouTube Data API v3: free quota = 10,000 units/day (search = 100 units)

**Twitter/X (stretch — API is expensive)**
- If accessible: search recent tweets mentioning our keywords
- Alternative: use Nitter scraping or skip for v0

**Hacker News (free, no auth)**
- Algolia HN API: search by keyword, get score + comment count
- Great signal for technical/science topics

### Data shape

```typescript
// data/pulse.json — generated at build time
interface PulseData {
  generatedAt: string;                // ISO timestamp
  topics: PulseTopic[];
}

interface PulseTopic {
  slug: string;                       // matches topic or keyword slug
  label: string;
  score: number;                      // composite trending score
  delta: number;                      // % change from previous period
  direction: "up" | "down" | "steady";
  mentions: number;                   // total mentions across platforms
  sources: PulseSource[];             // the actual content
  relatedConceptSlugs: string[];      // links back to atlas concepts
}

interface PulseSource {
  platform: "reddit" | "youtube" | "hackernews" | "twitter";
  title: string;
  url: string;
  score: number;                      // upvotes, views, likes
  author?: string;
  subreddit?: string;                 // reddit-specific
  thumbnail?: string;                 // youtube-specific
  commentCount?: number;
  publishedAt: string;
}
```

### Scoring algorithm (simple v0)

```
topic_score = sum of:
  reddit:     Σ(post_score) × 1.0     (upvotes are high-signal)
  youtube:    Σ(view_count / 1000) × 0.5
  hackernews: Σ(post_score) × 1.5     (HN readers = technical audience)
  twitter:    Σ(likes / 10) × 0.3

delta = (score_this_period - score_last_period) / score_last_period × 100
```

---

## Implementation plan

### Phase 1 — Static pulse with Reddit + HN (1-2 sessions)

1. **ingestion/fetch-pulse.ts**
   - Fetch Reddit top posts from target subreddits (last 7 days)
   - Fetch HN top posts matching our keywords
   - Match content to atlas topics/keywords using simple text matching
   - Compute scores, write `data/pulse.json`

2. **web/src/lib/pulse.ts**
   - Load pulse.json, export typed helpers
   - `getTrendingTopics(limit)`, `getTopSources(platform, limit)`

3. **web/src/components/PulseBoard.tsx**
   - React island: the trending leaderboard
   - Expandable rows (click → show sources)
   - Filter by time window (24h / 7d / 30d)
   - Momentum bars + delta badges

4. **web/src/pages/pulse.astro**
   - Full page with leaderboard + top content cards + rising concepts

5. **Homepage section**
   - Compact horizontal pill strip on index.astro

6. **Nav update**
   - Add "Pulse" to BaseLayout nav

### Phase 2 — YouTube + richer cards (1 session)

- Add YouTube Data API integration
- Thumbnail cards for top videos
- "Community picks" section (most-recommended media)

### Phase 3 — Live updates (future)

- Move from build-time to edge function (Cloudflare Workers)
- Real-time or near-real-time pulse updates
- User can "follow" topics for notifications

---

## Design decisions

**Why build-time, not runtime?**
The atlas is already static/Astro. A daily pulse refresh is plenty for v0 —
trending topics don't change by the minute. This avoids API costs, keeps
the site fast, and fits the existing architecture. We can move to edge
functions later.

**Why start with Reddit + HN?**
Both have free, accessible APIs. Reddit is the richest source for diverse
discussion. HN adds a technical/scientific quality signal. YouTube and
Twitter can layer on later.

**Why not just show Reddit posts?**
The value is in the *synthesis*. Showing "solar sails are trending" backed
by the best Reddit thread + a YouTube explainer + the related NIAC concept
is something no single platform does. The atlas becomes the hub.

---

## Open questions

- [ ] Reddit API: use official API (requires app registration) or a public
      archive like Arctic Shift?
- [ ] How often to rebuild? Daily cron via GitHub Actions? On every push?
- [ ] Should trending scores factor in the atlas's own data (e.g., which
      concepts have the most connections/reading paths)?
- [ ] Do we want user accounts eventually (to let people "follow" topics)?

---

## Vibe check

This should feel like opening Bloomberg Terminal for space nerds — except
instead of stock tickers, you see which ideas about the future have
momentum right now. The leaderboard is the hook. The expanded sources are
the substance. The link back to atlas concepts is the bridge.
