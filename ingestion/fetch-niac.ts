/**
 * Pull every NIAC-tagged citation from NTRS, fetch each full record for the
 * abstract, and write a normalized concepts.json the web app can consume.
 *
 * Run with:  node ingestion/fetch-niac.ts
 *
 * Strategy:
 *   1. Free-text search for "NIAC" — returns ~hundreds of hits, all relevant
 *      enough for v0. We'll tighten the filter (specific contract grant
 *      prefixes, NIAC funding source) in a later pass once we see what comes
 *      back.
 *   2. Resolve each hit to a full citation in parallel batches so we don't
 *      hammer NTRS but also don't take 20 minutes.
 *   3. Drop records with no abstract or no real authors — those are usually
 *      program-overview boilerplate, not actual concepts.
 *   4. Normalize into our shared Concept schema and write to disk.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Concept, Phase, Author } from "../shared/concept.ts";
import { makeSlug } from "../shared/concept.ts";
import { searchAll, fetchCitation, type NtrsCitation } from "./ntrs.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "data");
const OUT_FILE = join(OUT_DIR, "concepts.json");
const RAW_DIR = join(OUT_DIR, "raw");

/** How many citation fetches to run at once. NTRS is fine with this. */
const FETCH_CONCURRENCY = 8;

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(RAW_DIR, { recursive: true });

  console.log("→ searching NTRS for NIAC-tagged records...");
  const hits = [];
  for await (const hit of searchAll("NIAC")) {
    hits.push(hit);
  }
  console.log(`  found ${hits.length} hits`);

  console.log(`→ resolving full citations (concurrency ${FETCH_CONCURRENCY})...`);
  const full: NtrsCitation[] = [];
  let done = 0;
  await runBatched(hits, FETCH_CONCURRENCY, async (hit) => {
    try {
      const citation = await fetchCitation(hit.id);
      full.push(citation);
    } catch (err) {
      console.warn(`  ! ${hit.id}: ${(err as Error).message}`);
    } finally {
      done += 1;
      if (done % 25 === 0 || done === hits.length) {
        console.log(`  ${done}/${hits.length}`);
      }
    }
  });

  // Persist raw responses for reproducibility / future re-normalization.
  // Single file for cheap diffs; gitignored so it doesn't bloat the repo.
  await writeFile(
    join(RAW_DIR, "ntrs-niac.json"),
    JSON.stringify(full, null, 2)
  );

  console.log("→ normalizing into Concept schema...");
  const concepts = full
    .map(toConcept)
    .filter((c): c is Concept => c !== null)
    // Stable order: newest first, then by title.
    .sort(
      (a, b) =>
        b.year - a.year || a.title.localeCompare(b.title)
    );

  // Dedupe slugs in case two records collide on title+year.
  const seen = new Set<string>();
  for (const c of concepts) {
    let slug = c.slug;
    let i = 2;
    while (seen.has(slug)) slug = `${c.slug}-${i++}`;
    c.slug = slug;
    seen.add(slug);
  }

  await writeFile(OUT_FILE, JSON.stringify(concepts, null, 2));
  console.log(`✓ wrote ${concepts.length} concepts to ${OUT_FILE}`);

  // Quick sanity print so the run is self-evidencing in the terminal.
  for (const c of concepts.slice(0, 5)) {
    console.log(`  • [${c.year}] ${c.title}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Run an async map over an array with bounded concurrency. */
async function runBatched<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: concurrency }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]!);
    }
  });
  await Promise.all(lanes);
}

/**
 * Convert a raw NTRS citation into our shared Concept shape, or return null
 * if the record doesn't look like a real concept (no abstract, no authors).
 */
function toConcept(c: NtrsCitation): Concept | null {
  if (!c.title || !c.abstract || c.abstract.length < 80) return null;
  if (c.authors.length === 0) return null;

  const year = parseYear(c.distributionDate);
  if (year === null) return null;

  const phase = inferPhase(c);

  const authors: Author[] = c.authors.map((a, i) => ({
    name: a.name,
    organization: a.organization,
    isPI: i === 0,
  }));

  return {
    slug: makeSlug(c.title, year),
    source: "NIAC",
    sourceId: c.id,
    title: c.title,
    year,
    phase,
    authors,
    abstract: c.abstract,
    subjects: c.subjectCategories,
    keywords: c.keywords,
    fundingNumbers: c.fundingNumbers,
    sourceUrl: `https://ntrs.nasa.gov/citations/${c.id}`,
    downloadUrls: c.downloadUrls,
    relatedSourceIds: c.relatedIds,
  };
}

function parseYear(date: string | null): number | null {
  if (!date) return null;
  const y = Number(date.slice(0, 4));
  return Number.isFinite(y) && y > 1990 && y < 2100 ? y : null;
}

/**
 * Best-effort phase detection. NTRS doesn't expose phase as a structured
 * field, so we sniff title and keywords. Imperfect but good enough for v0,
 * and easy to override later from a hand-curated mapping.
 */
function inferPhase(c: NtrsCitation): Phase | null {
  const haystack = [
    c.title,
    ...c.keywords,
    ...c.fundingNumbers,
  ]
    .join(" ")
    .toLowerCase();
  if (/\bphase\s*iii\b|\bphase\s*3\b/.test(haystack)) return "III";
  if (/\bphase\s*ii\b|\bphase\s*2\b/.test(haystack)) return "II";
  if (/\bphase\s*i\b|\bphase\s*1\b/.test(haystack)) return "I";
  return null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
