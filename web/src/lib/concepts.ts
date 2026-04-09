/**
 * Typed access to the concepts corpus.
 *
 * The source of truth for concept data lives in `../../data/concepts.json`,
 * produced by `ingestion/fetch-niac.ts`. We import it directly so Astro can
 * statically generate every concept page at build time — no runtime DB,
 * no fetch calls, no infrastructure.
 *
 * This module also computes a number of derived views (stats, subject index,
 * related-concepts edges) at module load time. Because we're statically
 * rendering, this happens once during the build, not per request.
 */

import type { Concept, Phase } from "../../../shared/concept.ts";
import rawConcepts from "../../../data/concepts.json" with { type: "json" };

/** All concepts, in the order produced by ingestion (newest first). */
export const allConcepts: Concept[] = rawConcepts as Concept[];

/* -------------------------------------------------------------------------- */
/* Lookups                                                                    */
/* -------------------------------------------------------------------------- */

const bySlug = new Map<string, Concept>();
for (const c of allConcepts) bySlug.set(c.slug, c);

/** O(1) lookup by slug. Returns undefined if missing. */
export function getConcept(slug: string): Concept | undefined {
  return bySlug.get(slug);
}

/* -------------------------------------------------------------------------- */
/* Featured                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The hero concept on the homepage. Picks the first concept whose title or
 * keywords mention "tether" — the through-line of the conversation that
 * birthed this project. Falls back to the first concept overall.
 */
export function getFeaturedConcept(): Concept {
  const tetherConcept = allConcepts.find(
    (c) =>
      c.title.toLowerCase().includes("tether") ||
      c.keywords.some((k) => k.includes("tether"))
  );
  return tetherConcept ?? allConcepts[0]!;
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

export interface AtlasStats {
  totalConcepts: number;
  totalPIs: number;
  totalOrgs: number;
  yearMin: number;
  yearMax: number;
  byPhase: Record<string, number>;
  byYear: Record<number, number>;
  topOrgs: Array<{ name: string; count: number }>;
}

/** Computed once at module load — cheap because the corpus is small. */
export const stats: AtlasStats = computeStats();

function computeStats(): AtlasStats {
  const pis = new Set<string>();
  const orgs = new Map<string, number>();
  const byPhase: Record<string, number> = { I: 0, II: 0, III: 0, unknown: 0 };
  const byYear: Record<number, number> = {};
  let yearMin = Infinity;
  let yearMax = -Infinity;

  for (const c of allConcepts) {
    yearMin = Math.min(yearMin, c.year);
    yearMax = Math.max(yearMax, c.year);
    byYear[c.year] = (byYear[c.year] ?? 0) + 1;
    byPhase[c.phase ?? "unknown"] =
      (byPhase[c.phase ?? "unknown"] ?? 0) + 1;

    for (const a of c.authors) {
      if (a.isPI) pis.add(a.name);
      if (a.organization) {
        orgs.set(a.organization, (orgs.get(a.organization) ?? 0) + 1);
      }
    }
  }

  const topOrgs = [...orgs.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    totalConcepts: allConcepts.length,
    totalPIs: pis.size,
    totalOrgs: orgs.size,
    yearMin,
    yearMax,
    byPhase,
    byYear,
    topOrgs,
  };
}

/* -------------------------------------------------------------------------- */
/* Subject + keyword index                                                    */
/* -------------------------------------------------------------------------- */

export interface TopicEntry {
  /** Display label as it will appear in the UI. */
  label: string;
  /** Slug used in URLs. */
  slug: string;
  /** How many concepts mention this topic. */
  count: number;
  /** Whether this came from `subjects` (broader) or `keywords` (narrower). */
  kind: "subject" | "keyword";
}

const topicMap = new Map<string, TopicEntry>();

for (const c of allConcepts) {
  for (const s of c.subjects) recordTopic(s, "subject");
  for (const k of c.keywords) {
    // Filter noise: drop very short or pure-numeric keywords.
    const trimmed = k.trim();
    if (trimmed.length < 4) continue;
    if (/^\d+$/.test(trimmed)) continue;
    recordTopic(trimmed, "keyword");
  }
}

function recordTopic(label: string, kind: "subject" | "keyword"): void {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) return;
  const existing = topicMap.get(slug);
  if (existing) {
    existing.count += 1;
  } else {
    topicMap.set(slug, { label: label.trim(), slug, count: 1, kind });
  }
}

/** All topics sorted by count descending. */
export const allTopics: TopicEntry[] = [...topicMap.values()].sort(
  (a, b) => b.count - a.count
);

/* -------------------------------------------------------------------------- */
/* Related concepts                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Compute the top-N most-related concepts to a given one, using a cheap
 * weighted overlap of:
 *   - shared keywords  (strongest signal — these are hand-tagged)
 *   - shared subjects  (broader, weaker signal)
 *   - shared PI         (research lineage)
 *   - same year         (slight contextual bonus)
 *
 * This is a placeholder for proper embedding-based similarity (session 3).
 * Even in placeholder form it picks up real relationships — the tether
 * concepts cluster, the lunar concepts cluster, etc.
 */
export function getRelatedConcepts(slug: string, k = 5): Concept[] {
  const target = getConcept(slug);
  if (!target) return [];

  const targetKw = new Set(target.keywords);
  const targetSubj = new Set(target.subjects);
  const targetPI = target.authors.find((a) => a.isPI)?.name ?? "";

  const scored = allConcepts
    .filter((c) => c.slug !== slug)
    .map((c) => {
      let score = 0;
      for (const kw of c.keywords) if (targetKw.has(kw)) score += 3;
      for (const s of c.subjects) if (targetSubj.has(s)) score += 1;
      const pi = c.authors.find((a) => a.isPI)?.name ?? "";
      if (pi && pi === targetPI) score += 4;
      if (c.year === target.year) score += 0.5;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((x) => x.c);
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Trim an abstract down to a card-sized excerpt at a sentence boundary. */
export function excerpt(text: string, maxChars = 240): string {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastPeriod = slice.lastIndexOf(". ");
  if (lastPeriod > maxChars * 0.6) return slice.slice(0, lastPeriod + 1);
  return slice.replace(/\s+\S*$/, "") + "…";
}

/**
 * Pick the most "quotable" sentence from an abstract: prefer a sentence in
 * the second half (the meat usually comes after the setup), of medium length
 * (~80–180 chars), and bias toward sentences that contain words like "could",
 * "would", "imagine", "enable" — verbs that signal vision.
 */
export function pullQuote(abstract: string): string {
  const sentences = abstract
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 60 && s.length < 240);
  if (sentences.length === 0) return excerpt(abstract, 200);

  const visionWords =
    /\b(could|would|enable|imagine|allow|first|unprecedented|revolutionary|breakthrough|new|novel|transform|unlock)\b/i;

  const scored = sentences.map((s, i) => ({
    s,
    score:
      (visionWords.test(s) ? 3 : 0) +
      (i >= sentences.length / 2 ? 1 : 0) +
      (s.length > 100 && s.length < 200 ? 1 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.s;
}

/** Format an author line: "Name, Org · Name, Org" — truncates after 3. */
export function authorLine(concept: Concept): string {
  const authors = concept.authors.slice(0, 3);
  const parts = authors.map((a) =>
    a.organization ? `${a.name}, ${a.organization}` : a.name
  );
  if (concept.authors.length > 3) {
    parts.push(`+${concept.authors.length - 3} more`);
  }
  return parts.join(" · ");
}

/** Just the lead PI name + org for a tighter byline. */
export function piLine(concept: Concept): string {
  const pi = concept.authors[0];
  if (!pi) return "";
  return pi.organization ? `${pi.name}, ${pi.organization}` : pi.name;
}

export type { Concept, Phase };
