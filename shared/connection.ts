/**
 * A connection links a historical wishlist entry to a modern NIAC concept,
 * with an editorial thread explaining how they relate across time.
 */
export interface Connection {
  /** Unique identifier. */
  id: string;
  /** The wishlist entry ID (e.g., "euclid-elements"). */
  wishlistId: string;
  /** The concept slug (e.g., "direct-multipixel-imaging-..."). */
  conceptSlug: string;
  /** Editorial thread — how these two things connect across centuries. */
  thread: string;
  /**
   * Connection strength.
   * "direct" = the concept explicitly builds on this work's lineage.
   * "thematic" = they share a field or method but the link is intellectual.
   */
  strength: "direct" | "thematic";
}
