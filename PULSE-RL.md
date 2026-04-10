# Pulse RL Prompt

Copy-paste the section below into a new conversation to keep iterating.

---

## Prompt (copy from here)

I'm iterating on the Pulse feature of niac-atlas — a trending board that shows what the world is talking about across space/science topics. Think Kalshi's favorite markets leaderboard but for science.

Read CLAUDE.md and DESIGN-PULSE.md for full context on what exists and the vision.

Then do all of this:

1. **Run the site** — `npm run dev` from root. Look at `/pulse` and the homepage pulse strip.

2. **Read the current implementation** — the component (`web/src/components/PulseBoard.tsx`), the page (`web/src/pages/pulse.astro`), the data layer (`web/src/lib/pulse.ts`), and the ingestion script (`ingestion/fetch-pulse.ts`).

3. **Identify the weakest part** — what's the most boring, generic, or underwhelming thing about Pulse right now? What would make a user close the tab? Be brutally honest.

4. **Fix it** — make one high-impact improvement. Not a refactor, not cleanup. Something that makes the page more alive, more engaging, or more useful. Think: what would make someone screenshot this and share it?

5. **Show me what you changed and why.**

Constraints:
- No API keys. Reddit JSON endpoints and HN Algolia are free. YouTube thumbnails via img.youtube.com are free. Stay within those.
- Match the existing design language (dark paper, amber accent, serif display, mono eyebrows).
- Don't break what works — the leaderboard expand/collapse interaction is great, don't mess with it.
- Build from root. Never cd into web/.

Previous iterations have covered: basic leaderboard, expandable source cards, YouTube thumbnail pipeline, homepage pill strip, hover lift animation. Don't redo those — push forward.
