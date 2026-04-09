/**
 * Tiny typed client for the NASA Technical Reports Server (NTRS) JSON API.
 *
 * Only the fields we actually consume are typed; everything else is left as
 * `unknown` so we don't pretend to know more about the upstream schema than
 * we do. The API is undocumented in places and changes shape occasionally —
 * keeping this surface narrow is deliberate.
 *
 * Endpoints:
 *   POST /api/citations/search   — paginated search, returns thin records
 *   GET  /api/citations/{id}     — full record including the abstract
 */

const NTRS_BASE = "https://ntrs.nasa.gov/api/citations";

/** Author entry as returned by NTRS, flattened to the bits we need. */
export interface NtrsAuthor {
  name: string;
  organization: string | null;
}

/** A single search-result row. Abstract is NOT populated here. */
export interface NtrsSearchHit {
  id: string;
  title: string;
  distributionDate: string | null;
  authors: NtrsAuthor[];
  keywords: string[];
  subjectCategories: string[];
  fundingNumbers: string[];
  stiType: string | null;
}

/** A full citation, fetched per-id. */
export interface NtrsCitation extends NtrsSearchHit {
  abstract: string;
  downloadUrls: string[];
  relatedIds: string[];
}

/**
 * Paginate through every search hit for a given query string. NTRS caps page
 * size at 100; we ask for 100 and stop when the server stops sending more.
 */
export async function* searchAll(
  query: string,
  pageSize = 100
): AsyncGenerator<NtrsSearchHit> {
  let from = 0;
  while (true) {
    const body = {
      q: query,
      size: pageSize,
      page: { size: pageSize, from },
    };
    const res = await fetch(`${NTRS_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`NTRS search failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      stats: { total: number };
      results: unknown[];
    };
    const results = json.results ?? [];
    for (const raw of results) {
      yield normalizeSearchHit(raw);
    }
    from += results.length;
    // Stop when the page is short (last page) or we've covered everything.
    if (results.length < pageSize || from >= json.stats.total) break;
  }
}

/** Fetch a full citation by id. Includes the abstract. */
export async function fetchCitation(id: string): Promise<NtrsCitation> {
  const res = await fetch(`${NTRS_BASE}/${id}`);
  if (!res.ok) {
    throw new Error(`NTRS citation ${id} failed: ${res.status}`);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  const hit = normalizeSearchHit(raw);
  return {
    ...hit,
    abstract: cleanText(raw.abstract as string | undefined) ?? "",
    downloadUrls: extractDownloadUrls(raw),
    relatedIds: extractRelatedIds(raw),
  };
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

function normalizeSearchHit(raw: unknown): NtrsSearchHit {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    title: cleanText(r.title as string | undefined) ?? "",
    distributionDate: (r.distributionDate as string | null) ?? null,
    authors: extractAuthors(r),
    keywords: extractKeywords(r),
    subjectCategories: Array.isArray(r.subjectCategories)
      ? (r.subjectCategories as string[])
      : [],
    fundingNumbers: extractFundingNumbers(r),
    stiType: (r.stiType as string | null) ?? null,
  };
}

function extractAuthors(r: Record<string, unknown>): NtrsAuthor[] {
  const aff = r.authorAffiliations;
  if (!Array.isArray(aff)) return [];
  return aff.map((entry) => {
    const meta = (entry as { meta?: Record<string, unknown> }).meta ?? {};
    const author = (meta.author as { name?: string } | undefined) ?? {};
    const org =
      (meta.organization as { name?: string } | undefined)?.name ?? null;
    return {
      name: (author.name ?? "").trim(),
      organization: org && org.trim() ? org.trim() : null,
    };
  });
}

function extractKeywords(r: Record<string, unknown>): string[] {
  const kws = r.keywords;
  if (!Array.isArray(kws)) return [];
  const seen = new Set<string>();
  for (const kw of kws as string[]) {
    const norm = kw.trim().toLowerCase();
    if (norm) seen.add(norm);
  }
  return [...seen];
}

function extractFundingNumbers(r: Record<string, unknown>): string[] {
  const fn = r.fundingNumbers;
  if (!Array.isArray(fn)) return [];
  return (fn as Array<{ number?: string }>)
    .map((f) => (f.number ?? "").trim())
    .filter(Boolean);
}

function extractDownloadUrls(r: Record<string, unknown>): string[] {
  const dl = r.downloads;
  if (!Array.isArray(dl)) return [];
  return (dl as Array<{ links?: { pdf?: string; original?: string } }>)
    .flatMap((d) => [d.links?.pdf, d.links?.original])
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map((u) => (u.startsWith("http") ? u : `https://ntrs.nasa.gov${u}`));
}

function extractRelatedIds(r: Record<string, unknown>): string[] {
  const rel = r.related;
  if (!Array.isArray(rel)) return [];
  return (rel as Array<{ id?: string | number }>)
    .map((x) => (x.id != null ? String(x.id) : ""))
    .filter(Boolean);
}

/**
 * Strip the MathML / XML markup that occasionally shows up in titles and
 * abstracts, collapse whitespace, and turn nullish into undefined.
 */
function cleanText(s: string | undefined): string | undefined {
  if (!s) return undefined;
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
