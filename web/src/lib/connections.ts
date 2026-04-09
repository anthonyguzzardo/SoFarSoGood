/**
 * Typed access to connections — the bridges between historical wishlist
 * entries and modern NIAC concepts. Each connection has an editorial thread
 * explaining how ideas separated by centuries relate to each other.
 */

import type { Connection } from "../../../shared/connection.ts";
import rawConnections from "../../../data/connections.json" with { type: "json" };

export const allConnections: Connection[] = rawConnections as Connection[];

// Build bidirectional indexes at module load
const byWishlistId = new Map<string, Connection[]>();
const byConceptSlug = new Map<string, Connection[]>();

for (const conn of allConnections) {
  const wList = byWishlistId.get(conn.wishlistId) ?? [];
  wList.push(conn);
  byWishlistId.set(conn.wishlistId, wList);

  const cList = byConceptSlug.get(conn.conceptSlug) ?? [];
  cList.push(conn);
  byConceptSlug.set(conn.conceptSlug, cList);
}

/** All connections from a wishlist entry to NIAC concepts. */
export function getConceptsForWishlistEntry(wishlistId: string): Connection[] {
  return byWishlistId.get(wishlistId) ?? [];
}

/** All connections from a NIAC concept back to wishlist entries. */
export function getWishlistForConcept(conceptSlug: string): Connection[] {
  return byConceptSlug.get(conceptSlug) ?? [];
}

export const connectionStats = {
  total: allConnections.length,
  direct: allConnections.filter((c) => c.strength === "direct").length,
  thematic: allConnections.filter((c) => c.strength === "thematic").length,
  wishlistEntriesConnected: byWishlistId.size,
  conceptsConnected: byConceptSlug.size,
};

export type { Connection };
