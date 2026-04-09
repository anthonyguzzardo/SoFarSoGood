/**
 * Canonical schema for a NIAC concept (or any speculative-aerospace concept
 * we ingest from a funding program). Shared between the ingestion scripts
 * and the Astro web app.
 *
 * Designed to be a superset that fits NIAC v0 and the eventual DARPA / ESA /
 * JAXA expansion. Fields that don't apply to a given source are simply null.
 */

/** A single author or principal investigator on a concept. */
export interface Author {
  /** Full display name as given by the source ("Saptarshi Bandyopadhyay"). */
  name: string;
  /** Affiliated organization at the time of the work, if known. */
  organization: string | null;
  /** Whether this person is the lead PI for the concept. */
  isPI: boolean;
}

/** Funding phase within a program (NIAC has Phase I, II, III). */
export type Phase = "I" | "II" | "III" | "Other";

/**
 * A single concept record. The unit of the atlas — one row per imagined-future
 * we want users to be able to discover, read, and connect to others.
 */
export interface Concept {
  /** Stable URL slug, derived from title + year. */
  slug: string;

  /** Source program (NIAC, DARPA, ESA-GSP, ...). */
  source: "NIAC";

  /** Upstream record id, used to dedupe and re-fetch. */
  sourceId: string;

  /** Concept title as published. */
  title: string;

  /** Year of the most recent / primary publication for this concept. */
  year: number;

  /** Funding phase if known (NIAC Phase I/II/III). */
  phase: Phase | null;

  /** All credited authors; the first is treated as the lead PI. */
  authors: Author[];

  /**
   * The abstract / summary text. Markdown-safe plain text — strip MathML and
   * weird XML markup at ingestion time so the web app can render it directly.
   */
  abstract: string;

  /** Subject area tags from the source ("Space Sciences (General)", ...). */
  subjects: string[];

  /** Keywords from the source, normalized (trimmed, deduped, lowercased). */
  keywords: string[];

  /**
   * Funding numbers / contract grants, useful for tracking which Phase a
   * concept is in and for grouping concepts by award.
   */
  fundingNumbers: string[];

  /** Canonical URL on the source site (NTRS, etc.). */
  sourceUrl: string;

  /** Direct link(s) to PDF or other downloadable artifacts, if available. */
  downloadUrls: string[];

  /**
   * Related upstream record IDs declared by the source. We'll later augment
   * these with our own embedding-based "related" links — those live in a
   * separate table, not on the concept itself.
   */
  relatedSourceIds: string[];

  /**
   * Editorially curated "what if it works" payoff line. A punchy one-liner
   * capturing the stakes of this concept.
   * Example: "If solar gravitational lensing works, we can image exoplanet
   * continents at 25 km resolution."
   * Populated via data/editorial.json overlay, not the ingestion pipeline.
   */
  whatIfItWorks?: string;

  /**
   * Editorial tier for display priority.
   * "spotlight" = handpicked for homepage hero rotation.
   * "highlight" = strong enough for editor's picks section.
   */
  editorialTier?: "spotlight" | "highlight";
}

/**
 * Light-touch slugify: lowercase, alphanumerics + dashes, collapse runs,
 * trim, suffix the year for disambiguation.
 */
export function makeSlug(title: string, year: number): string {
  const base = title
    .toLowerCase()
    .replace(/<[^>]+>/g, " ") // strip any HTML/MathML
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base}-${year}`;
}
