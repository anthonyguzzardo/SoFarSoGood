/**
 * WishlistBrowser — "The Hunt" interactive browser.
 *
 * Sort modes, inline URL contribution, NIAC concept connections,
 * related paper cross-links, and modernRelevance-first card layout.
 */

import { useCallback, useMemo, useRef, useState } from "react";

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

interface Connection {
  id: string;
  wishlistId: string;
  conceptSlug: string;
  thread: string;
  strength: "direct" | "thematic";
}

interface Props {
  entries: WishlistEntry[];
  eras: string[];
  fields: string[];
  eraLabels: Record<string, string>;
  fieldLabels: Record<string, string>;
  connectionsByPaperId: Record<string, Connection[]>;
  connectedIds: string[];
}

type SortMode = "recommended" | "connected" | "easy-wins" | "chronological";

const SORT_LABELS: Record<SortMode, string> = {
  recommended: "Start here",
  connected: "High value",
  "easy-wins": "Easy wins",
  chronological: "Chronological",
};

function displayYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

/** Status display label. */
function statusLabel(status: string): string {
  if (status === "wanted") return "unfound";
  if (status === "acquired") return "claimed";
  if (status === "indexed") return "recovered";
  return status;
}

/** Status color. */
function statusColor(status: string): string {
  if (status === "acquired") return "var(--color-accent)";
  if (status === "indexed") return "#4ade80";
  return "var(--color-ink-dim)";
}

/** Status border color. */
function statusBorderColor(status: string): string {
  if (status === "acquired") return "rgba(255, 184, 77, 0.3)";
  if (status === "indexed") return "rgba(74, 222, 128, 0.3)";
  return "var(--color-paper-edge)";
}

const EASY_WIN_REGEX = /museum|university|library|archive|collection|institut|observatory|academy|society/i;

const IMPORTANCE_ORDER: Record<string, number> = {
  foundational: 0,
  seminal: 1,
  significant: 2,
  notable: 3,
};

export default function WishlistBrowser({
  entries,
  eras,
  fields,
  eraLabels,
  fieldLabels,
  connectionsByPaperId,
  connectedIds,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedEra, setSelectedEra] = useState<string>("all");
  const [selectedField, setSelectedField] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("recommended");
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});

  const REPO = "anthonyguzzardo/SoFarSoGood";

  const connectedSet = useMemo(() => new Set(connectedIds), [connectedIds]);

  const entryById = useMemo(() => {
    const m = new Map<string, WishlistEntry>();
    for (const e of entries) m.set(e.id, e);
    return m;
  }, [entries]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const scrollToCard = useCallback((id: string) => {
    const card = document.getElementById(`wishlist-${id}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("highlight-pulse");
      setTimeout(() => card.classList.remove("highlight-pulse"), 2000);
    }
  }, []);

  const handleUrlChange = useCallback((id: string, value: string) => {
    setUrlInputs((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleSubmitUrl = useCallback(
    (e: WishlistEntry) => {
      const url = (urlInputs[e.id] ?? "").trim();
      const body = `**Paper:** ${e.title}\n**Author:** ${e.author}\n**Year:** ${displayYear(e.year)}\n\n**Found at:** ${url || "[paste URL or location]"}\n\n**Notes:** `;
      const issueUrl = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Source found: ${e.title}`)}&body=${encodeURIComponent(body)}&labels=source-found`;
      window.open(issueUrl, "_blank", "noopener");
    },
    [urlInputs]
  );

  /** Pick a random entry, scroll to it, expand it. */
  const handleRandom = useCallback(() => {
    const pool = filtered.length > 0 ? filtered : entries;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) return;
    setExpandedId(pick.id);
    setTimeout(() => scrollToCard(pick.id), 50);
  }, [entries, scrollToCard]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (selectedEra !== "all" && e.era !== selectedEra) return false;
      if (selectedField !== "all" && e.field !== selectedField) return false;
      if (q.length > 0) {
        const haystack = (
          e.title + " " + e.author + " " + e.significance + " " + e.subfield +
          " " + (e.modernRelevance ?? "")
        ).toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, query, selectedEra, selectedField]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortMode) {
      case "recommended":
        list.sort((a, b) => {
          // Papers with modernRelevance first
          const aRel = a.modernRelevance ? 0 : 1;
          const bRel = b.modernRelevance ? 0 : 1;
          if (aRel !== bRel) return aRel - bRel;
          // Then connected papers
          const aConn = connectedSet.has(a.id) ? 0 : 1;
          const bConn = connectedSet.has(b.id) ? 0 : 1;
          if (aConn !== bConn) return aConn - bConn;
          // Then by importance
          const aImp = IMPORTANCE_ORDER[a.importance] ?? 3;
          const bImp = IMPORTANCE_ORDER[b.importance] ?? 3;
          if (aImp !== bImp) return aImp - bImp;
          return a.year - b.year;
        });
        break;
      case "connected":
        list.sort((a, b) => {
          const aConn = connectionsByPaperId[a.id]?.length ?? 0;
          const bConn = connectionsByPaperId[b.id]?.length ?? 0;
          if (bConn !== aConn) return bConn - aConn;
          return a.year - b.year;
        });
        break;
      case "easy-wins":
        list.sort((a, b) => {
          const aEasy = EASY_WIN_REGEX.test(a.source) ? 0 : 1;
          const bEasy = EASY_WIN_REGEX.test(b.source) ? 0 : 1;
          if (aEasy !== bEasy) return aEasy - bEasy;
          return a.year - b.year;
        });
        break;
      case "chronological":
        // Already in data order (by era/year), but sort explicitly
        list.sort((a, b) => a.year - b.year);
        break;
    }
    return list;
  }, [filtered, sortMode, connectedSet, connectionsByPaperId]);

  /** Group by era for chronological mode, flat list for others. */
  const groups = useMemo(() => {
    if (sortMode === "chronological") {
      const m = new Map<string, WishlistEntry[]>();
      for (const e of sorted) {
        const list = m.get(e.era) ?? [];
        list.push(e);
        m.set(e.era, list);
      }
      return eras
        .filter((era) => m.has(era))
        .map((era) => ({ label: eraLabels[era] ?? era, entries: m.get(era)! }));
    }
    // For other sort modes, show as a single flat list
    return [{ label: null as string | null, entries: sorted }];
  }, [sorted, sortMode, eras, eraLabels]);

  return (
    <div>
      {/* Sort mode buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSortMode(mode)}
            className="px-3 py-1.5 text-xs uppercase tracking-widest rounded border transition-all"
            style={{
              fontFamily: "var(--font-mono)",
              color: sortMode === mode ? "var(--color-accent)" : "var(--color-ink-dim)",
              borderColor: sortMode === mode ? "rgba(255, 184, 77, 0.4)" : "var(--color-paper-edge)",
              background: sortMode === mode ? "rgba(255, 184, 77, 0.06)" : "transparent",
            }}
          >
            {SORT_LABELS[mode]}
          </button>
        ))}
        <button
          type="button"
          onClick={handleRandom}
          className="ml-auto px-3 py-1.5 text-xs uppercase tracking-widest rounded border transition-all hover:border-amber-400/40 hover:text-white"
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--color-ink-dim)",
            borderColor: "var(--color-paper-edge)",
          }}
        >
          ↯ Random
        </button>
      </div>

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
              style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-mono)" }}
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
              <option value="all" style={{ background: "#15151a" }}>all eras</option>
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
              style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-mono)" }}
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
              <option value="all" style={{ background: "#15151a" }}>all fields</option>
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
                color: filtered.length === entries.length ? "var(--color-ink-dim)" : "var(--color-accent)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {filtered.length} / {entries.length}
            </span>
          </div>
        </div>
      </div>

      {/* Results */}
      {sorted.length === 0 ? (
        <div
          className="py-20 text-center"
          style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-mono)" }}
        >
          <div className="text-4xl mb-3">&#8709;</div>
          <p className="text-sm">no papers match. try a different search, or clear the filters.</p>
        </div>
      ) : (
        groups.map((group, gi) => (
          <div key={group.label ?? gi} className="mb-14">
            {group.label && (
              <h4
                className="text-sm mb-6 pb-2 border-b"
                style={{
                  color: "var(--color-accent)",
                  borderColor: "var(--color-paper-edge)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {group.label}
                <span style={{ color: "var(--color-ink-dim)" }} className="ml-2">
                  — {group.entries.length} {group.entries.length === 1 ? "paper" : "papers"}
                </span>
              </h4>
            )}
            <ul className="space-y-6">
              {group.entries.map((e) => {
                const connections = connectionsByPaperId[e.id] ?? [];
                const hasConnections = connections.length > 0;
                const relatedEntries = (e.relatedWishlistIds ?? [])
                  .map((rid) => entryById.get(rid))
                  .filter((r): r is WishlistEntry => !!r);

                return (
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
                      style={{ background: "transparent" }}
                      onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(255, 255, 255, 0.02)"; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
                      onClick={() => toggleExpand(e.id)}
                    >
                      <div className="flex items-start justify-between gap-3 mb-1">
                        {/* Lead with modernRelevance when available */}
                        <div className="flex-1 min-w-0">
                          {e.modernRelevance ? (
                            <>
                              <p
                                className="text-base font-medium leading-snug"
                                style={{ fontFamily: "var(--font-display)" }}
                              >
                                {e.modernRelevance}
                              </p>
                              <h5
                                className="mt-2 text-xs leading-snug"
                                style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-mono)" }}
                              >
                                {e.title}
                              </h5>
                            </>
                          ) : (
                            <h5
                              className="text-base font-medium leading-snug"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {e.title}
                            </h5>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasConnections && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[0.6rem] uppercase tracking-wider"
                              style={{
                                fontFamily: "var(--font-mono)",
                                color: "var(--color-accent)",
                                background: "rgba(255, 184, 77, 0.08)",
                                border: "1px solid rgba(255, 184, 77, 0.2)",
                              }}
                            >
                              ◆ linked
                            </span>
                          )}
                          <span
                            className="px-2 py-0.5 rounded text-xs uppercase tracking-wider"
                            style={{
                              fontFamily: "var(--font-mono)",
                              color: statusColor(e.status),
                              borderWidth: 1,
                              borderColor: statusBorderColor(e.status),
                            }}
                          >
                            {statusLabel(e.status)}
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
                        style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-mono)" }}
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

                      {/* Show significance in collapsed view only when modernRelevance isn't the lead */}
                      {!e.modernRelevance && (
                        <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
                          {e.significance}
                        </p>
                      )}
                    </button>

                    {/* Expanded panel */}
                    {expandedId === e.id && (
                      <div
                        className="px-5 pb-5 pt-0 border-t"
                        style={{ borderColor: "var(--color-paper-edge)" }}
                      >
                        {/* Significance — shown in expanded view when modernRelevance leads */}
                        {e.modernRelevance && (
                          <p
                            className="pt-4 text-sm leading-relaxed mb-3"
                            style={{ color: "var(--color-ink-dim)" }}
                          >
                            {e.significance}
                          </p>
                        )}

                        {/* Source */}
                        <div
                          className="pt-3 text-xs mb-4"
                          style={{ color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)" }}
                        >
                          Source: {e.source}
                        </div>

                        {/* ========== One-field contribution ========== */}
                        {e.status === "wanted" && (
                          <div className="mb-5">
                            <div
                              className="text-xs uppercase tracking-widest mb-2"
                              style={{ color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}
                            >
                              Claim this paper
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={urlInputs[e.id] ?? ""}
                                onChange={(ev) => handleUrlChange(e.id, ev.target.value)}
                                onClick={(ev) => ev.stopPropagation()}
                                placeholder="Paste a URL or DOI where this paper can be found"
                                className="flex-1 bg-transparent border rounded px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                                style={{
                                  borderColor: "var(--color-paper-edge)",
                                  fontFamily: "var(--font-mono)",
                                  color: "var(--color-ink)",
                                }}
                              />
                              <button
                                type="button"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleSubmitUrl(e);
                                }}
                                className="shrink-0 px-4 py-2 rounded text-xs uppercase tracking-widest font-mono border transition-all hover:bg-amber-400/10"
                                style={{
                                  color: "var(--color-accent)",
                                  borderColor: "rgba(255, 184, 77, 0.4)",
                                  background: "rgba(255, 184, 77, 0.06)",
                                }}
                              >
                                I found it →
                              </button>
                            </div>
                          </div>
                        )}

                        {/* ========== NIAC Connections ========== */}
                        {hasConnections && (
                          <div className="mb-5">
                            <div
                              className="text-xs uppercase tracking-widest mb-3"
                              style={{ color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}
                            >
                              Connects to modern science
                            </div>
                            <div className="space-y-3">
                              {connections.map((conn) => (
                                <div
                                  key={conn.id}
                                  className="px-4 py-3 rounded text-sm leading-relaxed"
                                  style={{
                                    background: "rgba(255, 184, 77, 0.03)",
                                    borderLeft: conn.strength === "direct"
                                      ? "2px solid rgba(255, 184, 77, 0.5)"
                                      : "2px dashed rgba(255, 184, 77, 0.25)",
                                  }}
                                >
                                  <p style={{ color: "var(--color-ink)", fontFamily: "var(--font-display)" }}>
                                    {conn.thread}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <a
                                      href={`/concept/${conn.conceptSlug}`}
                                      className="text-xs hover:text-white transition-colors underline"
                                      style={{ color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}
                                      onClick={(ev) => ev.stopPropagation()}
                                    >
                                      View concept →
                                    </a>
                                    <span
                                      className="text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded"
                                      style={{
                                        fontFamily: "var(--font-mono)",
                                        color: "var(--color-ink-faint)",
                                        border: "1px solid var(--color-paper-edge)",
                                      }}
                                    >
                                      {conn.strength}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ========== Related papers ========== */}
                        {relatedEntries.length > 0 && (
                          <div className="mb-4">
                            <div
                              className="text-xs uppercase tracking-widest mb-2"
                              style={{ color: "var(--color-ink-faint)", fontFamily: "var(--font-mono)" }}
                            >
                              See also
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {relatedEntries.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setExpandedId(r.id);
                                    setTimeout(() => scrollToCard(r.id), 50);
                                  }}
                                  className="text-xs px-2.5 py-1 rounded border transition-colors hover:border-amber-400/40 hover:text-white"
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    color: "var(--color-ink-dim)",
                                    borderColor: "var(--color-paper-edge)",
                                    background: "transparent",
                                  }}
                                >
                                  {r.title.length > 50 ? r.title.slice(0, 50) + "…" : r.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* ========== Secondary actions ========== */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t" style={{ borderColor: "var(--color-paper-edge)" }}>
                          <a
                            href={`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Context for: ${e.title}`)}&body=${encodeURIComponent(`**Paper:** ${e.title}\n**Author:** ${e.author} (${displayYear(e.year)})\n\n**Additional context I'd like to add:**\n\n`)}&labels=context`}
                            target="_blank"
                            rel="noopener"
                            className="wishlist-action-btn"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            Add context
                          </a>
                          <a
                            href={`https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`Connection: ${e.title} → [concept]`)}&body=${encodeURIComponent(`**Historical paper:** ${e.title} (${e.author}, ${displayYear(e.year)})\n\n**Connects to concept:** [paste concept name]\n\n**How they connect:** `)}&labels=connection`}
                            target="_blank"
                            rel="noopener"
                            className="wishlist-action-btn"
                            onClick={(ev) => ev.stopPropagation()}
                          >
                            Link to concept
                          </a>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
