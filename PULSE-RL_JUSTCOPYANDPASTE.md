I'm iterating on the Pulse feature of niac-atlas — a trending board that shows what the world is talking about across space/science topics. Think Kalshi's favorite markets leaderboard but for science.

Read these before doing anything:
1. `CLAUDE.md` and `DESIGN-PULSE.md` — full context on what exists and the vision.
2. **The iteration log in memory** (`pulse_iterations.md`) — what each run improved, what's working, what weaknesses are known. Don't redo what's been done. Pick a new weakness to attack.

Then do all of this:

1. **Run the site** — `npm run dev` from root. Look at `/pulse` and the homepage pulse strip. Describe what you see — call out anything that looks broken or off.

2. **Read the current implementation** — the component (`web/src/components/PulseBoard.tsx`), the page (`web/src/pages/pulse.astro`), the data layer (`web/src/lib/pulse.ts`), and the ingestion script (`ingestion/fetch-pulse.ts`).

3. **Check the iteration log** — read what's been done and what weaknesses are flagged. Pick the highest-impact weakness that hasn't been addressed yet.

4. **Fix it** — make one high-impact improvement. Not a refactor, not cleanup. Something that makes the page more alive, more engaging, or more useful. Think: what would make someone screenshot this and share it?

5. **Verify visually** — check the dev server after your changes. Confirm nothing is broken and the improvement actually lands.

6. **Update the iteration log** — add your iteration with: what you changed, why, files touched, and new weaknesses you noticed for next time.

7. **Show me what you changed and why.**

Constraints:
- No API keys. Reddit JSON endpoints and HN Algolia are free. YouTube thumbnails via img.youtube.com are free. Stay within those.
- Match the existing design language (dark paper, amber accent, serif display, mono eyebrows).
- Don't break what works — the leaderboard expand/collapse interaction is great, don't mess with it.
- Build from root. Never cd into web/.