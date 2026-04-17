/**
 * Fetch trending data from Reddit + Hacker News + ArXiv for topics in the atlas,
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
 * No API keys required — Reddit (.json suffix), HN (hn.algolia.com), and
 * ArXiv (export.arxiv.org) are all public.
 */

import { writeFile, readFile, mkdir, readdir, rename, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const CACHE_DIR = join(DATA_DIR, ".cache");
const ARCHIVE_DIR = join(DATA_DIR, "archive");
const OUT_FILE = join(DATA_DIR, "pulse.json");
const PREV_FILE = join(DATA_DIR, "pulse-prev.json");
const META_FILE = join(DATA_DIR, "pulse-meta.json");

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry a function with exponential backoff. */
async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelay = 1000, label = "" } = {},
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = baseDelay * 2 ** attempt;
      console.warn(`  ↻ retry ${attempt + 1}/${retries} for ${label} in ${delay}ms: ${(err as Error).message}`);
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

/**
 * Run async tasks with a concurrency limit.
 * Returns results in the same order as the input.
 */
async function parallelLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/* -------------------------------------------------------------------------- */
/* Cache layer                                                                 */
/* -------------------------------------------------------------------------- */
/* Caches raw API responses to data/.cache/ with a TTL. Avoids re-fetching    */
/* when the script is re-run within the same day (debugging, manual reruns).  */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(prefix: string, id: string): string {
  return join(CACHE_DIR, `${prefix}_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const info = await stat(key);
    if (Date.now() - info.mtimeMs > CACHE_TTL_MS) return null;
    const raw = await readFile(key, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: unknown): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(key, JSON.stringify(data));
  } catch {
    // Cache write failure is non-fatal
  }
}

/* -------------------------------------------------------------------------- */
/* Health / meta tracking                                                      */
/* -------------------------------------------------------------------------- */

interface PulseMeta {
  lastRun: string;
  redditPostCount: number;
  hnHitCount: number;
  arxivPaperCount: number;
  topicCount: number;
  errors: string[];
  durationMs: number;
}

const runErrors: string[] = [];

function recordError(msg: string) {
  console.warn(`  ! ${msg}`);
  runErrors.push(msg);
}

/* -------------------------------------------------------------------------- */
/* Topic keyword map                                                          */
/* -------------------------------------------------------------------------- */

interface TopicDef {
  label: string;
  slug: string;
  terms: string[];
  /** ArXiv search queries — more academic phrasing for preprint search */
  arxivTerms?: string[];
  /** Slugs of related NIAC concepts — links the pulse back to the atlas */
  conceptSlugs: string[];
}

const TOPICS: TopicDef[] = [
  // --- High-traffic topics (these actually trend on Reddit/HN) ---
  {
    label: "Starship & SpaceX",
    slug: "starship",
    terms: ["starship", "spacex", "falcon 9", "raptor engine", "super heavy", "falcon heavy"],
    arxivTerms: ["reusable launch vehicle", "methane rocket engine"],
    conceptSlugs: ["extraterrestrial-regolith-derived-atmospheric-entry-heat-shields", "phase-i-final-report-nasa-institute-for-advanced-concepts-combined-heat-shield-a"],
  },
  {
    label: "Exoplanets",
    slug: "exoplanets",
    terms: ["exoplanet", "habitable zone", "habitable world", "earth-like planet", "super-earth", "exomoon", "TRAPPIST"],
    arxivTerms: ["exoplanet detection", "habitable zone", "transit spectroscopy", "radial velocity exoplanet"],
    conceptSlugs: ["fluidic-telescope", "orbiting-rainbows"],
  },
  {
    label: "Black Holes",
    slug: "black-holes",
    terms: ["black hole", "event horizon", "hawking radiation", "singularity physics"],
    arxivTerms: ["black hole", "event horizon telescope", "hawking radiation", "supermassive black hole"],
    conceptSlugs: ["direct-multipixel-imaging-and-spectroscopy-of-an-exoplanet-with-a-solar-gravity", "gravity-observation-and-dark-energy-detection-explorer"],
  },
  {
    label: "Dark Matter & Dark Energy",
    slug: "dark-matter",
    terms: ["dark matter", "dark energy", "WIMP", "dark sector", "cosmological constant"],
    arxivTerms: ["dark matter", "dark energy", "WIMP detection", "cosmological constant"],
    conceptSlugs: ["gravity-observation-and-dark-energy-detection-explorer", "direct-probe-of-dark-energy-interactions"],
  },
  {
    label: "Gravitational Waves",
    slug: "gravitational-waves",
    terms: ["gravitational wave", "LIGO", "gravitational-wave", "neutron star merger", "LISA mission"],
    arxivTerms: ["gravitational wave", "LIGO", "neutron star merger", "binary black hole merger"],
    conceptSlugs: ["atom-interferometry-for-detection-of-gravitational-waves"],
  },
  {
    label: "Space Telescopes",
    slug: "space-telescopes",
    terms: ["space telescope", "JWST", "james webb", "hubble", "LUVOIR", "habitable exoplanet observatory", "webb telescope"],
    arxivTerms: ["JWST", "space telescope", "coronagraph", "starshade"],
    conceptSlugs: ["fluidic-telescope", "orbiting-rainbows"],
  },
  {
    label: "Artemis & Lunar Return",
    slug: "artemis",
    terms: ["artemis moon", "artemis nasa", "artemis mission", "artemis program", "moon landing", "lunar lander", "gateway station", "moon base", "lunar habitat", "lunar colony", "moon habitat", "lunar return"],
    arxivTerms: ["lunar regolith", "lunar habitat", "cislunar"],
    conceptSlugs: ["mycotecture", "regolith-adaptive-modification-systems"],
  },
  {
    label: "Mars Exploration",
    slug: "mars",
    terms: ["mars rover", "mars colony", "mars colonization", "mars habitat", "mars settlement", "perseverance", "ingenuity helicopter", "mars sample return", "mars base"],
    arxivTerms: ["mars atmosphere", "mars sample return", "martian regolith"],
    conceptSlugs: ["mycotecture", "breathing-mars-air", "evacuated-airship-for-mars-missions", "marsbee"],
  },
  {
    label: "Astrobiology",
    slug: "astrobiology",
    terms: ["astrobiology", "alien life", "biosignature", "extraterrestrial life", "life detection", "enceladus life", "europa life"],
    arxivTerms: ["astrobiology", "biosignature", "prebiotic chemistry", "origin of life"],
    conceptSlugs: ["astropharmacy", "venus-atmosphere-and-cloud-particle-sample-return-for-astrobiology"],
  },
  {
    label: "Starlink & Satellite Internet",
    slug: "starlink",
    terms: ["starlink", "satellite internet", "satellite constellation", "kuiper"],
    arxivTerms: ["mega-constellation", "satellite constellation interference"],
    conceptSlugs: ["sps-alpha"],
  },
  {
    label: "Solar Sails",
    slug: "solar-sails",
    terms: ["solar sail", "light sail", "lightsail", "solar sailing"],
    arxivTerms: ["solar sail", "radiation pressure propulsion", "light sail"],
    conceptSlugs: ["extreme-metamaterial-solar-sails", "solar-surfing"],
  },
  {
    label: "Fusion Propulsion",
    slug: "fusion-propulsion",
    terms: ["fusion propulsion", "fusion rocket", "fusion drive", "fusion engine", "fusion energy", "fusion reactor", "tokamak", "ITER"],
    arxivTerms: ["fusion propulsion", "inertial confinement fusion", "magnetic confinement fusion", "tokamak"],
    conceptSlugs: ["gradient-field-imploding-liner-fusion-propulsion", "fusion-enabled-pluto-orbiter", "pulsed-fission-fusion"],
  },
  {
    label: "Space Debris",
    slug: "space-debris",
    terms: ["space debris", "orbital debris", "space junk", "kessler syndrome", "debris removal"],
    arxivTerms: ["space debris", "orbital debris", "Kessler syndrome"],
    conceptSlugs: ["niac-phase-i-final-report-on-orbit-collision"],
  },
  {
    label: "Nuclear Propulsion",
    slug: "nuclear-thermal",
    terms: ["nuclear thermal propulsion", "nuclear rocket", "nuclear propulsion", "radioisotope", "nuclear thermal rocket"],
    arxivTerms: ["nuclear thermal propulsion", "radioisotope thermoelectric"],
    conceptSlugs: ["lattice-confinement-fusion", "pulsed-fission-fusion", "direct-energy-conversion-for-nuclear-propulsion"],
  },
  {
    label: "Interstellar Travel",
    slug: "interstellar-travel",
    terms: ["interstellar travel", "interstellar probe", "breakthrough starshot", "interstellar mission", "voyager probe"],
    arxivTerms: ["interstellar probe", "interstellar travel", "laser propulsion spacecraft"],
    conceptSlugs: ["procsima", "dynamic-orbital-slingshot", "solar-system-escape-architecture"],
  },
  {
    label: "Asteroid Mining",
    slug: "asteroid-mining",
    terms: ["asteroid mining", "space mining", "asteroid resources", "asteroid redirect", "asteroid defense", "planetary defense"],
    arxivTerms: ["asteroid mining", "near-earth asteroid", "planetary defense"],
    conceptSlugs: ["project-rama", "gravity-poppers"],
  },
  {
    label: "Space Elevators",
    slug: "space-elevators",
    terms: ["space elevator", "orbital tether", "space tether"],
    arxivTerms: ["space elevator", "carbon nanotube tether"],
    conceptSlugs: ["technology-development-and-demonstration-concepts-for-the-space-elevator", "phase-1-study-for-the-phobos-l1-operational-tether-experiment-phlote"],
  },
  {
    label: "Titan & Ocean Worlds",
    slug: "ocean-worlds",
    terms: ["titan submarine", "titan exploration", "europa ocean", "enceladus ocean", "ocean world", "europa clipper"],
    arxivTerms: ["titan atmosphere", "europa ocean", "enceladus plume", "ocean world habitability"],
    conceptSlugs: ["titan-submarine"],
  },
  {
    label: "Quantum Communication",
    slug: "quantum-comms",
    terms: ["quantum communication", "quantum internet", "quantum entanglement communication", "quantum key distribution"],
    arxivTerms: ["quantum key distribution", "quantum communication satellite", "quantum entanglement distribution"],
    conceptSlugs: ["magneto-inductive-communications-for-ocean-worlds"],
  },
  {
    label: "Warp Drives & Exotic Physics",
    slug: "warp-drives",
    terms: ["warp drive", "alcubierre drive", "warp bubble", "FTL", "faster than light"],
    arxivTerms: ["Alcubierre metric", "warp drive", "exotic matter negative energy"],
    conceptSlugs: ["procsima", "extreme-metamaterial-solar-sails-for-breakthrough-space-exploration"],
  },
  {
    label: "Electric Propulsion",
    slug: "electric-propulsion",
    terms: ["ion thruster", "hall thruster", "electric propulsion", "ion drive", "plasma thruster"],
    arxivTerms: ["hall thruster", "ion propulsion", "electric propulsion spacecraft"],
    conceptSlugs: ["electric-sail-propulsion", "e-glider", "nasa-innovative-advanced-concepts-niac-heliopause-electrostatic-rapid-transit-sy"],
  },
  {
    label: "Dyson Spheres",
    slug: "dyson-spheres",
    terms: ["dyson sphere", "dyson swarm", "megastructure", "kardashev"],
    arxivTerms: ["Dyson sphere", "megastructure", "Kardashev"],
    conceptSlugs: ["sps-alpha"],
  },
  {
    label: "Space Solar Power",
    slug: "space-solar-power",
    terms: ["space solar power", "space-based solar", "solar power satellite", "beamed power"],
    arxivTerms: ["space solar power", "solar power satellite", "wireless power transmission space"],
    conceptSlugs: ["sps-alpha", "the-light-bender-concept-for-power-distribution"],
  },
  {
    label: "AI in Space",
    slug: "ai-space",
    terms: ["AI space", "machine learning astronomy", "AI satellite", "autonomous spacecraft", "AI telescope"],
    arxivTerms: ["machine learning astronomy", "deep learning astrophysics", "autonomous spacecraft"],
    conceptSlugs: ["starnav", "an-automaton-rover-enabling-long-duration"],
  },

  // --- Research-serious topics (physicist-demanded) ---
  {
    label: "Quantum Computing",
    slug: "quantum-computing",
    terms: ["quantum computer", "quantum computing", "qubit", "quantum supremacy", "quantum error correction", "quantum advantage", "topological qubit", "quantum processor"],
    arxivTerms: ["quantum error correction", "quantum computing", "fault-tolerant quantum", "quantum supremacy", "topological quantum"],
    conceptSlugs: ["magneto-inductive-communications-for-ocean-worlds"],
  },
  {
    label: "Condensed Matter",
    slug: "condensed-matter",
    terms: ["superconductor", "room temperature superconductor", "topological insulator", "quantum material", "graphene", "Bose-Einstein condensate", "superfluid"],
    arxivTerms: ["high temperature superconductor", "topological insulator", "strongly correlated electron", "quantum phase transition", "Bose-Einstein condensate"],
    conceptSlugs: ["extreme-metamaterial-solar-sails"],
  },
  {
    label: "Particle Physics",
    slug: "particle-physics",
    terms: ["LHC", "CERN", "particle collider", "Higgs boson", "beyond standard model", "dark photon", "neutrino mass", "muon anomaly", "supersymmetry"],
    arxivTerms: ["beyond standard model", "Higgs boson", "neutrino oscillation", "dark photon", "supersymmetry LHC", "muon g-2"],
    conceptSlugs: [],
  },
  {
    label: "Cosmology",
    slug: "cosmology",
    terms: ["cosmic microwave background", "CMB", "inflation cosmology", "Big Bang", "cosmic expansion", "Hubble tension", "baryon acoustic", "primordial gravitational waves"],
    arxivTerms: ["cosmic microwave background", "cosmological inflation", "Hubble tension", "baryon acoustic oscillation", "primordial gravitational"],
    conceptSlugs: ["gravity-observation-and-dark-energy-detection-explorer"],
  },
  {
    label: "Nanotechnology & Metamaterials",
    slug: "nanotechnology",
    terms: ["nanotechnology", "metamaterial", "carbon nanotube", "nanostructure", "molecular machine", "nanoscale", "MEMS", "nanorobot"],
    arxivTerms: ["metamaterial", "carbon nanotube", "nanostructure", "molecular machine", "MEMS"],
    conceptSlugs: ["extreme-metamaterial-solar-sails", "technology-development-and-demonstration-concepts-for-the-space-elevator"],
  },
];

/* -------------------------------------------------------------------------- */
/* Resonance — knowledge-graph correlation                                    */
/* -------------------------------------------------------------------------- */

/** Maps pulse topic slugs to deep topic slugs in topics.json */
const PULSE_TO_DEEP_TOPIC: Record<string, string> = {
  "black-holes": "black-holes",
  "exoplanets": "exoplanet-detection",
  "solar-sails": "solar-sails",
  "fusion-propulsion": "propulsion",
  "nuclear-thermal": "nuclear-propulsion",
  "interstellar-travel": "interstellar-travel",
  "space-telescopes": "telescopes",
  "space-elevators": "space-tethers",
  "gravitational-waves": "gravity",
  "dark-matter": "gravity",
  "quantum-computing": "quantum-physics",
  "quantum-comms": "quantum-physics",
  "astrobiology": "astrobiology",
  "mars": "planetary-habitats",
  "artemis": "planetary-habitats",
  "nanotechnology": "in-space-manufacturing",
  "starship": "propulsion",
  "electric-propulsion": "propulsion",
  "ocean-worlds": "astrobiology",
};

/** Maps pulse topic slugs to scientific fields (for pantheon matching) */
const TOPIC_TO_FIELDS: Record<string, string[]> = {
  "black-holes": ["physics", "astrophysics", "cosmology"],
  "gravitational-waves": ["physics", "astrophysics"],
  "dark-matter": ["physics", "cosmology"],
  "quantum-computing": ["physics", "mathematics", "computer science"],
  "quantum-comms": ["physics"],
  "cosmology": ["physics", "cosmology", "astrophysics"],
  "particle-physics": ["physics"],
  "condensed-matter": ["physics"],
  "exoplanets": ["astronomy", "astrophysics"],
  "space-telescopes": ["optics", "astronomy", "astrophysics"],
  "nanotechnology": ["physics", "chemistry"],
  "fusion-propulsion": ["physics"],
  "nuclear-thermal": ["physics"],
  "solar-sails": ["physics"],
  "electric-propulsion": ["physics"],
  "warp-drives": ["physics"],
  "interstellar-travel": ["physics", "astronomy"],
  "astrobiology": ["chemistry", "biology"],
  "mars": ["astronomy"],
  "artemis": ["astronomy"],
  "ocean-worlds": ["astronomy", "chemistry"],
  "starship": ["physics"],
  "starlink": [],
  "space-debris": [],
  "asteroid-mining": ["astronomy"],
  "space-elevators": ["physics"],
  "dyson-spheres": ["physics", "astronomy"],
  "space-solar-power": ["physics"],
  "ai-space": ["computer science", "mathematics"],
};

// Lightweight types for knowledge graph data (only fields we need)
interface KGConcept { slug: string; phase: string | null }
interface KGConnection { conceptSlug: string; strength: "direct" | "thematic" }
interface KGEditorialEntry { whatIfItWorks?: string; editorialTier?: "spotlight" | "highlight" }
interface KGNegativeResult { id: string; title: string; field: string; hypothesis: string; whatHappened: string; status: string }
interface KGSimilarityEdge { source: string; target: string; similarity: number }
interface KGDeepTopic { slug: string; tier: string; openQuestions?: unknown[]; unsolvedProblems?: unknown[] }
interface KGTitan { slug: string; fields: string[] }

interface KnowledgeGraph {
  concepts: KGConcept[];
  connections: KGConnection[];
  editorial: Record<string, KGEditorialEntry>;
  negativeResults: KGNegativeResult[];
  similarities: KGSimilarityEdge[];
  deepTopics: KGDeepTopic[];
  titans: KGTitan[];
}

async function loadKnowledgeGraph(): Promise<KnowledgeGraph> {
  const load = async (name: string) => {
    try {
      return JSON.parse(await readFile(join(DATA_DIR, name), "utf-8"));
    } catch {
      console.warn(`  ! Could not load ${name} for resonance — using empty default`);
      return null;
    }
  };

  const [conceptsRaw, connectionsRaw, editorialRaw, negativeRaw, simRaw, topicsRaw, pantheonRaw] =
    await Promise.all([
      load("concepts.json"),
      load("connections.json"),
      load("editorial.json"),
      load("negative-results.json"),
      load("concept-similarities.json"),
      load("topics.json"),
      load("pantheon.json"),
    ]);

  // concepts.json is an array of full concept objects — extract slug + phase
  const concepts: KGConcept[] = Array.isArray(conceptsRaw)
    ? conceptsRaw.map((c: { slug: string; phase?: string | null }) => ({ slug: c.slug, phase: c.phase ?? null }))
    : [];

  return {
    concepts,
    connections: Array.isArray(connectionsRaw) ? connectionsRaw : [],
    editorial: editorialRaw && typeof editorialRaw === "object" && !Array.isArray(editorialRaw) ? editorialRaw : {},
    negativeResults: Array.isArray(negativeRaw) ? negativeRaw : [],
    similarities: simRaw?.edges && Array.isArray(simRaw.edges) ? simRaw.edges : [],
    deepTopics: Array.isArray(topicsRaw) ? topicsRaw.map((t: { slug: string; tier?: string; openQuestions?: unknown[]; unsolvedProblems?: unknown[] }) => ({
      slug: t.slug, tier: t.tier ?? "standard", openQuestions: t.openQuestions, unsolvedProblems: t.unsolvedProblems,
    })) : [],
    titans: pantheonRaw?.titans ? pantheonRaw.titans.map((t: { slug: string; fields: string[] }) => ({ slug: t.slug, fields: t.fields })) : [],
  };
}

/** Resolve short concept slugs (from TopicDef) to full concept records */
function resolveConceptSlugs(shortSlugs: string[], allConcepts: KGConcept[]): KGConcept[] {
  return shortSlugs.flatMap((short) =>
    allConcepts.filter((c) => c.slug.startsWith(short)),
  );
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

interface RawResonanceResult {
  conceptDepth: number;
  editorial: number;
  connections: number;
  convergence: number;
  deepTopic: number;
  pantheon: number;
  graveyard: number;
}

function computeRawResonance(topic: TopicDef, kg: KnowledgeGraph): RawResonanceResult {
  const resolved = resolveConceptSlugs(topic.conceptSlugs, kg.concepts);
  const resolvedSlugs = new Set(resolved.map((c) => c.slug));

  // 1. Concept depth: phase-weighted count (I=1, II=2, III=3), log-compressed
  const phaseWeight: Record<string, number> = { I: 1, II: 2, III: 3, Other: 0.5 };
  const rawDepth = resolved.reduce((sum, c) => sum + (phaseWeight[c.phase ?? ""] ?? 0.5), 0);
  const conceptDepth = Math.log(1 + rawDepth);

  // 2. Editorial endorsement: max tier across linked concepts
  let editorial = 0;
  for (const c of resolved) {
    const ed = kg.editorial[c.slug];
    if (ed?.editorialTier === "spotlight") { editorial = 1.0; break; }
    if (ed?.editorialTier === "highlight" && editorial < 0.7) editorial = 0.7;
    else if (ed?.whatIfItWorks && editorial < 0.4) editorial = 0.4;
  }

  // 3. Historical connections: direct=1.0, thematic=0.5
  let connections = 0;
  for (const conn of kg.connections) {
    if (resolvedSlugs.has(conn.conceptSlug)) {
      connections += conn.strength === "direct" ? 1.0 : 0.5;
    }
  }

  // 4. Convergence: similarity edges touching this topic's concepts
  let convergence = 0;
  for (const edge of kg.similarities) {
    const srcIn = resolvedSlugs.has(edge.source);
    const tgtIn = resolvedSlugs.has(edge.target);
    if (srcIn && tgtIn) convergence += 2; // intra-topic
    else if (srcIn || tgtIn) convergence += 1; // cross-topic reach
  }

  // 5. Deep topic coverage
  let deepTopic = 0;
  const deepSlug = PULSE_TO_DEEP_TOPIC[topic.slug];
  if (deepSlug) {
    const dt = kg.deepTopics.find((t) => t.slug === deepSlug);
    if (dt) {
      const hasUnsolved = (dt.unsolvedProblems?.length ?? 0) > 0;
      const hasOpen = (dt.openQuestions?.length ?? 0) > 0;
      deepTopic = hasUnsolved ? 1.0 : hasOpen ? 0.8 : 0.6;
    }
  }

  // 6. Pantheon alignment
  const topicFields = TOPIC_TO_FIELDS[topic.slug] ?? [];
  let pantheon = 0;
  if (topicFields.length > 0) {
    for (const titan of kg.titans) {
      if (titan.fields.some((f) => topicFields.includes(f))) pantheon += 1;
    }
  }

  // 7. Graveyard anti-signal
  let graveyard = 0;
  const termPatterns = topic.terms.map(
    (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
  );
  for (const nr of kg.negativeResults) {
    const text = `${nr.title} ${nr.hypothesis} ${nr.whatHappened}`;
    const matches = termPatterns.filter((p) => p.test(text)).length;
    if (matches > 0) {
      const statusWeight = nr.status === "debunked" ? 1.0 : nr.status === "retracted" ? 0.8 : 0.3;
      graveyard += statusWeight * Math.min(matches, 3) / 3;
    }
  }
  graveyard = Math.min(graveyard, 1);

  return { conceptDepth, editorial, connections, convergence, deepTopic, pantheon, graveyard };
}

/** Normalize count-based signals across all topics, compute final resonance, classify quadrant */
function applyResonance(topics: PulseTopic[], topicDefs: TopicDef[], kg: KnowledgeGraph): void {
  const rawResults = topicDefs.map((def) => computeRawResonance(def, kg));

  // Find maxes for normalization (avoid division by zero)
  const maxConceptDepth = Math.max(...rawResults.map((r) => r.conceptDepth), 0.001);
  const maxConnections = Math.max(...rawResults.map((r) => r.connections), 0.001);
  const maxConvergence = Math.max(...rawResults.map((r) => r.convergence), 0.001);
  const maxPantheon = Math.max(...rawResults.map((r) => r.pantheon), 0.001);

  // Build slug→raw map
  const rawBySlug = new Map<string, RawResonanceResult>();
  for (let i = 0; i < topicDefs.length; i++) {
    rawBySlug.set(topicDefs[i].slug, rawResults[i]);
  }

  // Weights
  const W = { conceptDepth: 30, editorial: 20, connections: 15, convergence: 15, deepTopic: 10, pantheon: 5, graveyard: 5 };

  for (const topic of topics) {
    const raw = rawBySlug.get(topic.slug);
    if (!raw) {
      topic.resonance = 0;
      topic.quadrant = "dead-zone";
      topic.resonanceSignals = { conceptDepth: 0, editorial: 0, connections: 0, convergence: 0, deepTopic: 0, pantheon: 0, graveyard: 0 };
      continue;
    }

    const signals: ResonanceSignals = {
      conceptDepth: raw.conceptDepth / maxConceptDepth,
      editorial: raw.editorial,
      connections: raw.connections / maxConnections,
      convergence: raw.convergence / maxConvergence,
      deepTopic: raw.deepTopic,
      pantheon: raw.pantheon / maxPantheon,
      graveyard: raw.graveyard,
    };

    const resonance = Math.round(Math.max(0, Math.min(100,
      signals.conceptDepth * W.conceptDepth +
      signals.editorial * W.editorial +
      signals.connections * W.connections +
      signals.convergence * W.convergence +
      signals.deepTopic * W.deepTopic +
      signals.pantheon * W.pantheon -
      signals.graveyard * W.graveyard,
    )));

    topic.resonance = resonance;
    topic.resonanceSignals = signals;
    // quadrant assigned below after all resonance scores computed
  }

  // Classify quadrants using medians
  const activeScores = topics.filter((t) => t.score > 0).map((t) => t.score);
  const pulseMedian = median(activeScores);
  const resonanceMedian = median(topics.map((t) => t.resonance));

  for (const topic of topics) {
    const highPulse = topic.score >= pulseMedian;
    const highResonance = topic.resonance >= resonanceMedian;
    if (highPulse && highResonance) topic.quadrant = "real-deal";
    else if (highPulse && !highResonance) topic.quadrant = "hype-cycle";
    else if (!highPulse && highResonance) topic.quadrant = "sleeping-giant";
    else topic.quadrant = "dead-zone";
  }
}

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
  // Research-serious subs (physicist-demanded coverage)
  "QuantumPhysics", "condensedmatter", "ParticlePhysics",
  "nanotechnology", "materials", "HEP",
];

// Reddit multi-sub limit is ~100 subs per request, so we can batch all of ours.
// We split into chunks of 10 to keep URLs reasonable and avoid 414 errors.
const MULTI_SUB_CHUNK_SIZE = 10;

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

async function fetchRedditMultiSub(
  subs: string[],
  sort: "top" | "hot",
  timeframe: "day" | "week" | "month" = "week",
): Promise<RedditPost[]> {
  const multi = subs.join("+");
  const qs = sort === "top" ? `?t=${timeframe}&limit=100` : "?limit=100";
  const url = `https://www.reddit.com/r/${multi}/${sort}.json${qs}`;
  const key = cacheKey("reddit", `${multi}_${sort}_${timeframe}`);

  const cached = await getCached<RedditPost[]>(key);
  if (cached) {
    console.log(`  [cache] Reddit r/${subs[0]}+… ${sort}: ${cached.length} posts`);
    return cached;
  }

  return withRetry(
    async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": "niac-atlas-pulse/0.2 (research project)" },
      });
      if (!res.ok) {
        const msg = `Reddit r/${subs[0]}+… ${sort}: ${res.status}`;
        if (res.status === 429 || res.status >= 500) throw new Error(msg);
        recordError(msg);
        return [];
      }
      const json = (await res.json()) as any;
      const posts: RedditPost[] = (json.data?.children ?? []).map((c: any) => ({
        title: c.data.title,
        url: c.data.url,
        permalink: `https://reddit.com${c.data.permalink}`,
        score: c.data.score,
        num_comments: c.data.num_comments,
        subreddit: c.data.subreddit,
        author: c.data.author,
        created_utc: c.data.created_utc,
      }));
      await setCache(key, posts);
      return posts;
    },
    { retries: 2, baseDelay: 2000, label: `Reddit ${sort} ${subs[0]}+…` },
  );
}

/**
 * Fetch Reddit posts using multi-sub batches for both /top and /hot.
 * Deduplicates by permalink across both sorts.
 */
async function fetchAllReddit(
  timeframe: "day" | "week" | "month" = "week",
): Promise<RedditPost[]> {
  console.log(`→ fetching Reddit top+hot posts (${timeframe})...`);

  // Split subs into chunks for multi-sub requests
  const chunks: string[][] = [];
  for (let i = 0; i < SUBREDDITS.length; i += MULTI_SUB_CHUNK_SIZE) {
    chunks.push(SUBREDDITS.slice(i, i + MULTI_SUB_CHUNK_SIZE));
  }

  // Build fetch tasks: each chunk × [top, hot]
  const tasks = chunks.flatMap((chunk) => [
    { chunk, sort: "top" as const },
    { chunk, sort: "hot" as const },
  ]);

  // Run with concurrency of 3 (respectful to Reddit)
  const results = await parallelLimit(tasks, 3, async (task) => {
    const posts = await fetchRedditMultiSub(task.chunk, task.sort, timeframe);
    console.log(`  r/${task.chunk[0]}+… ${task.sort}: ${posts.length} posts`);
    await sleep(800); // breathing room between requests
    return posts;
  });

  // Dedupe by permalink (same post may appear in top AND hot)
  const seen = new Set<string>();
  const all: RedditPost[] = [];
  for (const batch of results) {
    for (const post of batch) {
      if (!seen.has(post.permalink)) {
        seen.add(post.permalink);
        all.push(post);
      }
    }
  }

  console.log(`  total: ${all.length} Reddit posts (deduped)`);
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
  const key = cacheKey("hn", `${query}_${lookbackDays}d`);
  const cached = await getCached<HNHit[]>(key);
  if (cached) return cached;

  return withRetry(
    async () => {
      const params = new URLSearchParams({
        query,
        tags: "story",
        restrictSearchableAttributes: "title",
        numericFilters: `created_at_i>${Math.floor(Date.now() / 1000) - lookbackDays * 86400}`,
        hitsPerPage: "50",
      });
      const url = `https://hn.algolia.com/api/v1/search?${params}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) throw new Error(`HN ${res.status}`);
        return [];
      }
      const json = (await res.json()) as any;
      const hits: HNHit[] = (json.hits ?? []).map((h: any) => ({
        title: h.title,
        url: h.url,
        objectID: h.objectID,
        points: h.points ?? 0,
        num_comments: h.num_comments ?? 0,
        author: h.author,
        created_at_i: h.created_at_i,
      }));
      await setCache(key, hits);
      return hits;
    },
    { retries: 2, baseDelay: 500, label: `HN "${query}"` },
  );
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
    // Search up to 5 terms per topic for better coverage (HN Algolia is generous)
    const termsToSearch = topic.terms.slice(0, 5);
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
      await sleep(200);
    }

    if (allHits.length > 0) {
      map.set(topic.slug, allHits);
      console.log(`  HN "${topic.slug}": ${allHits.length} hits from ${termsToSearch.length} terms`);
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* ArXiv fetcher                                                              */
/* -------------------------------------------------------------------------- */
/* ArXiv API returns Atom XML. We parse it manually (no dependencies).        */
/* Endpoint: export.arxiv.org/api/query — free, no auth, no key.             */

interface ArXivPaper {
  title: string;
  authors: string[];
  summary: string;
  arxivId: string;
  url: string;
  category: string;
  published: string; // ISO date
  updated: string;
}

/** Extract text content from an XML tag. Simple regex — no parser needed. */
function xmlText(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") : "";
}

/** Extract all matches of a tag from XML. */
function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, "g");
  return xml.match(re) ?? [];
}

async function searchArXiv(query: string, maxResults = 20): Promise<ArXivPaper[]> {
  const key = cacheKey("arxiv", query);
  const cached = await getCached<ArXivPaper[]>(key);
  if (cached) {
    console.log(`  [cache] ArXiv "${query}": ${cached.length} papers`);
    return cached;
  }

  return withRetry(
    async () => {
      // Quote multi-word queries so ArXiv treats them as phrases, not OR'd terms
      const quoted = query.includes(" ") ? `"${query}"` : query;
      const params = new URLSearchParams({
        search_query: `all:${quoted}`,
        sortBy: "submittedDate",
        sortOrder: "descending",
        max_results: String(maxResults),
      });
      const url = `https://export.arxiv.org/api/query?${params}`;

      const res = await fetch(url, {
        headers: { "User-Agent": "niac-atlas-pulse/0.2 (research project)" },
      });
      if (!res.ok) {
        const msg = `ArXiv query "${query}": ${res.status}`;
        if (res.status === 429 || res.status >= 500) throw new Error(msg);
        recordError(msg);
        return [];
      }
      const xml = await res.text();

      // Parse <entry> elements
      const entries = xmlAll(xml, "entry");
      const papers: ArXivPaper[] = [];

      for (const entry of entries) {
        const title = xmlText(entry, "title");
        if (!title) continue;

        const authorBlocks = xmlAll(entry, "author");
        const authors = authorBlocks.map((a) => xmlText(a, "name")).filter(Boolean);

        const idUrl = xmlText(entry, "id");
        const arxivId = idUrl.replace(/.*\/abs\//, "").replace(/v\d+$/, "");

        const primaryMatch = entry.match(/primary_category\s+term="([^"]+)"/);
        const catMatch = entry.match(/<category\s+term="([^"]+)"/);
        const category = primaryMatch?.[1] || catMatch?.[1] || "";

        const published = xmlText(entry, "published");
        const updated = xmlText(entry, "updated");
        const summary = xmlText(entry, "summary");

        papers.push({ title, authors, summary, arxivId, url: `https://arxiv.org/abs/${arxivId}`, category, published, updated });
      }

      await setCache(key, papers);
      return papers;
    },
    { retries: 2, baseDelay: 4000, label: `ArXiv "${query}"` },
  );
}

/** Filter ArXiv papers to only recent ones (within lookback window). */
function filterRecentPapers(papers: ArXivPaper[], lookbackDays: number): ArXivPaper[] {
  const cutoff = Date.now() - lookbackDays * 86400000;
  return papers.filter((p) => new Date(p.published).getTime() >= cutoff);
}

async function fetchAllArXiv(
  topics: TopicDef[],
  lookbackDays = 30,
): Promise<Map<string, ArXivPaper[]>> {
  console.log(`→ fetching ArXiv preprints (${lookbackDays}d)...`);
  const map = new Map<string, ArXivPaper[]>();

  for (const topic of topics) {
    const terms = topic.arxivTerms ?? topic.terms.slice(0, 2);
    const seen = new Set<string>();
    const allPapers: ArXivPaper[] = [];

    for (const term of terms.slice(0, 3)) {
      const papers = filterRecentPapers(await searchArXiv(term, 15), lookbackDays);
      for (const p of papers) {
        if (!seen.has(p.arxivId)) {
          seen.add(p.arxivId);
          allPapers.push(p);
        }
      }
      // ArXiv asks for max 1 request per 3 seconds
      await sleep(3500);
    }

    if (allPapers.length > 0) {
      map.set(topic.slug, allPapers);
      console.log(`  ArXiv "${topic.slug}": ${allPapers.length} papers from ${Math.min(terms.length, 3)} terms`);
    }
  }

  return map;
}

/* -------------------------------------------------------------------------- */
/* Matching + scoring                                                         */
/* -------------------------------------------------------------------------- */

interface PulseSource {
  platform: "reddit" | "hackernews" | "youtube" | "arxiv";
  title: string;
  url: string;
  score: number;
  author?: string;
  subreddit?: string;
  thumbnail?: string;
  commentCount?: number;
  publishedAt: string;
  /** ArXiv-specific: comma-separated author list */
  authors?: string;
  /** ArXiv-specific: primary category (e.g. "astro-ph.EP") */
  arxivCategory?: string;
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

type Quadrant = "real-deal" | "hype-cycle" | "sleeping-giant" | "dead-zone";

interface ResonanceSignals {
  conceptDepth: number;
  editorial: number;
  connections: number;
  convergence: number;
  deepTopic: number;
  pantheon: number;
  graveyard: number;
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
  resonance: number;
  quadrant: Quadrant;
  resonanceSignals: ResonanceSignals;
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

/**
 * Deduplicate sources across topics. Each Reddit/HN post is assigned to
 * the topic where it has the highest term-match density, preventing
 * double-counting on the leaderboard.
 */
function deduplicateCrossTopicSources(
  topicResults: Map<string, { posts: RedditPost[]; hnHits: HNHit[] }>,
): void {
  // Track best topic assignment for each Reddit post (by permalink)
  const redditBestTopic = new Map<string, { slug: string; matchCount: number }>();
  // Track best topic assignment for each HN post (by objectID)
  const hnBestTopic = new Map<string, { slug: string; matchCount: number }>();

  // First pass: find best topic for each source
  for (const [slug, { posts, hnHits }] of topicResults) {
    const topic = TOPICS.find((t) => t.slug === slug)!;
    const patterns = topic.terms.map(
      (t) => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );

    for (const post of posts) {
      const matchCount = patterns.filter((p) => p.test(post.title)).length;
      const existing = redditBestTopic.get(post.permalink);
      if (!existing || matchCount > existing.matchCount) {
        redditBestTopic.set(post.permalink, { slug, matchCount });
      }
    }

    for (const hit of hnHits) {
      const matchCount = patterns.filter((p) => p.test(hit.title)).length;
      const existing = hnBestTopic.get(hit.objectID);
      if (!existing || matchCount > existing.matchCount) {
        hnBestTopic.set(hit.objectID, { slug, matchCount });
      }
    }
  }

  // Second pass: remove posts that belong to a different topic
  for (const [slug, data] of topicResults) {
    data.posts = data.posts.filter((p) => redditBestTopic.get(p.permalink)?.slug === slug);
    data.hnHits = data.hnHits.filter((h) => hnBestTopic.get(h.objectID)?.slug === slug);
  }
}

function scoreTopic(
  topic: TopicDef,
  matchedRedditPosts: RedditPost[],
  hnHits: HNHit[],
  arxivPapers: ArXivPaper[] = [],
): PulseTopic {
  // Scoring philosophy: primary literature leads, social signal is color.
  // A Reddit upvote is mass-audience noise. An ArXiv paper is months of work.
  const redditScore = matchedRedditPosts.reduce((sum, p) => sum + p.score, 0) * 0.3;
  const hnScore = hnHits.reduce((sum, h) => sum + h.points, 0) * 1.0;
  // ArXiv: each paper carries heavy weight — this is the actual science
  const arxivScore = arxivPapers.length * 200;
  const totalScore = Math.round(redditScore + hnScore + arxivScore);
  const mentions = matchedRedditPosts.length + hnHits.length + arxivPapers.length;

  // Build sources list, sorted by score, top 12.
  // Reddit posts that link to YouTube get split into a YouTube source
  // (with thumbnail) AND the Reddit discussion source.
  const redditSources: PulseSource[] = [];
  for (const p of matchedRedditPosts) {
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
  for (const h of hnHits) {
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

  const arxivSources: PulseSource[] = arxivPapers.map((p) => ({
    platform: "arxiv" as const,
    title: p.title,
    url: p.url,
    score: 200, // primary literature — highest authority weight
    authors: p.authors.slice(0, 3).join(", ") + (p.authors.length > 3 ? " et al." : ""),
    arxivCategory: p.category,
    publishedAt: new Date(p.published).toISOString(),
  }));

  const sources = [...redditSources, ...hnSources, ...arxivSources]
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
    resonance: 0,
    quadrant: "dead-zone" as Quadrant,
    resonanceSignals: { conceptDepth: 0, editorial: 0, connections: 0, convergence: 0, deepTopic: 0, pantheon: 0, graveyard: 0 },
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
/* Snapshot archival                                                           */
/* -------------------------------------------------------------------------- */
/* Moves pulse-YYYY-MM-DD.json files older than MAX_SNAPSHOT_AGE_WEEKS        */
/* to data/archive/ so the data/ directory doesn't grow unbounded.           */

const MAX_SNAPSHOT_AGE_WEEKS = 8;

async function archiveOldSnapshots(): Promise<void> {
  const cutoffMs = Date.now() - MAX_SNAPSHOT_AGE_WEEKS * 7 * 86400000;

  try {
    const files = await readdir(DATA_DIR);
    const snapshotFiles = files.filter((f) => /^pulse-\d{4}-\d{2}-\d{2}\.json$/.test(f));

    const toArchive: string[] = [];
    for (const f of snapshotFiles) {
      const dateStr = f.replace("pulse-", "").replace(".json", "");
      const fileDate = new Date(dateStr).getTime();
      if (fileDate < cutoffMs) {
        toArchive.push(f);
      }
    }

    if (toArchive.length === 0) return;

    await mkdir(ARCHIVE_DIR, { recursive: true });
    for (const f of toArchive) {
      await rename(join(DATA_DIR, f), join(ARCHIVE_DIR, f));
      console.log(`  archived: ${f}`);
    }
    console.log(`→ archived ${toArchive.length} old snapshot(s)`);
  } catch (err) {
    recordError(`Snapshot archival failed: ${(err as Error).message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Backdate: bucket posts into weekly snapshots                              */
/* -------------------------------------------------------------------------- */

function buildWeeklySnapshot(
  weekStart: number,
  weekEnd: number,
  allReddit: RedditPost[],
  allHN: Map<string, HNHit[]>,
  allArXiv: Map<string, ArXivPaper[]> = new Map(),
  kg?: KnowledgeGraph,
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

  // Filter ArXiv papers to this week
  const weekArXiv = new Map<string, ArXivPaper[]>();
  for (const [slug, papers] of allArXiv) {
    const filtered = papers.filter((p) => {
      const ts = new Date(p.published).getTime();
      return ts >= weekStart && ts < weekEnd;
    });
    if (filtered.length > 0) weekArXiv.set(slug, filtered);
  }

  // Match Reddit posts per topic, then deduplicate across topics
  const topicResults = new Map<string, { posts: RedditPost[]; hnHits: HNHit[] }>();
  for (const topic of TOPICS) {
    const { posts } = matchRedditPosts(topic, weekReddit);
    topicResults.set(topic.slug, { posts, hnHits: weekHN.get(topic.slug) ?? [] });
  }
  deduplicateCrossTopicSources(topicResults);

  const topics = TOPICS.map((topic) => {
    const matched = topicResults.get(topic.slug)!;
    return scoreTopic(topic, matched.posts, matched.hnHits, weekArXiv.get(topic.slug) ?? []);
  })
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
        resonance: 0,
        quadrant: "dead-zone" as Quadrant,
        resonanceSignals: { conceptDepth: 0, editorial: 0, connections: 0, convergence: 0, deepTopic: 0, pantheon: 0, graveyard: 0 },
      });
    }
  }

  if (kg) applyResonance(topics, TOPICS, kg);

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
  const arxivMap = await fetchAllArXiv(TOPICS, 30);

  console.log("→ loading knowledge graph for resonance...");
  const kg = await loadKnowledgeGraph();

  console.log(`\n→ bucketing into ${WEEKS} weekly snapshots...`);

  const now = Date.now();
  const weekMs = 7 * 86400000;
  const snapshots: { file: string; date: string; active: number }[] = [];

  for (let w = WEEKS - 1; w >= 0; w--) {
    const weekEnd = now - w * weekMs;
    const weekStart = weekEnd - weekMs;
    const dateLabel = new Date(weekStart).toISOString().slice(0, 10);

    const snapshot = buildWeeklySnapshot(weekStart, weekEnd, redditPosts, hnMap, arxivMap, kg);
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
    const curr = JSON.parse(await readFile(currFile, "utf-8")) as { generatedAt?: string; topics: PulseTopic[] };
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
  const startTime = Date.now();
  await mkdir(DATA_DIR, { recursive: true });

  // Archive old snapshots before starting
  await archiveOldSnapshots();

  const [redditPosts, hnMap, prevScores] = await Promise.all([
    fetchAllReddit(),
    fetchAllHN(TOPICS),
    loadPreviousPulse(),
  ]);

  // ArXiv runs sequentially (rate limit: 1 req per 3s) so don't parallelize
  const arxivMap = await fetchAllArXiv(TOPICS, 30);

  console.log("→ scoring topics...");

  // Match Reddit posts per topic, then deduplicate across topics
  const topicResults = new Map<string, { posts: RedditPost[]; hnHits: HNHit[] }>();
  for (const topic of TOPICS) {
    const { posts } = matchRedditPosts(topic, redditPosts);
    topicResults.set(topic.slug, { posts, hnHits: hnMap.get(topic.slug) ?? [] });
  }
  deduplicateCrossTopicSources(topicResults);

  const topics = TOPICS.map((topic) => {
    const matched = topicResults.get(topic.slug)!;
    return scoreTopic(topic, matched.posts, matched.hnHits, arxivMap.get(topic.slug) ?? []);
  })
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
        resonance: 0,
        quadrant: "dead-zone" as Quadrant,
        resonanceSignals: { conceptDepth: 0, editorial: 0, connections: 0, convergence: 0, deepTopic: 0, pantheon: 0, graveyard: 0 },
      });
    }
  }

  // --- Resonance: cross-reference with knowledge graph ---
  console.log("→ computing resonance scores...");
  const kg = await loadKnowledgeGraph();
  applyResonance(topics, TOPICS, kg);

  const quadrantCounts = { "real-deal": 0, "hype-cycle": 0, "sleeping-giant": 0, "dead-zone": 0 };
  for (const t of topics) quadrantCounts[t.quadrant]++;
  console.log(`  resonance: ${JSON.stringify(quadrantCounts)}`);

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

  // Write health meta file
  const totalHnHits = Array.from(hnMap.values()).reduce((sum, hits) => sum + hits.length, 0);
  const totalArxiv = Array.from(arxivMap.values()).reduce((sum, papers) => sum + papers.length, 0);
  const meta: PulseMeta = {
    lastRun: new Date().toISOString(),
    redditPostCount: redditPosts.length,
    hnHitCount: totalHnHits,
    arxivPaperCount: totalArxiv,
    topicCount: topics.filter((t) => t.mentions > 0).length,
    errors: runErrors,
    durationMs: Date.now() - startTime,
  };
  await writeFile(META_FILE, JSON.stringify(meta, null, 2));

  console.log(`\n✓ wrote ${topics.length} topics to ${OUT_FILE}`);
  console.log(`✓ meta: ${redditPosts.length} reddit, ${totalHnHits} hn, ${totalArxiv} arxiv, ${runErrors.length} errors, ${Math.round(meta.durationMs / 1000)}s`);
  if (runErrors.length > 0) {
    console.log(`\n⚠ Errors encountered:`);
    for (const e of runErrors) console.log(`  - ${e}`);
  }
  console.log("\nTop trending:");
  for (const t of topics.slice(0, 8)) {
    const dir = t.direction === "up" ? "▲" : t.direction === "down" ? "▼" : "—";
    console.log(
      `  ${dir} ${t.label.padEnd(25)} score: ${String(t.score).padStart(6)}  res: ${String(t.resonance).padStart(3)}  [${t.quadrant}]`,
    );
  }
}

(IS_BACKDATE ? mainBackdate() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
