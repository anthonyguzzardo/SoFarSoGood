/**
 * Typed access to the pantheon (legendary scientists) data.
 *
 * Source of truth: `data/pantheon.json`.
 * Statically imported so Astro builds the page at build time.
 */

import rawPantheon from "../../../data/pantheon.json" with { type: "json" };

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface PantheonMedia {
  type: "youtube";
  id: string;
  title: string;
}

export type TierKey = "untouchable" | "absolute-unit" | "built-different";

export interface Titan {
  slug: string;
  name: string;
  born: number;
  died: number | null;
  fields: string[];
  tier: TierKey;
  nationality: string;
  signature: string;
  tagline: string;
  quote: string;
  quoteContext: string;
  powerMoves: string[];
  funFact: string;
  influences: string[];
  influenced: string[];
  rivalries: string[];
  media: PantheonMedia[];
}

export interface TierMeta {
  label: string;
  subtitle: string;
  order: number;
}

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const data = rawPantheon as {
  titans: Titan[];
  tiers: Record<TierKey, TierMeta>;
};

export const allTitans: Titan[] = data.titans;
export const tierMeta: Record<TierKey, TierMeta> = data.tiers;

/** Titans grouped by tier, in tier order. */
export function titansByTier(): { tier: TierKey; meta: TierMeta; titans: Titan[] }[] {
  const grouped = new Map<TierKey, Titan[]>();
  for (const t of allTitans) {
    const list = grouped.get(t.tier) ?? [];
    list.push(t);
    grouped.set(t.tier, list);
  }

  return (Object.entries(tierMeta) as [TierKey, TierMeta][])
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, meta]) => ({
      tier: key,
      meta,
      titans: grouped.get(key) ?? [],
    }));
}

/** Get a single titan by slug. */
export function getTitan(slug: string): Titan | undefined {
  return allTitans.find((t) => t.slug === slug);
}

/** Lifespan string, e.g. "1879 – 1955" or "1931 – present" */
export function lifespan(t: Titan): string {
  return `${t.born}\u2009\u2013\u2009${t.died ?? "present"}`;
}

/** Get all titans connected via influences/influenced — resolved to full objects. */
export function getConnectedTitans(slug: string): { influences: Titan[]; influenced: Titan[] } {
  const titan = getTitan(slug);
  if (!titan) return { influences: [], influenced: [] };
  return {
    influences: titan.influences.map(getTitan).filter((t): t is Titan => !!t),
    influenced: titan.influenced.map(getTitan).filter((t): t is Titan => !!t),
  };
}

/** Prev/next titan within the same tier, for page navigation. */
export function titanNavigation(slug: string): { prev: Titan | null; next: Titan | null } {
  const titan = getTitan(slug);
  if (!titan) return { prev: null, next: null };
  const sameTier = allTitans.filter((t) => t.tier === titan.tier);
  const idx = sameTier.findIndex((t) => t.slug === slug);
  return {
    prev: idx > 0 ? sameTier[idx - 1] : null,
    next: idx < sameTier.length - 1 ? sameTier[idx + 1] : null,
  };
}

/** Field badges */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    physics: "Physics",
    mathematics: "Mathematics",
    chemistry: "Chemistry",
    "computer science": "Computer Science",
    cosmology: "Cosmology",
    optics: "Optics",
    astronomy: "Astronomy",
  };
  return labels[field] ?? field;
}
