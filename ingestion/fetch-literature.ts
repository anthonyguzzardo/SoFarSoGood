/**
 * Connect the site to the real scientific literature graph via
 * Semantic Scholar and OpenAlex APIs.
 *
 * Run with:
 *   node --experimental-strip-types ingestion/fetch-literature.ts --verify-wishlist
 *   node --experimental-strip-types ingestion/fetch-literature.ts --citation-velocity
 *   node --experimental-strip-types ingestion/fetch-literature.ts --enrich-concepts
 *
 * No API keys required — both Semantic Scholar (100 req/5min) and
 * OpenAlex (polite pool with email) are free public APIs.
 */

import { writeFile, readFile, mkdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const CACHE_DIR = join(DATA_DIR, ".cache");

const WISHLIST_FILE = join(DATA_DIR, "wishlist.json");
const PULSE_FILE = join(DATA_DIR, "pulse.json");
const CONCEPTS_FILE = join(DATA_DIR, "concepts.json");
const CITATION_VELOCITY_FILE = join(DATA_DIR, "citation-velocity.json");
const CONCEPT_CITATIONS_FILE = join(DATA_DIR, "concept-citations.json");

/* -------------------------------------------------------------------------- */
/* Utilities                                                                   */
/* -------------------------------------------------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const runErrors: string[] = [];

async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelay = 2000, label = "" } = {},
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = baseDelay * 2 ** attempt;
      console.warn(`  ↻ retry ${attempt + 1}/${retries} for ${label} in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error("unreachable");
}

/* -------------------------------------------------------------------------- */
/* Cache layer (same pattern as fetch-pulse.ts)                                */
/* -------------------------------------------------------------------------- */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(prefix: string, id: string): string {
  return join(CACHE_DIR, `${prefix}_${id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const info = await stat(key);
    if (Date.now() - info.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await readFile(key, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: unknown): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(key, JSON.stringify(data));
  } catch {}
}

/* -------------------------------------------------------------------------- */
/* Semantic Scholar API                                                        */
/* -------------------------------------------------------------------------- */

const S2_BASE = "https://api.semanticscholar.org/graph/v1";
const S2_RATE_LIMIT_MS = 3100; // 100 requests per 5 minutes ≈ 3s between

interface S2Paper {
  paperId: string;
  title: string;
  year: number | null;
  citationCount: number;
  influentialCitationCount: number;
  externalIds?: { DOI?: string; ArXiv?: string };
  url: string;
}

async function s2Search(query: string): Promise<S2Paper | null> {
  const key = cacheKey("s2_search", query);
  const cached = await getCached<S2Paper | null>(key);
  if (cached !== null) return cached;

  const params = new URLSearchParams({
    query,
    limit: "1",
    fields: "title,year,citationCount,influentialCitationCount,externalIds,url",
  });

  try {
    const resp = await withRetry(
      () => fetch(`${S2_BASE}/paper/search?${params}`),
      { label: `S2 search: ${query.slice(0, 50)}` },
    );

    if (resp.status === 429 || !resp.ok) return null;
    const data = (await resp.json()) as { data?: S2Paper[] };
    const result = data.data?.[0] ?? null;
    await setCache(key, result);
    return result;
  } catch (err) {
    runErrors.push(`S2 search failed: ${query.slice(0, 50)} — ${(err as Error).message}`);
    return null;
  }
}

async function s2PaperByArxiv(arxivId: string): Promise<S2Paper | null> {
  const key = cacheKey("s2_arxiv", arxivId);
  const cached = await getCached<S2Paper | null>(key);
  if (cached !== null) return cached;

  const fields = "title,year,citationCount,influentialCitationCount,externalIds,url";
  try {
    const resp = await withRetry(
      () => fetch(`${S2_BASE}/paper/ArXiv:${arxivId}?fields=${fields}`),
      { label: `S2 ArXiv: ${arxivId}` },
    );
    if (!resp.ok) return null;
    const result = (await resp.json()) as S2Paper;
    await setCache(key, result);
    return result;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* OpenAlex API                                                                */
/* -------------------------------------------------------------------------- */

const OA_BASE = "https://api.openalex.org";
// Polite pool: include email for higher rate limits
const OA_HEADERS = { "User-Agent": "SoFarSoGood/1.0 (mailto:hello@hactenusbene.com)" };

interface OAWork {
  id: string;
  title: string;
  doi: string | null;
  cited_by_count: number;
  publication_year: number | null;
}

async function oaSearch(title: string, author?: string): Promise<OAWork | null> {
  const key = cacheKey("oa_search", `${title}_${author ?? ""}`);
  const cached = await getCached<OAWork | null>(key);
  if (cached !== null) return cached;

  const params = new URLSearchParams({
    search: title,
    select: "id,title,doi,cited_by_count,publication_year",
    per_page: "1",
  });
  if (author) params.set("filter", `author.search:${author}`);

  try {
    const resp = await fetch(`${OA_BASE}/works?${params}`, { headers: OA_HEADERS });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { results?: OAWork[] };
    const result = data.results?.[0] ?? null;
    await setCache(key, result);
    return result;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Mode: --verify-wishlist                                                     */
/* -------------------------------------------------------------------------- */

interface WishlistPaper {
  id: string;
  title: string;
  author: string;
  year: number;
  field: string;
  subfield?: string;
  significance?: string;
  status: "wanted" | "indexed" | "acquired" | "unfound";
  doi?: string;
  url?: string;
  notes?: string;
}

async function verifyWishlist(): Promise<void> {
  const raw = await readFile(WISHLIST_FILE, "utf-8");
  const papers: WishlistPaper[] = JSON.parse(raw);

  const unfound = papers.filter((p) => p.status === "wanted" || p.status === "unfound");
  console.log(`\nWishlist: ${papers.length} total, ${unfound.length} wanted/unfound`);
  console.log(`Verifying via Semantic Scholar + OpenAlex...\n`);

  let newlyFound = 0;
  let checked = 0;

  for (const paper of unfound) {
    checked++;
    if (checked % 10 === 0) {
      process.stdout.write(`  Checked ${checked}/${unfound.length}...\r`);
    }

    // Lead with OpenAlex (generous rate limits, no auth needed)
    const oaResult = await oaSearch(paper.title, paper.author);
    await sleep(150);

    if (oaResult && oaResult.title.toLowerCase().includes(paper.title.toLowerCase().slice(0, 20))) {
      paper.status = "indexed";
      if (oaResult.doi) paper.doi = oaResult.doi;
      newlyFound++;
      continue;
    }

    // Fallback to Semantic Scholar (stricter rate limits)
    const s2Result = await s2Search(`${paper.title} ${paper.author ?? ""}`);
    await sleep(S2_RATE_LIMIT_MS);

    if (s2Result && s2Result.title.toLowerCase().includes(paper.title.toLowerCase().slice(0, 20))) {
      paper.status = "indexed";
      if (s2Result.externalIds?.DOI) paper.doi = s2Result.externalIds.DOI;
      paper.url = s2Result.url;
      newlyFound++;
    }
  }

  await writeFile(WISHLIST_FILE, JSON.stringify(papers, null, 2));

  const remaining = papers.filter((p) => p.status === "wanted" || p.status === "unfound").length;
  const indexed = papers.filter((p) => p.status === "indexed").length;
  const acquired = papers.filter((p) => p.status === "acquired").length;

  console.log(`\n\n✓ Verified ${checked} papers`);
  console.log(`  ${newlyFound} newly found`);
  console.log(`  ${indexed} total indexed, ${acquired} acquired, ${remaining} still unfound`);
}

/* -------------------------------------------------------------------------- */
/* Mode: --citation-velocity                                                   */
/* -------------------------------------------------------------------------- */

interface CitationEntry {
  arxivId: string;
  title: string;
  citationCount: number;
  influentialCitationCount: number;
  monthsSincePublication: number;
  velocity: number;
}

async function citationVelocity(): Promise<void> {
  const raw = await readFile(PULSE_FILE, "utf-8");
  const pulse = JSON.parse(raw) as { topics: { sources: { platform: string; url: string; title: string }[] }[] };

  // Extract all ArXiv papers from pulse
  const arxivPapers: { id: string; title: string; url: string }[] = [];
  for (const topic of pulse.topics) {
    for (const source of topic.sources) {
      if (source.platform === "arxiv") {
        const match = source.url.match(/abs\/(\d{4}\.\d{4,5})/);
        if (match) {
          arxivPapers.push({ id: match[1], title: source.title, url: source.url });
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = arxivPapers.filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });

  console.log(`\nFound ${unique.length} unique ArXiv papers in pulse data`);
  console.log("Looking up citation data on Semantic Scholar...\n");

  const entries: CitationEntry[] = [];

  for (let i = 0; i < unique.length; i++) {
    const paper = unique[i];
    process.stdout.write(`  ${i + 1}/${unique.length}: ${paper.id}...\r`);

    const s2Paper = await s2PaperByArxiv(paper.id);
    await sleep(S2_RATE_LIMIT_MS);

    if (!s2Paper) continue;

    const pubYear = s2Paper.year ?? new Date().getFullYear();
    const monthsSince = Math.max(1, Math.round((Date.now() - new Date(`${pubYear}-06-01`).getTime()) / (30 * 86400000)));

    entries.push({
      arxivId: paper.id,
      title: s2Paper.title,
      citationCount: s2Paper.citationCount,
      influentialCitationCount: s2Paper.influentialCitationCount,
      monthsSincePublication: monthsSince,
      velocity: Math.round((s2Paper.citationCount / monthsSince) * 10) / 10,
    });
  }

  entries.sort((a, b) => b.velocity - a.velocity);

  const output = { generatedAt: new Date().toISOString(), papers: entries };
  await writeFile(CITATION_VELOCITY_FILE, JSON.stringify(output, null, 2));

  console.log(`\n\n✓ Citation velocity for ${entries.length} papers written to citation-velocity.json`);
  if (entries.length > 0) {
    console.log("\nTop 5 by velocity:");
    for (const e of entries.slice(0, 5)) {
      console.log(`  ${e.velocity} cit/mo — ${e.title.slice(0, 60)}... (${e.citationCount} total)`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Mode: --enrich-concepts                                                     */
/* -------------------------------------------------------------------------- */

interface ConceptCitation {
  slug: string;
  s2PaperId: string | null;
  citationCount: number;
  influentialCitationCount: number;
  referencesCount: number;
}

async function enrichConcepts(): Promise<void> {
  const raw = await readFile(CONCEPTS_FILE, "utf-8");
  const concepts = JSON.parse(raw) as { slug: string; title: string }[];

  console.log(`\nEnriching ${concepts.length} concepts with citation data...\n`);

  const entries: ConceptCitation[] = [];

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    if (i % 5 === 0) process.stdout.write(`  ${i + 1}/${concepts.length}...\r`);

    const s2Paper = await s2Search(concept.title);
    await sleep(S2_RATE_LIMIT_MS);

    entries.push({
      slug: concept.slug,
      s2PaperId: s2Paper?.paperId ?? null,
      citationCount: s2Paper?.citationCount ?? 0,
      influentialCitationCount: s2Paper?.influentialCitationCount ?? 0,
      referencesCount: 0,
    });
  }

  const output = { generatedAt: new Date().toISOString(), concepts: entries };
  await writeFile(CONCEPT_CITATIONS_FILE, JSON.stringify(output, null, 2));

  const found = entries.filter((e) => e.s2PaperId !== null).length;
  console.log(`\n\n✓ Enriched ${found}/${concepts.length} concepts with S2 data`);
  console.log(`  Written to ${CONCEPT_CITATIONS_FILE}`);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

const mode = process.argv[2];

if (mode === "--verify-wishlist") {
  await verifyWishlist();
} else if (mode === "--citation-velocity") {
  await citationVelocity();
} else if (mode === "--enrich-concepts") {
  await enrichConcepts();
} else {
  console.log("Usage:");
  console.log("  --verify-wishlist   Check unfound papers against Semantic Scholar + OpenAlex");
  console.log("  --citation-velocity Get citation velocity for trending ArXiv papers");
  console.log("  --enrich-concepts   Look up NIAC concepts on Semantic Scholar");
}

if (runErrors.length > 0) {
  console.log(`\n⚠ ${runErrors.length} errors:`);
  for (const e of runErrors) console.log(`  - ${e}`);
}
