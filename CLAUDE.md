# READ FIRST ! More instructions to come

## Pulse — the trending board

Pulse (`/pulse`) is the feature that makes this site alive instead of static.
It aggregates trending space/science topics from Reddit + Hacker News, scores
them by momentum, and presents a Kalshi-style leaderboard with expandable
source cards.

### What exists now
- `ingestion/fetch-pulse.ts` — pulls from 11 subreddits + HN Algolia API, matches to 18 topic keywords, computes scores, writes `data/pulse.json`. Run with `npm run pulse`.
- `web/src/lib/pulse.ts` — typed data layer, helpers (getTrendingTopics, getTopSources, formatScore, etc.)
- `web/src/components/PulseBoard.tsx` — interactive React leaderboard with expandable rows, momentum bars, source cards with YouTube thumbnail support
- `web/src/pages/pulse.astro` — full page: header stats, leaderboard, top discussions grid, rising concepts
- Homepage has a compact trending pill strip between "Start here" and "Spotlight"
- Nav includes "Pulse" between Browse and Explore
- `DESIGN-PULSE.md` — original design doc with full vision

### Design principles for Pulse
- Should feel like a Bloomberg terminal for space nerds, not a generic dashboard
- Kalshi's "favorite markets" is the UI inspiration — momentum, ranking, leaderboard energy
- The site is a living room, not a library — Pulse is what makes people come back
- YouTube thumbnails when available (free via img.youtube.com, no API key)
- Dark space aesthetic, amber accent, serif display font — match the atlas
- Always run dev/build from repo root, never cd into web/
