/**
 * Typed access to concept similarity data.
 *
 * Source of truth: `data/concept-similarities.json`, produced by
 * `ingestion/build-embeddings.ts`. Falls back gracefully if the file
 * doesn't exist yet (returns empty arrays).
 */

let rawSimilarities: {
  method: string;
  generatedAt: string;
  threshold: number;
  edges: { source: string; target: string; similarity: number }[];
};

try {
  const mod = await import("../../../data/concept-similarities.json", { with: { type: "json" } });
  rawSimilarities = mod.default as typeof rawSimilarities;
} catch {
  // File doesn't exist yet — that's fine, return empty data
  rawSimilarities = { method: "none", generatedAt: "", threshold: 0, edges: [] };
}

export interface SimilarityEdge {
  source: string;
  target: string;
  similarity: number;
}

/** All similarity edges, sorted by similarity descending. */
export const allEdges: SimilarityEdge[] = rawSimilarities.edges;

/** Method used to compute similarities ("tfidf" or "sentence-transformer"). */
export const similarityMethod: string = rawSimilarities.method;

/** Pre-built adjacency index for O(1) lookups. */
const adjacency = new Map<string, { slug: string; similarity: number }[]>();
for (const edge of allEdges) {
  if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
  if (!adjacency.has(edge.target)) adjacency.set(edge.target, []);
  adjacency.get(edge.source)!.push({ slug: edge.target, similarity: edge.similarity });
  adjacency.get(edge.target)!.push({ slug: edge.source, similarity: edge.similarity });
}

/**
 * Get the most similar concepts to a given slug.
 * Returns neighbors sorted by similarity, descending.
 */
export function getSimilarConcepts(
  slug: string,
  limit = 8,
): { slug: string; similarity: number }[] {
  const neighbors = adjacency.get(slug) ?? [];
  return [...neighbors].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/**
 * All edges — for graph visualization (Atlas, ConceptNeighborhood).
 */
export function getConceptEdges(): SimilarityEdge[] {
  return allEdges;
}
