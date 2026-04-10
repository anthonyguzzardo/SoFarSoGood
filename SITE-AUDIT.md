# SITE-WIDE AUDIT — So Far So Good

Full page-by-page review. Read before touching anything.

---

## THE NAVBAR — VERDICT: CRUNCH IT

**Current state:** 7 primary items + 3 secondary "view" items + Random button = **11 clickable things** in the header. On mobile this wraps into 2-3 lines. That's a toolbar, not a nav.

### Current nav items
| Slot | Label | Href | Verdict |
|------|-------|------|---------|
| Primary 1 | Browse | `/` | **KEEP** — it's home |
| Primary 2 | Pulse | `/pulse` | **KEEP** — the heartbeat |
| Primary 3 | Explore | `/explore` | **KEEP** — high value, curated content |
| Primary 4 | Paths | `/paths` | **MERGE INTO EXPLORE** — only 15 paths, doesn't warrant its own top-level slot |
| Primary 5 | Wishlist | `/wishlist` | **KEEP** — unique, ambitious, differentiator |
| Primary 6 | Pantheon | `/pantheon` | **KEEP** — high engagement, personality page |
| Primary 7 | Mission | `/mission` | **DEMOTE TO FOOTER** — you read it once, never again |
| Secondary 1 | Timeline | `/timeline` | **MERGE** — this is a "view mode" of Browse, not a destination |
| Secondary 2 | Atlas | `/atlas` | **MERGE** — same, it's a view mode |
| Secondary 3 | Subjects | `/subjects` | **MERGE** — same |
| Button | Random | (JS) | **KEEP** — delightful, low-cost |

### Recommended new navbar
```
Browse · Pulse · Explore · Wishlist · Pantheon  |  ↯ Random
```

**5 items + 1 button.** Clean, scannable, no wrapping on mobile.

- **Timeline / Atlas / Subjects** become view tabs *inside* the Browse page (they're already conceptually "different ways to look at the same concepts data"). Add a tabbed sub-nav on the homepage below the hero, or on a dedicated `/browse` page.
- **Paths** gets a prominent card/section on `/explore` (it already links there from the homepage). The `/paths` route stays alive, just loses its nav slot.
- **Mission** moves to the footer link row. The `/contribute` page (which currently highlights `nav="mission"`) should also link from the footer.

### Why this matters
Every nav item you add dilutes every other nav item. Right now, a first-time visitor sees 11 options and freezes. With 5 items, the information architecture is instantly legible: *browse the data, see what's trending, go deep, hunt papers, meet the legends.*

---

## PAGE-BY-PAGE AUDIT

### 1. Homepage (`/`) — GRADE: A-

**What works:**
- FallingHero is genuinely stunning. The equation cascade from Babylon to quantum gravity is a mic-drop opening. Reduced motion fallback is handled.
- "Start here" scroll-trap cards are the best conversion layer on the site — high-tension one-liners that make you click.
- Pulse strip bridges to `/pulse` cleanly. The #1 topic gets a headline teaser, the rest get ranked pills.
- Spotlight featured concept rotates and has pull quote + "what if it works" — editorial voice is strong.
- ConceptBrowser at the bottom is the "I'll just browse everything" catch-all.
- Navigation grid (Deep dives / Follow threads / The impossible list / Help map this) is punchy and relabeled for energy.

**Issues:**
- **Homepage is overloaded.** Six distinct sections create a very long scroll. A first-time visitor might not realize the full ConceptBrowser is below the fold. Consider whether the ConceptBrowser should live on its own `/browse` page instead.
- **FallingHero takes the entire viewport.** This is intentional and cinematic, but returning users will scroll past it every single time. Consider a "seen it" cookie that collapses the hero to 30vh on repeat visits, or a skip button.
- **`categoryLabel` is duplicated** between `index.astro` and `pulse.astro`. Should be a shared export from `lib/concepts.ts`.
- **heroLines are hardcoded** with slug fragment matching (`c.slug.includes(h.match)`). If those concept slugs ever change, the hero silently breaks with no error.
- **The "Start here" section only shows spotlight-tier concepts** with `whatIfItWorks`. If editorial data is sparse, this section could be empty with no fallback.
- **Editor's picks section** — "These are real" is a great header but there's no explanation of what "editorial picks" means. New visitors might not understand the curation layer.

**Recommendation:** A- is strong. Main action: consider splitting ConceptBrowser into its own `/browse` page, making the homepage more of a magazine cover.

---

### 2. Pulse (`/pulse`) — GRADE: A

**What works:**
- Bloomberg-terminal-for-space-nerds energy is fully delivered. The PulseBoard leaderboard with expandable rows, momentum bars, and source cards is the best interactive component on the site.
- Time window toggle (inside PulseBoard) lets users switch between 24h/7d/30d views.
- Rising concepts section bridges pulse topics back to the atlas — this is the connective tissue that makes the site feel alive.
- YouTube thumbnails via `img.youtube.com` (no API key needed) add visual richness to source cards.
- Concept resolution map bridges short slugs to full atlas slugs cleanly.

**Issues:**
- **`categoryLabel` duplicated** from homepage (see above).
- **Rising concepts section depends on `relatedConceptSlugs`** matching via `startsWith`. This is fragile — a slug like `solar` would match `solar-sail`, `solar-thermal`, `solar-power`, etc. The comment acknowledges this but it's still a latent bug.
- **No empty state.** If `pulse.json` is stale or empty, the page renders a header with nothing below it. Should show a "data is being refreshed" message.
- **`generatedAt` timestamp** is shown inside PulseBoard but there's no indication of freshness on the page itself. If the data is 2 weeks old, the page still says "Trending now."
- **No link to methodology.** Users might wonder how scores are calculated. A small "How this works" expandable or link to the ingestion logic would build trust.

**Recommendation:** This is the crown jewel. Protect it. Main action: add staleness detection and empty state.

---

### 3. Explore (`/explore`) — GRADE: B+

**What works:**
- Three-tier layout (full / standard / stub) is smart. Full topics get hero treatment, standard topics get cards, stubs get dashed-border "help us build these" invitations.
- Copy is excellent: "The big questions" header, "More frontiers" sub-header, community invitation for stubs.
- Each card shows open questions count + milestones count + media count — gives a sense of depth before clicking.
- Staggered reveal animations add polish.

**Issues:**
- **No search/filter.** With 30+ topics growing, users can't find what they want without scrolling. A simple text filter would help.
- **No indication of which topics are "new" or recently updated.** There's no date-based sorting or "recently added" flag.
- **The first full-tier topic gets `md:col-span-2`** (hero treatment) but there's no editorial control over which topic is the hero — it's just the first item in the array. Should be explicitly curated.
- **Stub topics say "Help build this" but don't link to a contribution mechanism.** They link to the topic page itself (which for a stub is thin). Should link to `/contribute` or a pre-filled GitHub issue.

**Recommendation:** This is where `/paths` should fold in — add a "Reading Paths" section between the topic tiers and the stubs. "Curated journeys" fits naturally here.

---

### 4. Paths (`/paths`) — GRADE: B

**What works:**
- Clean, focused page. Each path card shows title, subtitle, stop count, tags, and step-type preview (colored numbered circles).
- Step type color coding (amber = concept, teal = topic, dim = wishlist) is consistent with the rest of the site.
- Copy is good: "Follow the thread" is the right metaphor.

**Issues:**
- **Not enough content to justify a top-level nav slot.** With ~15 paths, this is a section, not a destination. Visitors will see 15 cards and think "that's it?"
- **No categorization or filtering.** All paths are in one flat list. As the number grows, this needs tags or grouping.
- **Step preview circles** are clever but don't communicate much at a glance — they're just numbered dots with different colors. Most users won't understand the color coding without hovering.
- **No "why should I care" hook.** The page header explains what paths are but doesn't sell them. Compare to Explore's "The big questions" framing — Paths needs similar tension.

**Recommendation:** **Deprecate as a standalone nav item.** Keep the `/paths` route alive but fold the path cards into `/explore` as a distinct section. The reading paths are a complement to deep dives, not a parallel feature.

---

### 5. Wishlist (`/wishlist`) — GRADE: A-

**What works:**
- "The Hunt" framing is brilliant. Turns a boring paper index into an active quest with progress bars, stats, and a timeline visualization.
- WishlistTimeline ("River of Knowledge") is visually striking — 3,800+ years of papers as dots on a river.
- Field progress bars with color coding give a sense of "we're 40% done in physics, 15% in biology."
- Stats section (total targets, unfound, recovered, time span, linked to NASA concepts) is punchy and informative.
- WishlistBrowser has search, sort, and filter. The interactive layer is solid.

**Issues:**
- **The page is very long.** Stats + field progress + timeline + full browser = a lot of scrolling. Consider collapsing the progress bars behind a toggle.
- **"Linked to NASA concepts" stat** uses `connectedIds.length` — this is the number of wishlist entries connected, not the number of concepts. Label could be clearer.
- **No direct contribution mechanism on this page.** "Help us find them" is the promise but there's no paste-a-URL form inline. Users have to navigate to `/contribute` for that. The `/contribute` page's "suggest a paper" action should be surfaced here.
- **The time span math** (`Math.abs(wishlistStats.oldestYear) + wishlistStats.newestYear`) is repeated in 3 places. Should be a computed stat.
- **`displayYear` function** is imported but year display logic is inconsistent — sometimes raw numbers, sometimes `displayYear()`.

**Recommendation:** A- is strong. The "quest" framing is the site's second-best piece of personality after the FallingHero. Main action: add inline contribution CTA.

---

### 6. Pantheon (`/pantheon`) — GRADE: A

**What works:**
- Best personality page on the site. The disclaimer ("Rankings are vibes-based and non-negotiable") sets the tone perfectly.
- Three-tier system with distinct color schemes (amber/blue/purple) creates visual hierarchy and makes scrolling through 60+ scientists feel organized.
- Each card is information-dense but scannable: portrait, name, lifespan, nationality, field tags, signature equation, tagline, quote, collapsible power moves, fun fact, rivalries, media links.
- YouTube thumbnails inline with media links.
- Footer quote ("It's giants all the way down") is chef's kiss.
- Individual profile pages (`/pantheon/:slug`) are magazine-quality with influence web, prev/next navigation, and tier-mates.

**Issues:**
- **The gallery page is MASSIVE.** 60+ full cards with portraits, quotes, power moves, fun facts, and media links. This is a lot of DOM. Consider lazy-loading cards below the fold or paginating by tier.
- **Portrait images** (`t.image`) — where are these hosted? If they're external URLs, they'll fail silently if the source goes down. No fallback/placeholder image.
- **`tierAccent` and `tierTextColor` are duplicated** between `pantheon.astro` and `pantheon/[slug].astro`. Should be a shared constant.
- **No search.** "Where's Feynman?" requires scrolling through 60+ cards. A simple name filter at the top would be high-value.
- **Stats bar** shows "oldest birth year" which is a weird stat. Maybe "centuries spanned" or "earliest: X BCE" would be more interesting.
- **Rivalries section** on the gallery page shows rivalry text as pills, but some rivalries are full sentences that overflow the pill design.

**Recommendation:** A is deserved. This page has the most personality on the site. Main action: add search/filter, lazy-load images.

---

### 7. Mission (`/mission`) — GRADE: B-

**What works:**
- The writing is genuinely good. "NASA's website is old and clunky. arXiv is a firehose. Wikipedia is flat." — this is the kind of copy that makes people care.
- The five "how to contribute" cards are well-structured with numbered steps and clear descriptions.
- The closing Asimov quote lands.

**Issues:**
- **This page doesn't need a top-level nav slot.** It's a "read once" page. After the first visit, nobody clicks Mission again. It belongs in the footer.
- **It duplicates `/contribute`.** The mission page has a "How to contribute" section with 5 steps. The `/contribute` page has 5 concrete actions. These should be one thing, not two.
- **No stats are dynamic** except `stats.totalConcepts` and `allTopics.length`. The roadmap section ("Where we're going") is entirely static text that will go stale.
- **No social proof.** Contributors, GitHub stars, recent activity — anything that shows this project is alive and has momentum.
- **CTA at the bottom** is just a plain "View the project on GitHub →" link. Underwhelming for the closing moment.

**Recommendation:** **Demote to footer link.** Merge the "How to contribute" section into `/contribute` (which is the action-oriented version). Mission becomes the "about" page you find in the footer, not a primary destination.

---

### 8. Contribute (`/contribute`) — GRADE: B+

**What works:**
- Pre-filled GitHub issue links are smart and low-friction. Every action opens a ready-to-submit issue.
- The concept chips for "Tag a phase" make the problem tangible — you can see the 20 concepts that need help.
- Action variety (tag phases, write payoff lines, suggest papers, recommend media, write code) gives different skill levels something to do.

**Issues:**
- **This page uses `nav="mission"` in the layout** — it highlights "Mission" in the nav, not a separate item. This is correct (it shouldn't be in the nav) but it means there's no way to navigate directly to `/contribute` from the nav. It's only linked from the homepage grid ("Help map this") and the mission page.
- **The page is discoverable only if you already know it exists.** It should be linked from the footer and from relevant pages (Wishlist should link to the "suggest a paper" action, Explore should link to "help build this" for stubs).
- **20-concept limit** on the phase tagging chips is arbitrary. Should be configurable or show a "show all" toggle.
- **No indication of impact.** "Your contribution will..." framing would help. How many issues have been resolved? How many people have contributed?

**Recommendation:** Keep as a utility page. Improve discoverability by linking from relevant pages and footer.

---

### 9. Timeline (`/timeline`) — GRADE: C+

**What works:**
- The concept is right — seeing 2000+ concepts plotted by year reveals patterns in NIAC funding.
- Color-coded by funding phase is useful.
- The description is well-written: "The shape of the chart is the rhythm of NIAC itself."

**Issues:**
- **This is the thinnest page on the site.** A 4-line header and a single React component. No context, no narrative, no editorial voice. Compare to every other page which has sections, stats, and editorial copy.
- **No interactivity described.** Can you click dots? Filter by phase? Zoom? The description doesn't tell you what to do with this visualization.
- **No connection to other data.** The timeline shows concepts in isolation. It should link to trending topics, reading paths, or editorial picks to make it feel connected.
- **It's a "view mode" of the concept data, not a destination.** You come here, look at the chart, and... then what? There's no rabbit hole to fall into.

**Recommendation:** **Merge as a view tab on Browse.** This is "concepts, viewed chronologically." It should live alongside the search grid, the force graph, and the subject cloud — all different lenses on the same data.

---

### 10. Atlas (`/atlas`) — GRADE: C+

**What works:**
- Force-directed graph of concepts is visually impressive and interactive (drag, click).
- The description acknowledges it's a placeholder: "placeholder edges from shared keywords + shared PIs · proper embedding-based similarity coming in session 3."

**Issues:**
- **Same as Timeline: too thin.** Header + one component, nothing else.
- **The "placeholder" disclaimer is still there.** If embedding-based edges aren't coming soon, remove the disclaimer — it undermines confidence.
- **No legend.** What do node sizes mean? What do edge colors mean? What clusters are forming?
- **Uses `client:only="react"`** which means zero SSR. The page is blank until React hydrates. This is fine for a viz but bad for perceived performance.
- **No fallback for mobile.** Force-directed graphs are notoriously bad on small screens. Is there a touch-friendly alternative?

**Recommendation:** **Merge as a view tab on Browse.** Same reasoning as Timeline — this is a visualization mode, not a destination.

---

### 11. Subjects (`/subjects`) — GRADE: B-

**What works:**
- Two-part structure (broad categories + keyword cloud) is smart.
- SubjectConstellation (force graph of keyword co-occurrence) is a genuinely novel way to explore the corpus.
- Keywords link to `/?q=<keyword>` which pre-fills the ConceptBrowser search — great UX.
- Font scaling by frequency makes the keyword cloud scannable.

**Issues:**
- **Same thinness problem as Timeline/Atlas** but slightly better because it has three sections (categories, constellation, cloud).
- **The constellation graph uses `client:only="react"`** — same blank-until-hydration issue.
- **200-keyword limit** is hardcoded. Fine for now but should be acknowledged.
- **No explanation of what co-occurrence means** in the constellation. "Proximity = co-occurrence" is in the eyebrow but most users won't understand without more context.
- **Subject categories link to `/?q=<label>`** which triggers a text search. This works but is fragile — if the ConceptBrowser's search doesn't match subject labels exactly, results will be wrong.

**Recommendation:** **Merge as a view tab on Browse.** The keyword constellation could be a powerful discovery tool if it's embedded alongside the main browser.

---

### 12. Concept Detail (`/concept/[slug]`) — GRADE: A-

**What works:**
- Magazine-style layout with clear information hierarchy: header → pulse indicator → what-if-it-works → pull quote → abstract + sidebar → historical roots → reading paths → neighborhood graph.
- Pulse integration is seamless — if a concept's related topic is trending, you see a "Live" indicator with score and direction.
- Historical roots (from connections.json) add scholarly depth.
- Reading paths section shows which curated journeys this concept appears in.
- Neighborhood graph + related concepts list gives you two ways to explore laterally.
- Sidebar has team, subjects, keywords, and source links (including PDF downloads).

**Issues:**
- **No "What if it works" fallback.** Concepts without editorial overlay get a pull quote and abstract but no hook. The page feels flat without the payoff line.
- **Pull quote extraction** (`pullQuote(concept.abstract)`) is algorithmic — it grabs the first sentence. Sometimes this is great, sometimes it's a boring methodological statement.
- **Abstract is rendered as plain text paragraphs.** No formatting, no emphasis, no figures. For long abstracts, this is a wall of text.
- **The sidebar is 240px fixed width.** On narrow desktop screens (768-1024px), this squeezes the abstract column uncomfortably.
- **Keywords are capped at 16** with no indication there are more. Should show "and X more" if truncated.
- **Breadcrumb says "← Back to atlas"** which is confusing — the nav calls it "Browse." Use consistent terminology.

**Recommendation:** A- is strong. This is the most-visited page type (2000+ instances). Main action: improve the no-editorial fallback.

---

### 13. Topic Detail (`/topic/[slug]`) — GRADE: A

**What works:**
- The richest content pages on the site. Overview, open questions, misconceptions, unsolved problems, thought experiments, historical timeline, curated media, related concepts, related topics — every section adds value.
- Misconceptions section (✗ claim / ✓ reality) is brilliant and shareable.
- Unsolved problems with status badges (open/partial/resolved) and progress milestones feel like a research tracker.
- Thought experiments with "modern status" give historical context depth.
- Historical timeline with vertical line + dots is clean and scannable.
- Curated media with source + type + note is what "go deeper" should look like.
- Related concepts bridge back to the atlas with search links.

**Issues:**
- **Content quality varies by topic.** Full-tier topics are incredible. Stub-tier topics have thin overviews and maybe one or two sections. The page template is the same for both, which means stubs look empty.
- **No "contribute to this topic" CTA.** If a topic is thin, there should be an invitation to help flesh it out — especially for stubs.
- **`topic.misconceptions?.length > 0`** uses optional chaining, meaning the data schema isn't guaranteed. Some topics might not have this field at all.
- **Media section** doesn't distinguish between free and paywalled resources. A book recommendation that costs $40 should be flagged differently than a free YouTube video.

**Recommendation:** A is deserved for the best topics. Main action: add stub-specific CTAs and contribute links.

---

### 14. Path Detail (`/path/[slug]`) — GRADE: B+

**What works:**
- Metro-map vertical layout with numbered stops, connector line, and type-colored circles is excellent navigation design.
- Each step has narration → optional pull quote → reference card with CTA. The narration is the editorial glue that makes paths feel curated, not algorithmic.
- Reference cards resolve to concepts, topics, or wishlist entries with type-appropriate labels and colors.
- Related paths section at the bottom keeps the rabbit hole going.

**Issues:**
- **No progress indicator.** You can't tell how far through the path you are without scrolling. A sticky mini-progress bar or step dots in the sidebar would help.
- **No "complete path" state.** After reading all steps, there's an outro and related paths but no sense of accomplishment. A small reward moment ("You've traced 400 years of optics") would be delightful.
- **Tags on the header** are unstyled pills that don't do anything on click. They should link to a filtered view of paths by tag.
- **Long paths (10+ steps)** become tedious to scroll. Consider a condensed mode or table of contents.
- **`resolveStep()` can return null** if the referenced concept/topic/wishlist entry doesn't exist. The page handles this (conditional `{resolved && ...}`) but a broken step shows narration with no card — confusing.

**Recommendation:** B+ is fair. The content model is right but the UX needs polish for longer paths.

---

### 15. Pantheon Detail (`/pantheon/[slug]`) — GRADE: A

**What works:**
- Magazine-quality profile pages. Portrait with tier badge, name at 7xl, signature equation as a typographic moment, field badges — the hero section is premium.
- Influence web ("Stood on their shoulders" / "Shoulders for others") is navigable with links to other titan pages. This creates a browsing loop.
- Power moves are fully expanded (not collapsible like on the gallery page) — appropriate for a detail page.
- YouTube media section with thumbnail previews and hover play buttons.
- Prev/next navigation at the bottom enables linear browsing through the tier.
- "More from this tier" section shows same-tier scientists.

**Issues:**
- **`tierAccent` and `tierTextColor` are duplicated** from the gallery page. Extract to shared constants.
- **No "back to top" or section navigation.** Long profiles require a lot of scrolling.
- **Portrait images** have no fallback if the URL 404s. A placeholder silhouette would prevent broken layouts.
- **Beefs & Rivalries** are plain text blocks. Some are long sentences that would benefit from formatting (who vs. who, what the beef was about).
- **No connection to the atlas.** A scientist's work might relate to specific NIAC concepts. The Pantheon data has no link to concepts — this is a missed connection.

**Recommendation:** A is deserved. Best personality per page on the site.

---

## DEPRECATION RECOMMENDATIONS

### Kill list (remove from nav, keep route alive)

| Page | Action | Why |
|------|--------|-----|
| `/mission` | **Move to footer** | Read-once page. Nobody returns to "about." |
| `/paths` | **Fold into /explore** | Not enough content for top-level nav. Paths complement deep dives. |
| `/timeline` | **Merge into Browse** | View mode of concept data, not a destination. |
| `/atlas` | **Merge into Browse** | View mode of concept data, not a destination. |
| `/subjects` | **Merge into Browse** | View mode of concept data, not a destination. |

### Pages that should NOT be deprecated
- `/` (Browse) — the front door
- `/pulse` — the heartbeat
- `/explore` — the deep content
- `/wishlist` — the quest
- `/pantheon` — the personality
- `/contribute` — the action page (keep as utility, improve discoverability)

---

## CROSS-CUTTING ISSUES

### Code duplication
1. **`categoryLabel`** is defined identically in `index.astro` and `pulse.astro`. Move to `lib/concepts.ts`.
2. **`tierAccent` and `tierTextColor`** are defined identically in `pantheon.astro` and `pantheon/[slug].astro`. Move to `lib/pantheon.ts`.
3. **Time span calculation** (`Math.abs(oldestYear) + newestYear`) is repeated in `wishlist.astro` and `contribute.astro`. Compute once in `lib/wishlist.ts`.

### Missing empty states
- `/pulse` has no empty state if `pulse.json` is stale/empty
- `/explore` has no fallback if topic tiers are empty
- `/paths` renders an empty grid if no reading paths exist
- Homepage "Start here" section is empty if no spotlight-tier concepts have `whatIfItWorks`

### Accessibility
- **FallingHero** has proper `aria-hidden` on decorative elements and a `prefers-reduced-motion` fallback. Good.
- **Atlas and SubjectConstellation** use `client:only="react"` — no SSR means no content for screen readers until JS loads. Should have a `<noscript>` fallback or at minimum a loading skeleton.
- **Color-only indicators** (green/red/amber for pulse direction) — add text labels for colorblind users. The arrows (▲/▼) help but are tiny.
- **No skip-to-content link** in the BaseLayout. With 11 nav items, keyboard users have to tab through a lot.

### Performance
- **`allSlugs`** is injected into every page via BaseLayout's inline script (for the Random button). That's 2000+ strings serialized into every HTML page. Consider a client-side fetch or a smaller dataset.
- **Pantheon gallery** renders 60+ cards with images, quotes, power moves, fun facts — massive DOM. Lazy-load below-fold cards.
- **ConceptBrowser** receives `allConcepts` (2000+ objects) as a prop via `client:load`. This is serialized into the HTML. Consider a client-side fetch from a static JSON endpoint.

### SEO / Meta
- **No Open Graph tags.** Pages won't preview well when shared on Twitter/LinkedIn/Discord.
- **No canonical URLs.** Important for a site with 2000+ concept pages.
- **No sitemap.** Astro can generate one with `@astrojs/sitemap`.
- **Favicon is an inline SVG data URI** (🛰 emoji). Works but looks different across browsers/OS. Consider a proper `.ico` or `.png`.

### Design consistency
- **Some pages use `hero-line` animation** (Pulse, Pantheon) while others use `reveal` (most others). The homepage uses neither for the hero. Inconsistent entrance choreography.
- **The `hero-glow` class** is used on the homepage spotlight, the topic detail header, and the path detail header — but not on the Pulse or Pantheon headers. Apply consistently to all feature headers.

---

## PRIORITY ACTIONS (if I had to pick 5)

1. **Crunch the navbar to 5 items.** The single highest-impact UX improvement. Do this first.
2. **Merge Timeline/Atlas/Subjects into a Browse page** with view tabs. Removes 3 thin pages, strengthens 1 page.
3. **Add Open Graph meta tags** to BaseLayout. Every page shared on social media currently has no preview image or description.
4. **Fold Paths into Explore** and demote Mission to footer. Simplifies the site map.
5. **Add search to Pantheon.** 60+ scientists with no filter is a usability problem.

---

*Audit conducted 2026-04-10. Read every .astro page, every component, the layout, and the global CSS.*
