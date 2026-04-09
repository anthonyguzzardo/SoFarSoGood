/**
 * WishlistBrowser — interactive filtered view of the paper wishlist.
 *
 * Hydrated as a React island. Shows every paper humanity has produced that
 * we want indexed, filterable by era, field, and search query. Grouped by
 * era for chronological browsing.
 */

import { useCallback, useMemo, useState } from "react";

interface WishlistEntry {
  id: string;
  title: string;
  author: string;
  year: number;
  field: string;
  subfield: string;
  significance: string;
  era: string;
  importance: string;
  status: string;
  source: string;
  modernRelevance?: string;
  relatedWishlistIds?: string[];
}

interface Props {
  entries: WishlistEntry[];
  eras: string[];
  fields: string[];
  eraLabels: Record<string, string>;
  fieldLabels: Record<string, string>;
}

function displayYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

export default function WishlistBrowser({
  entries,
  eras,
  fields,
  eraLabels,
  fieldLabels,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedEra, setSelectedEra] = useState<string>("all");
  const [selectedField, setSelectedField] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const REPO = "anthonyguzzardo/niac-atlas";

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (selectedEra !== "all" && e.era !== selectedEra) return false;
      if (selectedField !== "all" && e.field !== selectedField) return false;
      if (q.length > 0) {
        const haystack = (
          e.title +
          " " +
          e.author +
          " " +
          e.significance +
          " " +
          e.subfield
        ).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, selectedEra, selectedField]);

  const byEra = useMemo(() => {
    const m = new Map<string, WishlistEntry[]>();
    for (const e of filtered) {
      const list = m.get(e.era) ?? [];
      list.push(e);
      m.set(e.era, list);
    }
    // Sort eras in chronological order
    return eras
      .filter((era) => m.has(era))
      .map((era) => [era, m.get(era)!] as const);
  }, [filtered, eras]);

  return (
    <div>
      {/* Controls */}
      <div className="mb-10 space-y-4">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try 'Einstein', 'calculus', 'DNA', 'black hole'…"
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

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-xs">
          {/* Era filter */}
          <div className="flex items-center gap-2">
            <span
              className="uppercase tracking-widest"
              style={{
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Era
            </span>
            <select
              value={selectedEra}
              onChange={(e) => setSelectedEra(e.target.value)}
              className="bg-transparent border rounded px-2 py-1"
              style={{
                borderColor: "var(--color-paper-edge)",
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <option value="all" style={{ background: "#15151a" }}>
                all eras
              </option>
              {eras.map((era) => (
                <option key={era} value={era} style={{ background: "#15151a" }}>
                  {eraLabels[era] ?? era}
                </option>
              ))}
            </select>
          </div>

          {/* Field filter */}
          <div className="flex items-center gap-2">
            <span
              className="uppercase tracking-widest"
              style={{
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Field
            </span>
            <select
              value={selectedField}
              onChange={(e) => setSelectedField(e.target.value)}
              className="bg-transparent border rounded px-2 py-1"
              style={{
                borderColor: "var(--color-paper-edge)",
                color: "var(--color-ink-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <option value="all" style={{ background: "#15151a" }}>
                all fields
              </option>
              {fields.map((f) => (
                <option key={f} value={f} style={{ background: "#15151a" }}>
                  {fieldLabels[f] ?? f}
                </option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div className="ml-auto">
            <span
              style={{
                color:
                  filtered.length === entries.length
                    ? "var(--color-ink-dim)"
                    : "var(--color-accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {filtered.length} / {entries.length}
            </span>
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div
          className="py-20 text-center"
          style={{
            color: "var(--color-ink-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div className="text-4xl mb-3">&#8709;</div>
          <p className="text-sm">
            no papers match. try a different search, or clear the filters.
          </p>
        </div>
      ) : (
        byEra.map(([era, list]) => (
          <div key={era} className="mb-14">
            <h4
              className="text-sm mb-6 pb-2 border-b"
              style={{
                color: "var(--color-accent)",
                borderColor: "var(--color-paper-edge)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {eraLabels[era] ?? era}
              <span
                style={{ color: "var(--color-ink-dim)" }}
                className="ml-2"
              >
                — {list.length} {list.length === 1 ? "paper" : "papers"}
              </span>
            </h4>
            <ul className="space-y-6">
              {list.map((e) => (
                <li
                  key={e.id}
                  id={`wishlist-${e.id}`}
                  className="rounded-lg border transition-all duration-300"
                  style={{
                    borderColor: expandedId === e.id ? "var(--color-accent)" : "var(--color-paper-edge)",
                    background: "var(--color-paper-raised)",
                  }}
                >
                  {/* Clickable header */}
                  <button
                    type="button"
                    className="w-full text-left p-5 cursor-pointer rounded-lg transition-colors duration-150"
                    style={{
                      background: expandedId === e.id ? "transparent" : "transparent",
                    }}
                    onMouseEnter={(ev) => {
                      ev.currentTarget.style.background = "rgba(255, 255, 255, 0.02)";
                    }}
                    onMouseLeave={(ev) => {
                      ev.currentTarget.style.background = "transparent";
                    }}
                    onClick={() => toggleExpand(e.id)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <h5
                        className="text-base font-medium leading-snug"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {e.title}
                      </h5>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="px-2 py-0.5 rounded text-xs uppercase tracking-wider"
                          style={{
                            fontFamily: "var(--font-mono)",
                            color:
                              e.status === "wanted"
                                ? "var(--color-ink-dim)"
                                : e.status === "acquired"
                                  ? "var(--color-accent)"
                                  : "#4ade80",
                            borderWidth: 1,
                            borderColor:
                              e.status === "wanted"
                                ? "var(--color-paper-edge)"
                                : e.status === "acquired"
                                  ? "rgba(255, 184, 77, 0.3)"
                                  : "rgba(74, 222, 128, 0.3)",
                          }}
                        >
                          {e.status}
                        </span>
                        <span
                          className="text-xs transition-transform duration-200"
                          style={{
                            color: "var(--color-ink-faint)",
                            transform: expandedId === e.id ? "rotate(180deg)" : "rotate(0)",
                          }}
                        >
                          ▾
                        </span>
                      </div>
                    </div>
                    <div
                      className="text-xs mb-2"
                      style={{
                        color: "var(--color-ink-dim)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {e.author} · {displayYear(e.year)} ·{" "}
                      <span style={{ color: "var(--color-accent)" }}>
                        {fieldLabels[e.field] ?? e.field}
                      </span>{" "}
                      · {e.subfield}
                      {e.importance === "foundational" && (
                        <span className="ml-2" style={{ color: "var(--color-accent)" }}>
                          ★ foundational
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--color-ink-dim)" }}
                    >
                      {e.significance}
                    </p>
                    {e.modernRelevance && (
                      <div
                        className="mt-3 px-3 py-2 rounded text-sm leading-relaxed"
                        style={{
                          background: "rgba(255, 184, 77, 0.04)",
                          borderLeft: "2px solid rgba(255, 184, 77, 0.3)",
                          color: "var(--color-ink)",
                          fontFamily: "var(--font-display)",
                          fontStyle: "italic",
                        }}
                      >
                        {e.modernRelevance}
                      </div>
                    )}
                  </button>

                  {/* Expanded panel — contribution actions */}
                  {expandedId === e.id && (
                    <div
                      className="px-5 pb-5 pt-0 border-t"
                      style={{ borderColor: "var(--color-paper-edge)" }}
                    >
                      <div
                        className="pt-4 text-xs mb-3"
                        style={{ color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)" }}
                      >
                        Source: {e.source}
                      </div>
                      <div
                        className="text-xs uppercase tracking-widest mb-3"
                        style={{ color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}
                      >
                        Help with this paper
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {e.status === "wanted" && (
                          <a
                            href={`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Source found: ${e.title}`)}&body=${encodeURIComponent(`**Paper:** ${e.title}\n**Author:** ${e.author}\n**Year:** ${displayYear(e.year)}\n\n**I found this paper at:** [paste URL or location]\n\n**Notes:** `)}&labels=source-found`}
                            target="_blank"
                            rel="noopener"
                            className="wishlist-action-btn wishlist-action-primary"
                          >
                            I found this paper →
                          </a>
                        )}
                        <a
                          href={`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Context for: ${e.title}`)}&body=${encodeURIComponent(`**Paper:** ${e.title}\n**Author:** ${e.author} (${displayYear(e.year)})\n\n**Additional context I'd like to add:**\n\n`)}&labels=context`}
                          target="_blank"
                          rel="noopener"
                          className="wishlist-action-btn"
                        >
                          Add context
                        </a>
                        <a
                          href={`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Connection: ${e.title} → [NIAC concept]`)}&body=${encodeURIComponent(`**Historical paper:** ${e.title} (${e.author}, ${displayYear(e.year)})\n\n**Connects to NIAC concept:** [paste concept name]\n\n**How they connect:** `)}&labels=connection`}
                          target="_blank"
                          rel="noopener"
                          className="wishlist-action-btn"
                        >
                          Link to NIAC concept
                        </a>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
