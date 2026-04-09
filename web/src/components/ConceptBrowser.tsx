/**
 * ConceptBrowser — interactive search and filter UI for the atlas.
 *
 * Hydrated as a client island from the homepage. Receives the entire concept
 * corpus as a prop (it's only ~600KB, smaller than a hero image, and it's
 * already in the page bundle anyway), and filters in memory as the user
 * types or toggles chips. No network calls, no debouncing needed at this
 * size — array.filter on a few hundred records is sub-millisecond.
 *
 * Design rules:
 *   - The filters are *always visible*, not hidden in a drawer. The atlas is
 *     about discovery, and discovery only happens when affordances are loud.
 *   - Result count updates live as you type so you can feel the search
 *     working. Empty state has a personality, not a sad-face.
 *   - The list itself stays grouped by year (matches the static version)
 *     so the visual rhythm is preserved when filters are off.
 */

import { useEffect, useMemo, useState } from "react";
import type { Concept, Phase } from "../../../shared/concept.ts";

interface Props {
  concepts: Concept[];
}

const PHASES: Array<Phase | "any"> = ["any", "I", "II", "III"];

export default function ConceptBrowser({ concepts }: Props) {
  // Initial state is read from the URL so deep links from /subjects (which
  // sends ?q=<label>) and shared links (?phase=II&from=2020) pre-fill the
  // controls. Lazy initializers run once per mount; SSR sees the empty
  // defaults and the client island re-runs them on hydration.
  const [query, setQuery] = useState(() => initialParam("q") ?? "");
  const [phase, setPhase] = useState<Phase | "any">(
    () => (initialParam("phase") as Phase | null) ?? "any"
  );
  const [yearMin, setYearMin] = useState<number | null>(() => {
    const v = initialParam("from");
    return v && /^\d+$/.test(v) ? Number(v) : null;
  });

  /** Distinct years present in the corpus, sorted ascending. */
  const years = useMemo(() => {
    const s = new Set(concepts.map((c) => c.year));
    return [...s].sort((a, b) => a - b);
  }, [concepts]);

  const minYear = years[0]!;
  const maxYear = years[years.length - 1]!;

  // Mirror current filter state back into the URL (replaceState, no history
  // entries) so the page is sharable/bookmarkable at any moment. We strip
  // empty params so a fresh visit doesn't accumulate cruft.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (phase !== "any") params.set("phase", phase);
    if (yearMin !== null) params.set("from", String(yearMin));
    const qs = params.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [query, phase, yearMin]);

  /** Filtered list. Recomputed any time inputs change — cheap at this size. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return concepts.filter((c) => {
      if (phase !== "any" && c.phase !== phase) return false;
      if (yearMin !== null && c.year < yearMin) return false;
      if (q.length > 0) {
        const haystack = (
          c.title +
          " " +
          c.abstract +
          " " +
          c.authors.map((a) => a.name + " " + (a.organization ?? "")).join(" ")
        ).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [concepts, query, phase, yearMin]);

  /** Group filtered results by year for the rendered list. */
  const byYear = useMemo(() => {
    const m = new Map<number, Concept[]>();
    for (const c of filtered) {
      const list = m.get(c.year) ?? [];
      list.push(c);
      m.set(c.year, list);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  return (
    <div>
      {/* ----------------------------------------------------------- */}
      {/* Controls                                                    */}
      {/* ----------------------------------------------------------- */}
      <div className="mb-10 space-y-4">
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 188 concepts — try 'tether', 'venus', 'fission'…"
            className="w-full bg-transparent border rounded px-4 py-3 text-base focus:outline-none focus:border-amber-400"
            style={{
              borderColor: "var(--color-paper-edge)",
              fontFamily: "var(--font-mono)",
              color: "var(--color-ink)",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest hover:text-white"
              style={{
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              clear
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="uppercase tracking-widest"
              style={{
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Phase
            </span>
            {PHASES.map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className="px-2 py-1 rounded border transition"
                style={{
                  borderColor:
                    phase === p
                      ? "var(--color-accent)"
                      : "var(--color-paper-edge)",
                  color:
                    phase === p
                      ? "var(--color-accent)"
                      : "var(--color-ink-dim)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {p === "any" ? "any" : p}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span
              className="uppercase tracking-widest"
              style={{
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              From
            </span>
            <select
              value={yearMin ?? ""}
              onChange={(e) =>
                setYearMin(e.target.value ? Number(e.target.value) : null)
              }
              className="bg-transparent border rounded px-2 py-1"
              style={{
                borderColor: "var(--color-paper-edge)",
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <option value="">any year</option>
              {years.map((y) => (
                <option key={y} value={y} style={{ background: "#15151a" }}>
                  {y} →
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto">
            <span
              style={{
                color:
                  filtered.length === concepts.length
                    ? "var(--color-ink-dim)"
                    : "var(--color-accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {filtered.length} / {concepts.length}
            </span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- */}
      {/* Results                                                     */}
      {/* ----------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <div
          className="py-20 text-center"
          style={{
            color: "var(--color-ink-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div className="text-4xl mb-3">∅</div>
          <p className="text-sm">
            no concepts match. try a different word, or clear the filters.
          </p>
        </div>
      ) : (
        byYear.map(([year, list]) => (
          <div key={year} className="mb-12">
            <h4
              className="text-sm mb-4 pb-2 border-b"
              style={{
                color: "var(--color-ink-dim)",
                borderColor: "var(--color-paper-edge)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {year}
              <span className="ml-2">— {list.length}</span>
            </h4>
            <ul className="space-y-6">
              {list.map((c) => (
                <li key={c.slug}>
                  <a href={`/concept/${c.slug}`} className="block group">
                    <div
                      className="text-xs mb-1"
                      style={{
                        color: "var(--color-ink-dim)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {c.phase && (
                        <span style={{ color: "var(--color-accent)" }}>
                          Phase {c.phase} ·{" "}
                        </span>
                      )}
                      {authorLine(c)}
                    </div>
                    <h5 className="text-lg font-medium leading-snug group-hover:underline">
                      {c.title}
                    </h5>
                    <p
                      className="mt-2 text-sm leading-relaxed"
                      style={{ color: "var(--color-ink-dim)" }}
                    >
                      {excerpt(c.abstract, 220, q(query))}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local helpers — duplicated from lib/concepts.ts so this component can run  */
/* in the React island bundle without dragging the Astro server-only loader.  */
/* -------------------------------------------------------------------------- */

function q(s: string): string {
  return s.trim().toLowerCase();
}

/** Read a single URL query param on mount. Returns null on SSR. */
function initialParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

function excerpt(text: string, maxChars: number, query: string): string {
  // If a query is active, try to center the excerpt around the first match
  // so the user sees *why* this row was returned.
  if (query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx > maxChars / 2) {
      const start = Math.max(0, idx - 60);
      const slice = text.slice(start, start + maxChars);
      return "…" + slice.replace(/\s+\S*$/, "") + "…";
    }
  }
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastPeriod = slice.lastIndexOf(". ");
  if (lastPeriod > maxChars * 0.6) return slice.slice(0, lastPeriod + 1);
  return slice.replace(/\s+\S*$/, "") + "…";
}

function authorLine(concept: Concept): string {
  const authors = concept.authors.slice(0, 3);
  const parts = authors.map((a) =>
    a.organization ? `${a.name}, ${a.organization}` : a.name
  );
  if (concept.authors.length > 3) {
    parts.push(`+${concept.authors.length - 3} more`);
  }
  return parts.join(" · ");
}
