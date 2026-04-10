/**
 * Fetch trending data from Reddit + Hacker News for topics in the atlas,
 * compute trending scores, and write data/pulse.json.
 *
 * Run with:  node --experimental-strip-types ingestion/fetch-pulse.ts
 *
 * Strategy:
 *   1. Define a keyword map that bridges atlas concepts/topics to search terms
 *      real people use on Reddit and HN.
 *   2. Hit the public Reddit JSON endpoints (no auth needed) and the free
 *      Algolia-powered HN Search API.
 *   3. Score each topic by total engagement, compute deltas where possible,
 *      attach the best sources, and write a static JSON file the web app
 *      can consume at build time.
 *
 * No API keys required — both Reddit (.json suffix) and HN (hn.algolia.com)
 * are public.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const OUT_FILE = join(DATA_DIR, "pulse.json");
const PREV_FILE = join(DATA_DIR, "pulse-prev.json");

/* -------------------------------------------------------------------------- */
/* Topic keyword map                                                          */
/* -------------------------------------------------------------------------- */
/* Each entry maps a human-readable topic label to a set of search terms.     */
/* The slug is derived from the label. Terms are OR'd when searching.         */

interface TopicDef {
  label: string;
  slug: string;
  terms: string[];
  /** Slugs of related NIAC concepts — links the pulse back to the atlas */
  conceptSlugs: string[];
}

const TOPICS: TopicDef[] = [
  // --- High-traffic topics (these actually trend on Reddit/HN) ---
  {
    label: "Starship & SpaceX",
    slug: "starship",
    terms: ["starship", "spacex", "falcon 9", "raptor engine", "super heavy", "falcon heavy"],
    conceptSlugs: ["extraterrestrial-regolith-derived-atmospheric-entry-heat-shields", "phase-i-final-report-nasa-institute-for-advanced-concepts-combined-heat-shield-a"],
  },
  {
    label: "Exoplanets",
    slug: "exoplanets",
    terms: ["exoplanet", "habitable zone", "habitable world", "earth-like planet", "super-earth", "exomoon", "TRAPPIST"],
    conceptSlugs: ["fluidic-telescope", "orbiting-rainbows"],
  },
  {
    label: "Black Holes",
    slug: "black-holes",
    terms: ["black hole", "event horizon", "hawking radiation", "singularity physics"],
    conceptSlugs: ["direct-multipixel-imaging-and-spectroscopy-of-an-exoplanet-with-a-solar-gravity", "gravity-observation-and-dark-energy-detection-explorer"],
  },
  {
    label: "Dark Matter & Dark Energy",
    slug: "dark-matter",
    terms: ["dark matter", "dark energy", "WIMP", "dark sector", "cosmological constant"],
    conceptSlugs: ["gravity-observation-and-dark-energy-detection-explorer", "direct-probe-of-dark-energy-interactions"],
  },
  {
    label: "Gravitational Waves",
    slug: "gravitational-waves",
    terms: ["gravitational wave", "LIGO", "gravitational-wave", "neutron star merger", "LISA mission"],
    conceptSlugs: ["atom-interferometry-for-detection-of-gravitational-waves"],
  },
  {
    label: "Space Telescopes",
    slug: "space-telescopes",
    terms: ["space telescope", "JWST", "james webb", "hubble", "LUVOIR", "habitable exoplanet observatory", "webb telescope"],
    conceptSlugs: ["fluidic-telescope", "orbiting-rainbows"],
  },
  {
    label: "Artemis & Lunar Return",
    slug: "artemis",
    terms: ["artemis moon", "artemis nasa", "artemis mission", "artemis program", "moon landing", "lunar lander", "gateway station", "moon base", "lunar habitat", "lunar colony", "moon habitat", "lunar return"],
    conceptSlugs: ["mycotecture", "regolith-adaptive-modification-systems"],
  },
  {
    label: "Mars Exploration",
    slug: "mars",
    terms: ["mars rover", "mars colony", "mars colonization", "mars habitat", "mars settlement", "perseverance", "ingenuity helicopter", "mars sample return", "mars base"],
    conceptSlugs: ["mycotecture", "breathing-mars-air", "evacuated-airship-for-mars-missions", "marsbee"],
  },
  {
    label: "Astrobiology",
    slug: "astrobiology",
    terms: ["astrobiology", "alien life", "biosignature", "extraterrestrial life", "life detection", "enceladus life", "europa life"],
    conceptSlugs: ["astropharmacy", "venus-atmosphere-and-cloud-particle-sample-return-for-astrobiology"],
  },
  {
    label: "Starlink & Satellite Internet",
    slug: "starlink",
    terms: ["starlink", "satellite internet", "satellite constellation", "kuiper"],
    conceptSlugs: ["sps-alpha"],
  },
  {
    label: "Solar Sails",
    slug: "solar-sails",
    terms: ["solar sail", "light sail", "lightsail", "solar sailing"],
    conceptSlugs: ["extreme-metamaterial-solar-sails", "solar-surfing"],
  },
  {
    label: "Fusion Propulsion",
    slug: "fusion-propulsion",
    terms: ["fusion propulsion", "fusion rocket", "fusion drive", "fusion engine", "fusion energy", "fusion reactor", "tokamak", "ITER"],
    conceptSlugs: ["gradient-field-imploding-liner-fusion-propulsion", "fusion-enabled-pluto-orbiter", "pulsed-fission-fusion"],
  },
  {
    label: "Space Debris",
    slug: "space-debris",
    terms: ["space debris", "orbital debris", "space junk", "kessler syndrome", "debris removal"],
    conceptSlugs: ["niac-phase-i-final-report-on-orbit-collision"],
  },
  {
    label: "Nuclear Propulsion",
    slug: "nuclear-thermal",
    terms: ["nuclear thermal propulsion", "nuclear rocket", "nuclear propulsion", "radioisotope", "nuclear thermal rocket"],
    conceptSlugs: ["lattice-confinement-fusion", "pulsed-fission-fusion", "direct-energy-conversion-for-nuclear-propulsion"],
  },
  {
    label: "Interstellar Travel",
    slug: "interstellar-travel",
    terms: ["interstellar travel", "interstellar probe", "breakthrough starshot", "interstellar mission", "voyager probe"],
    conceptSlugs: ["procsima", "dynamic-orbital-slingshot", "solar-system-escape-architecture"],
  },
  {
    label: "Asteroid Mining",
    slug: "asteroid-mining",
    terms: ["asteroid mining", "space mining", "asteroid resources", "asteroid redirect", "asteroid defense", "planetary defense"],
    conceptSlugs: ["project-rama", "gravity-poppers"],
  },
  {
    label: "Space Elevators",
    slug: "space-elevators",
    terms: ["space elevator", "orbital tether", "space tether"],
    conceptSlugs: ["technology-development-and-demonstration-concepts-for-the-space-elevator", "phase-1-study-for-the-phobos-l1-operational-tether-experiment-phlote"],
  },
  {
    label: "Titan & Ocean Worlds",
    slug: "ocean-worlds",
    terms: ["titan submarine", "titan exploration", "europa ocean", "enceladus ocean", "ocean world", "europa clipper"],
    conceptSlugs: ["titan-submarine"],
  },
  {
    label: "Quantum Communication",
    slug: "quantum-comms",
    terms: ["quantum communication", "quantum internet", "quantum entanglement communication", "quantum key distribution"],
    conceptSlugs: ["magneto-inductive-communications-for-ocean-worlds"],
  },
  {
    label: "Warp Drives & Exotic Physics",
    slug: "warp-drives",
    terms: ["warp drive", "alcubierre drive", "warp bubble", "FTL", "faster than light"],
    conceptSlugs: ["procsima", "extreme-metamaterial-solar-sails-for-breakthrough-space-exploration"],
  },
  {
    label: "Electric Propulsion",
    slug: "electric-propulsion",
    terms: ["ion thruster", "hall thruster", "electric propulsion", "ion drive", "plasma thruster"],
    conceptSlugs: ["electric-sail-propulsion", "e-glider", "nasa-innovative-advanced-concepts-niac-heliopause-electrostatic-rapid-transit-sy"],
  },
  {
    label: "Dyson Spheres",
    slug: "dyson-spheres",
    terms: ["dyson sphere", "dyson swarm", "megastructure", "kardashev"],
    conceptSlugs: ["sps-alpha"],
  },
  {
    label: "Space Solar Power",
    slug: "space-solar-power",
    terms: ["space solar power", "space-based solar", "solar power satellite", "beamed power"],
    conceptSlugs: ["sps-alpha", "the-light-bender-concept-for-power-distribution"],
  },
  {
    label: "AI in Space",
    slug: "ai-space",
    terms: ["AI space", "machine learning astronomy", "AI satellite", "autonomous spacecraft", "AI telescope"],
    conceptSlugs: ["starnav", "an-automaton-rover-enabling-long-duration"],
  },
];

/* -------------------------------------------------------------------------- */
/* Reddit fetcher                                                             */
/* -------------------------------------------------------------------------- */

const SUBREDDITS = [
  "space", "spacex", "nasa", "futurology", "physics",
  "aerospace", "science", "engineering", "spaceflight",
  "astrophysics", "cosmology",
  // Niche subs to fill quiet topics
  "solarsystem", "mars", "astrobiology", "BlueOrigin",
  "SpaceXLounge", "nuclearpower", "quantumcomputing",
  "IsaacArthur", "fusion",
];

interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  subreddit: string;
  author: string;
  created_utc: number;
}

async function fetchRedditSubreddit(
  subreddit: string,
  timeframe: "day" | "week" | "month" = "week",
): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top.json?t=${timeframe}&limit=100`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "niac-atlas-pulse/0.1 (research project)" },
    });
    if (!res.ok) {
      console.warn(`  ! Reddit r/${subreddit}: ${res.status}`);
      return [];
    }
    const json = (await res.json()) as any;
    return (json.data?.children ?? []).map((c: any) => ({
      title: c.data.title,
      url: c.data.url,
      permalink: `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
      num_comments: c.data.num_comments,
      subreddit: c.data.subreddit,
      author: c.data.author,
      created_utc: c.data.created_utc,
    }));
  } catch (err) {
    console.warn(`  ! Reddit r/${subreddit}: ${(err as Error).message}`);
    return [];
  }
}

async function fetchAllReddit(
  timeframe: "day" | "week" | "month" = "week",
): Promise<RedditPost[]> {
  console.log(`→ fetching Reddit top posts (${timeframe})...`);
  const all: RedditPost[] = [];
  // Fetch sequentially to be respectful of Reddit rate limits
  for (const sub of SUBREDDITS) {
    const posts = await fetchRedditSubreddit(sub, timeframe);
    all.push(...posts);
    console.log(`  r/${sub}: ${posts.length} posts`);
    // Small delay to avoid rate-limiting
    await sleep(1200);
  }
  console.log(`  total: ${all.length} Reddit posts`);
  return all;
}

/* -------------------------------------------------------------------------- */
/* Hacker News fetcher                                                        */
/* -------------------------------------------------------------------------- */

interface HNHit {
  title: string;
  url: string | null;
  objectID: string;
  points: number;
  num_comments: number;
  author: string;
  created_at_i: number;
}

async function searchHN(query: string, lookbackDays = 7): Promise<HNHit[]> {
  const params = new URLSearchParams({
    query,
    tags: "story",
    restrictSearchableAttributes: "title",
    numericFilters: `created_at_i>${Math.floor(Date.now() / 1000) - lookbackDays * 86400}`,
    hitsPerPage: "50",
  });
  const url = `https://hn.algolia.com/api/v1/search?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    return (json.hits ?? []).map((h: any) => ({
      title: h.title,
      url: h.url,
      objectID: h.objectID,
      points: h.points ?? 0,
      num_comments: h.num_comments ?? 0,
      author: h.author,
      created_at_i: h.created_at_i,
    }));
  } catch {
    return [];
  }
}

/**
 * Filter HN hits to only those whose title actually matches at least one
 * of the topic's search terms.  The Algolia API searches full text, which
 * returns a huge number of false positives (e.g. "black hole" matching
 * any post whose *body* mentions "black hole" in passing).
 */
function filterHNByTitle(hits: HNHit[], terms: string[]): HNHit[] {
  const patterns = terms.map(
    (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  );
  return hits.filter((h) => patterns.some((pat) => pat.test(h.title)));
}

async function fetchAllHN(topics: TopicDef[], lookbackDays = 7): Promise<Map<string, HNHit[]>> {
  console.log(`→ fetching Hacker News (${lookbackDays}d)...`);
  const map = new Map<string, HNHit[]>();
  for (const topic of topics) {
    // Search up to 3 terms per topic to catch more coverage
    const termsToSearch = topic.terms.slice(0, 3);
    const seen = new Set<string>();
    const allHits: HNHit[] = [];

    for (const term of termsToSearch) {
      const raw = await searchHN(term, lookbackDays);
      const hits = filterHNByTitle(raw, topic.terms);
      for (const h of hits) {
        if (!seen.has(h.objectID)) {
          seen.add(h.objectID);
          allHits.push(h);
        }
      }
      await sleep(300);
    }

    if (allHits.length > 0) {
      map.set(topic.slug, allHits);
      console.log(`  HN "${topic.slug}": ${allHits.length} hits from ${termsToSearch.length} terms`);
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Matching + scoring                                                         */
/* -------------------------------------------------------------------------- */

interface PulseSource {
  platform: "reddit" | "hackernews" | "youtube";
  title: string;
  url: string;
  score: number;
  author?: string;
  subreddit?: string;
  thumbnail?: string;
  commentCount?: number;
  publishedAt: string;
}

/**
 * Extract a YouTube video ID from a URL. Works with:
 *   youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 * Returns null if not a YouTube URL.
 */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1) || null;
    }
  } catch {}
  return null;
}

/** Free YouTube thumbnail — no API key needed. */
function youtubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

interface PulseTopic {
  slug: string;
  label: string;
  score: number;
  delta: number;
  direction: "up" | "down" | "steady";
  mentions: number;
  sources: PulseSource[];
  relatedConceptSlugs: string[];
}

function matchRedditPosts(
  topic: TopicDef,
  allPosts: RedditPost[],
): { posts: RedditPost[]; score: number } {
  const patterns = topic.terms.map(
    (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  );
  const matched = allPosts.filter((p) =>
    patterns.some((pat) => pat.test(p.title)),
  );
  const score = matched.reduce((sum, p) => sum + p.score, 0);
  return { posts: matched, score };
}

/**
 * Compute intra-window momentum: compare engagement in the recent half
 * (last 3 days) vs the older half (prior 4 days) of the 7-day window.
 * This gives meaningful deltas on every single run — no previous data needed.
 */
function computeIntraWindowDelta(
  sources: { score: number; publishedAt: string }[],
): { delta: number; direction: "up" | "down" | "steady" } {
  const now = Date.now();
  const recentCutoff = now - 3 * 86400000; // 3 days ago

  let recentScore = 0;
  let olderScore = 0;

  for (const s of sources) {
    const ts = new Date(s.publishedAt).getTime();
    if (ts >= recentCutoff) {
      recentScore += s.score;
    } else {
      olderScore += s.score;
    }
  }

  // Normalize: recent is 3 days, older is 4 days → scale older to 3-day equivalent
  const olderNormalized = olderScore * (3 / 4);

  if (olderNormalized === 0 && recentScore === 0) {
    return { delta: 0, direction: "steady" };
  }
  if (olderNormalized === 0) {
    // All activity is recent — strong uptrend
    return { delta: 200, direction: "up" };
  }

  const delta = Math.round(((recentScore - olderNormalized) / olderNormalized) * 100);
  const direction = delta > 15 ? "up" : delta < -15 ? "down" : "steady";
  return { delta, direction };
}

function scoreTopic(
  topic: TopicDef,
  redditPosts: RedditPost[],
  hnHits: HNHit[],
): PulseTopic {
  const reddit = matchRedditPosts(topic, redditPosts);
  const hn = hnHits;

  const redditScore = reddit.score;
  const hnScore = hn.reduce((sum, h) => sum + h.points, 0) * 1.5;
  const totalScore = Math.round(redditScore + hnScore);
  const mentions = reddit.posts.length + hn.length;

  // Build sources list, sorted by score, top 10.
  // Reddit posts that link to YouTube get split into a YouTube source
  // (with thumbnail) AND the Reddit discussion source.
  const redditSources: PulseSource[] = [];
  for (const p of reddit.posts) {
    const ytId = extractYouTubeId(p.url);
    if (ytId) {
      redditSources.push({
        platform: "youtube",
        title: p.title,
        url: p.url,
        score: p.score,
        thumbnail: youtubeThumbnail(ytId),
        publishedAt: new Date(p.created_utc * 1000).toISOString(),
      });
    }
    redditSources.push({
      platform: "reddit",
      title: p.title,
      url: p.permalink,
      score: p.score,
      author: p.author,
      subreddit: p.subreddit,
      commentCount: p.num_comments,
      publishedAt: new Date(p.created_utc * 1000).toISOString(),
    });
  }

  const hnSources: PulseSource[] = [];
  for (const h of hn) {
    const hnUrl = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
    const ytId = h.url ? extractYouTubeId(h.url) : null;
    if (ytId) {
      hnSources.push({
        platform: "youtube",
        title: h.title,
        url: h.url!,
        score: h.points,
        thumbnail: youtubeThumbnail(ytId),
        publishedAt: new Date(h.created_at_i * 1000).toISOString(),
      });
    }
    hnSources.push({
      platform: "hackernews",
      title: h.title,
      url: hnUrl,
      score: h.points,
      author: h.author,
      commentCount: h.num_comments,
      publishedAt: new Date(h.created_at_i * 1000).toISOString(),
    });
  }

  const sources = [...redditSources, ...hnSources]
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // Compute momentum from source timestamps — no previous run needed
  const { delta, direction } = computeIntraWindowDelta(sources);

  return {
    slug: topic.slug,
    label: topic.label,
    score: totalScore,
    delta,
    direction,
    mentions,
    sources,
    relatedConceptSlugs: topic.conceptSlugs,
  };
}

/* -------------------------------------------------------------------------- */
/* Delta computation                                                          */
/* -------------------------------------------------------------------------- */

async function loadPreviousPulse(): Promise<Map<string, number> | null> {
  try {
    const raw = await readFile(PREV_FILE, "utf-8");
    const data = JSON.parse(raw) as { topics: PulseTopic[] };
    const map = new Map<string, number>();
    for (const t of data.topics) map.set(t.slug, t.score);
    return map;
  } catch {
    return null;
  }
}

/**
 * Layer cross-run deltas on top of intra-window deltas when previous data
 * is available. The cross-run delta takes precedence since it compares
 * distinct time periods.
 */
function computeDeltas(
  topics: PulseTopic[],
  prev: Map<string, number> | null,
): void {
  if (!prev) return;
  for (const t of topics) {
    const prevScore = prev.get(t.slug);
    if (prevScore && prevScore > 0) {
      const crossDelta = Math.round(((t.score - prevScore) / prevScore) * 100);
      t.delta = crossDelta;
      t.direction = crossDelta > 15 ? "up" : crossDelta < -15 ? "down" : "steady";
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/* Backdate: bucket posts into weekly snapshots                              */
/* -------------------------------------------------------------------------- */

function buildWeeklySnapshot(
  weekStart: number,
  weekEnd: number,
  allReddit: RedditPost[],
  allHN: Map<string, HNHit[]>,
): { generatedAt: string; topics: PulseTopic[] } {
  // Filter Reddit posts to this week
  const weekReddit = allReddit.filter((p) => {
    const ts = p.created_utc * 1000;
    return ts >= weekStart && ts < weekEnd;
  });

  // Filter HN hits to this week
  const weekHN = new Map<string, HNHit[]>();
  for (const [slug, hits] of allHN) {
    const filtered = hits.filter((h) => {
      const ts = h.created_at_i * 1000;
      return ts >= weekStart && ts < weekEnd;
    });
    if (filtered.length > 0) weekHN.set(slug, filtered);
  }

  const topics = TOPICS.map((topic) =>
    scoreTopic(topic, weekReddit, weekHN.get(topic.slug) ?? []),
  )
    .filter((t) => t.mentions > 0 || t.score > 0)
    .sort((a, b) => b.score - a.score);

  // Include quiet topics
  const scoredSlugs = new Set(topics.map((t) => t.slug));
  for (const def of TOPICS) {
    if (!scoredSlugs.has(def.slug)) {
      topics.push({
        slug: def.slug,
        label: def.label,
        score: 0,
        delta: 0,
        direction: "steady",
        mentions: 0,
        sources: [],
        relatedConceptSlugs: def.conceptSlugs,
      });
    }
  }

  return { generatedAt: new Date(weekEnd).toISOString(), topics };
}

async function mainBackdate(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const WEEKS = 4;
  console.log(`\n⏪ BACKDATING — fetching ${WEEKS} weeks of data\n`);

  // Fetch a full month of data in one pass
  const [redditPosts, hnMap] = await Promise.all([
    fetchAllReddit("month"),
    fetchAllHN(TOPICS, 30),
  ]);

  console.log(`\n→ bucketing into ${WEEKS} weekly snapshots...`);

  const now = Date.now();
  const weekMs = 7 * 86400000;
  const snapshots: { file: string; date: string; active: number }[] = [];

  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekEnd = now - w * weekMs;
    const weekStart = weekEnd - weekMs;
    const dateLabel = new Date(weekStart).toISOString().slice(0, 10);

    const snapshot = buildWeeklySnapshot(weekStart, weekEnd, redditPosts, hnMap);
    const active = snapshot.topics.filter((t) => t.mentions > 0).length;

    const outFile = join(DATA_DIR, `pulse-${dateLabel}.json`);
    await writeFile(outFile, JSON.stringify(snapshot, null, 2));
    snapshots.push({ file: outFile, date: dateLabel, active });
  }

  // Compute cross-week deltas for each snapshot
  for (let i = 1; i < snapshots.length; i++) {
    const prevFile = snapshots[i - 1].file;
    const currFile = snapshots[i].file;
    const prev = JSON.parse(await readFile(prevFile, "utf-8")) as { topics: PulseTopic[] };
    const curr = JSON.parse(await readFile(currFile, "utf-8")) as { topics: PulseTopic[] };
    const prevMap = new Map(prev.topics.map((t) => [t.slug, t.score]));
    computeDeltas(curr.topics, prevMap);
    await writeFile(currFile, JSON.stringify({ generatedAt: curr.generatedAt ?? new Date().toISOString(), topics: curr.topics }, null, 2));
  }

  // The most recent week becomes pulse.json (with delta from prior week)
  const latestFile = snapshots[snapshots.length - 1].file;
  const latest = await readFile(latestFile, "utf-8");

  // Save current pulse.json as pulse-prev.json
  try {
    const existing = await readFile(OUT_FILE, "utf-8");
    await writeFile(PREV_FILE, existing);
  } catch {}

  await writeFile(OUT_FILE, latest);

  console.log("\n✓ Backdated snapshots:");
  for (const s of snapshots) {
    console.log(`  ${s.date}  ${s.active} active topics`);
  }
  console.log(`\n✓ Most recent week also written to ${OUT_FILE}`);

  // Print top trending from latest
  const latestData = JSON.parse(latest) as { topics: PulseTopic[] };
  console.log("\nTop trending (this week):");
  for (const t of latestData.topics.slice(0, 8)) {
    const dir = t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "—";
    console.log(
      `  ${dir} ${t.label.padEnd(25)} score: ${String(t.score).padStart(6)}  mentions: ${t.mentions}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

const IS_BACKDATE = process.argv.includes("--backdate");

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const [redditPosts, hnMap, prevScores] = await Promise.all([
    fetchAllReddit(),
    fetchAllHN(TOPICS),
    loadPreviousPulse(),
  ]);

  console.log("→ scoring topics...");
  const topics = TOPICS.map((topic) =>
    scoreTopic(topic, redditPosts, hnMap.get(topic.slug) ?? []),
  )
    .filter((t) => t.mentions > 0 || t.score > 0)
    .sort((a, b) => b.score - a.score);

  computeDeltas(topics, prevScores);

  // Include topics with zero matches too, so the UI can show them as "quiet"
  const scoredSlugs = new Set(topics.map((t) => t.slug));
  for (const def of TOPICS) {
    if (!scoredSlugs.has(def.slug)) {
      topics.push({
        slug: def.slug,
        label: def.label,
        score: 0,
        delta: 0,
        direction: "steady",
        mentions: 0,
        sources: [],
        relatedConceptSlugs: def.conceptSlugs,
      });
    }
  }

  const pulse = {
    generatedAt: new Date().toISOString(),
    topics,
  };

  // Save current as previous for next run's delta computation
  try {
    const existing = await readFile(OUT_FILE, "utf-8");
    await writeFile(PREV_FILE, existing);
  } catch {
    // No previous file — that's fine
  }

  await writeFile(OUT_FILE, JSON.stringify(pulse, null, 2));
  console.log(`\n✓ wrote ${topics.length} topics to ${OUT_FILE}`);
  console.log("\nTop trending:");
  for (const t of topics.slice(0, 8)) {
    const dir = t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "—";
    console.log(
      `  ${dir} ${t.label.padEnd(25)} score: ${String(t.score).padStart(6)}  mentions: ${t.mentions}`,
    );
  }
}

(IS_BACKDATE ? mainBackdate() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
