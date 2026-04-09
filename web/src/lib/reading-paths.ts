/**
 * Typed access to reading paths — curated narrative threads connecting
 * wishlist entries, topics, and NIAC concepts into coherent journeys.
 */

import type { ReadingPath, ReadingPathStep } from "../../../shared/reading-path.ts";
import rawPaths from "../../../data/reading-paths.json" with { type: "json" };
import { getConcept } from "./concepts.ts";
import { getTopic } from "../lib/topics.ts";
import { getWishlistEntry, displayYear } from "./wishlist.ts";

export const allReadingPaths: ReadingPath[] = rawPaths as ReadingPath[];

const bySlug = new Map<string, ReadingPath>();
for (const p of allReadingPaths) bySlug.set(p.slug, p);

/** O(1) lookup by slug. */
export function getReadingPath(slug: string): ReadingPath | undefined {
  return bySlug.get(slug);
}

/** Get related reading paths for the "keep reading" section. */
export function getRelatedPaths(path: ReadingPath): ReadingPath[] {
  return path.relatedPathSlugs
    .map((s) => bySlug.get(s))
    .filter((p): p is ReadingPath => p !== undefined);
}

/** Resolved display metadata for a single step. */
export interface ResolvedStep {
  title: string;
  href: string;
  eyebrow: string;
  type: "wishlist" | "concept" | "topic";
}

/** Resolve a step's reference to display metadata. */
export function resolveStep(step: ReadingPathStep): ResolvedStep | null {
  switch (step.type) {
    case "concept": {
      const c = getConcept(step.ref);
      if (!c) return null;
      return {
        title: c.title,
        href: `/concept/${c.slug}`,
        eyebrow: `NIAC${c.phase ? ` Phase ${c.phase}` : ""} · ${c.year}`,
        type: "concept",
      };
    }
    case "topic": {
      const t = getTopic(step.ref);
      if (!t) return null;
      return {
        title: t.title,
        href: `/topic/${t.slug}`,
        eyebrow: "Deep dive",
        type: "topic",
      };
    }
    case "wishlist": {
      const w = getWishlistEntry(step.ref);
      if (!w) {
        return {
          title: step.ref,
          href: `/wishlist#wishlist-${step.ref}`,
          eyebrow: "From the wishlist",
          type: "wishlist",
        };
      }
      return {
        title: w.title,
        href: `/wishlist#wishlist-${w.id}`,
        eyebrow: `${w.author} · ${displayYear(w.year)}`,
        type: "wishlist",
      };
    }
  }
}

/** Get all reading paths that include a given concept. */
export function pathsForConcept(slug: string): ReadingPath[] {
  return allReadingPaths.filter((p) =>
    p.steps.some((s) => s.type === "concept" && s.ref === slug)
  );
}

/** Get all reading paths that include a given wishlist entry. */
export function pathsForWishlistEntry(id: string): ReadingPath[] {
  return allReadingPaths.filter((p) =>
    p.steps.some((s) => s.type === "wishlist" && s.ref === id)
  );
}

export type { ReadingPath, ReadingPathStep };
