/**
 * A reading path is a curated narrative thread connecting wishlist entries,
 * topic deep dives, and NIAC concepts into a coherent journey through time.
 *
 * Example: "From Dark Stars to Gravitational Lensing" traces a line from
 * Michell's 1783 prediction of invisible stars through Einstein's general
 * relativity to a NIAC-funded mission to use the Sun as a telescope lens.
 */

export interface ReadingPathStep {
  /** What type of item this step references. */
  type: "wishlist" | "concept" | "topic";
  /** The ID (wishlist) or slug (concept/topic) of the referenced item. */
  ref: string;
  /** Editorial narration — why we're taking the reader here next. */
  narration: string;
  /** Optional pull quote from the source material. */
  pullQuote?: string;
}

export interface ReadingPath {
  /** URL slug for this path. */
  slug: string;
  /** Display title. */
  title: string;
  /** One-sentence description for cards and meta. */
  subtitle: string;
  /** Opening narration — sets the stage before the first step. */
  intro: string;
  /** Ordered sequence of steps. */
  steps: ReadingPathStep[];
  /** Closing narration — reflection, open questions, what to explore next. */
  outro: string;
  /** Related path slugs for "keep reading" suggestions. */
  relatedPathSlugs: string[];
  /** Tags for filtering and discovery. */
  tags: string[];
}
