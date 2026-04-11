/**
 * Typed access to citation velocity and concept citation data.
 *
 * Source of truth: `data/citation-velocity.json` and `data/concept-citations.json`,
 * produced by `ingestion/fetch-literature.ts`.
 * Falls back gracefully if files don't exist yet.
 */

export interface CitationVelocity {
  arxivId: string;
  title: string;
  citationCount: number;
  influentialCitationCount: number;
  monthsSincePublication: number;
  velocity: number;
}

export interface ConceptCitation {
  slug: string;
  s2PaperId: string | null;
  citationCount: number;
  influentialCitationCount: number;
  referencesCount: number;
}

// Lazy-load citation data — files may not exist yet
let _velocityData: CitationVelocity[] | null = null;
let _conceptData: ConceptCitation[] | null = null;

async function loadVelocity(): Promise<CitationVelocity[]> {
  if (_velocityData) return _velocityData;
  try {
    const mod = await import("../../../data/citation-velocity.json", { with: { type: "json" } });
    _velocityData = (mod.default as { papers: CitationVelocity[] }).papers;
  } catch {
    _velocityData = [];
  }
  return _velocityData;
}

async function loadConceptCitations(): Promise<ConceptCitation[]> {
  if (_conceptData) return _conceptData;
  try {
    const mod = await import("../../../data/concept-citations.json", { with: { type: "json" } });
    _conceptData = (mod.default as { concepts: ConceptCitation[] }).concepts;
  } catch {
    _conceptData = [];
  }
  return _conceptData;
}

/** Get citation velocity for a specific ArXiv paper. */
export async function getCitationVelocity(arxivId: string): Promise<CitationVelocity | undefined> {
  const data = await loadVelocity();
  return data.find((d) => d.arxivId === arxivId);
}

/** Get citation data for a specific NIAC concept. */
export async function getConceptCitations(slug: string): Promise<ConceptCitation | undefined> {
  const data = await loadConceptCitations();
  return data.find((d) => d.slug === slug);
}

/** Top papers by citation velocity. */
export async function getTopByVelocity(limit = 10): Promise<CitationVelocity[]> {
  const data = await loadVelocity();
  return data.slice(0, limit);
}
