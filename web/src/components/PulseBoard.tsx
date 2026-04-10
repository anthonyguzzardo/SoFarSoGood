/**
 * PulseBoard — the trending leaderboard.
 *
 * A Kalshi-inspired ranked list of topics with momentum bars,
 * delta badges, and expandable rows that reveal the actual sources
 * (Reddit threads, HN posts) driving the trend.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { PulseTopic, PulseSource } from "../lib/pulse.ts";

type TimeWindow = "3d" | "7d";

interface ConceptInfo {
  slug: string;
  title: string;
}

interface Props {
  topics: PulseTopic[];
  generatedAt: string;
  conceptMap?: Record<string, ConceptInfo>;
}

/* -------------------------------------------------------------------------- */
/* Helpers (duplicated from pulse.ts since this runs client-side)             */
/* -------------------------------------------------------------------------- */

function formatScore(score: number): string {
  if (score >= 10000) return `${Math.round(score / 1000)}k`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return String(score);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function platformLabel(platform: string): string {
  return platform === "reddit"
    ? "Reddit"
    : platform === "hackernews"
      ? "Hacker News"
      : platform === "youtube"
        ? "YouTube"
        : platform;
}

function platformColor(platform: string): { bg: string; fg: string } {
  switch (platform) {
    case "reddit":
      return { bg: "rgba(255, 69, 0, 0.15)", fg: "#ff6b35" };
    case "hackernews":
      return { bg: "rgba(255, 102, 0, 0.15)", fg: "#ff8c00" };
    case "youtube":
      return { bg: "rgba(255, 0, 0, 0.15)", fg: "#ff4444" };
    default:
      return { bg: "rgba(255,255,255,0.1)", fg: "#999" };
  }
}

function directionArrow(dir: string): string {
  return dir === "up" ? "▲" : dir === "down" ? "▼" : "—";
}

function directionColor(dir: string): string {
  return dir === "up"
    ? "text-green-400"
    : dir === "down"
      ? "text-red-400"
      : "text-zinc-500";
}

/* -------------------------------------------------------------------------- */
/* Hero spotlight — the #1 topic gets a dominant visual treatment              */
/* -------------------------------------------------------------------------- */

function HeroSpotlight({
  topic,
  onToggle,
  isExpanded,
  conceptMap = {},
}: {
  topic: PulseTopic;
  onToggle: () => void;
  isExpanded: boolean;
  conceptMap?: Record<string, ConceptInfo>;
}) {
  const topSource = topic.sources[0];
  const resolvedConcepts = topic.relatedConceptSlugs
    .map((s) => conceptMap[s])
    .filter((c): c is ConceptInfo => !!c);
  const topYT = topic.sources.find((s) => s.thumbnail);

  return (
    <button
      onClick={onToggle}
      className="w-full text-left group"
      style={{ background: "transparent", border: "none", padding: 0 }}
    >
      <div
        className="relative rounded-xl overflow-hidden mb-4 transition-all duration-300"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,184,77,0.06) 0%, rgba(255,184,77,0.02) 50%, rgba(255,184,77,0.04) 100%)",
          border: "1px solid rgba(255,184,77,0.18)",
          boxShadow: "0 0 40px rgba(255,184,77,0.04), inset 0 1px 0 rgba(255,184,77,0.08)",
        }}
      >
        {/* Animated glow line at top */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
            animation: "pulseGlow 3s ease-in-out infinite",
          }}
        />

        <div className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            {/* Rank badge */}
            <div
              className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-mono text-lg font-bold"
              style={{
                background: "rgba(255,184,77,0.12)",
                color: "var(--color-accent)",
                border: "1px solid rgba(255,184,77,0.2)",
              }}
            >
              1
            </div>

            <div className="flex-1 min-w-0">
              {/* Topic name — big */}
              <div className="flex items-center gap-3 flex-wrap">
                <h3
                  className="font-semibold text-xl md:text-2xl tracking-tight group-hover:text-amber-300 transition-colors"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-ink)",
                  }}
                >
                  {topic.label}
                </h3>
                <span
                  className={`text-sm font-mono font-medium ${directionColor(topic.direction)}`}
                >
                  {directionArrow(topic.direction)}{" "}
                  {topic.delta !== 0
                    ? `${topic.delta > 0 ? "+" : ""}${topic.delta}%`
                    : "steady"}
                </span>
              </div>

              {/* Top headline */}
              {topSource && (
                <p
                  className="mt-2 text-sm leading-relaxed line-clamp-2"
                  style={{ color: "var(--color-ink-dim)" }}
                >
                  "{topSource.title}"
                </p>
              )}

              {/* Stats row */}
              <div
                className="mt-3 flex items-center gap-4 text-[0.65rem] font-mono uppercase tracking-widest"
                style={{ color: "var(--color-ink-faint)" }}
              >
                <span>
                  <span style={{ color: "var(--color-accent)" }}>
                    {formatScore(topic.score)}
                  </span>{" "}
                  score
                </span>
                <span style={{ opacity: 0.3 }}>·</span>
                <span>{topic.mentions} mentions</span>
                <span style={{ opacity: 0.3 }}>·</span>
                <span>{topic.sources.length} sources</span>
                <span
                  className="ml-auto text-xs transition-transform"
                  style={{
                    color: "var(--color-ink-faint)",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
                  }}
                >
                  ▾
                </span>
              </div>

              {/* Reality check — what NASA is actually funding */}
              {resolvedConcepts.length > 0 ? (
                <div
                  className="mt-3 flex items-center gap-2 flex-wrap"
                  style={{ borderTop: "1px solid rgba(74, 222, 128, 0.08)", paddingTop: "0.75rem" }}
                >
                  <span
                    className="text-[0.6rem] font-mono uppercase tracking-widest shrink-0"
                    style={{ color: "rgba(74, 222, 128, 0.7)" }}
                  >
                    ⬡ NASA funded {resolvedConcepts.length} {resolvedConcepts.length === 1 ? "study" : "studies"}
                  </span>
                  {resolvedConcepts.slice(0, 3).map((c) => (
                    <a
                      key={c.slug}
                      href={`/concept/${c.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[0.65rem] px-2 py-0.5 rounded border transition-colors hover:border-green-400/40"
                      style={{
                        color: "rgba(74, 222, 128, 0.85)",
                        borderColor: "rgba(74, 222, 128, 0.15)",
                        background: "rgba(74, 222, 128, 0.05)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {c.title.length > 45 ? c.title.slice(0, 45).replace(/\s+\S*$/, "") + "…" : c.title}
                    </a>
                  ))}
                </div>
              ) : (
                <div
                  className="mt-3 text-[0.6rem] font-mono uppercase tracking-widest"
                  style={{ color: "var(--color-ink-faint)", opacity: 0.6, borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "0.75rem" }}
                >
                  ⬡ Social momentum only — no funded research in the atlas yet
                </div>
              )}
            </div>

            {/* YouTube thumbnail preview if available */}
            {topYT && (
              <div
                className="hidden md:block shrink-0 w-28 h-20 rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--color-paper-edge)" }}
              >
                <img
                  src={topYT.thumbnail}
                  alt=""
                  className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Sparkline — 7-day activity chart from source timestamps                    */
/* -------------------------------------------------------------------------- */

function Sparkline({ sources, id, days = 7 }: { sources: PulseSource[]; id: string; days?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const now = Date.now();
  const dayMs = 86400000;

  // Bucket sources into daily bins by platform
  const reddit = new Array(days).fill(0);
  const hn = new Array(days).fill(0);
  const yt = new Array(days).fill(0);
  for (const s of sources) {
    const age = now - new Date(s.publishedAt).getTime();
    const dayIndex = days - 1 - Math.floor(age / dayMs);
    if (dayIndex >= 0 && dayIndex < days) {
      if (s.platform === "reddit") reddit[dayIndex]++;
      else if (s.platform === "hackernews") hn[dayIndex]++;
      else if (s.platform === "youtube") yt[dayIndex]++;
    }
  }

  const totals = reddit.map((r, i) => r + hn[i] + yt[i]);
  const max = Math.max(...totals, 1);
  const w = 72;
  const h = 20;
  const barW = 7;
  const gap = (w - barW * days) / (days - 1);

  // Platform colors
  const REDDIT_COLOR = "#ff6b35";
  const HN_COLOR = "#ffb84d";
  const YT_COLOR = "#ff4444";

  // Day labels for tooltip
  const dayLabels: string[] = [];
  for (let i = 0; i < days; i++) {
    const daysAgo = days - 1 - i;
    if (daysAgo === 0) dayLabels.push("Today");
    else if (daysAgo === 1) dayLabels.push("Yesterday");
    else {
      const d = new Date(now - daysAgo * dayMs);
      dayLabels.push(d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    }
  }

  return (
    <div
      className="relative shrink-0"
      style={{ width: w, height: h }}
      onMouseLeave={() => setHovered(null)}
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ overflow: "visible" }}
      >
        {totals.map((count, i) => {
          const x = i * (barW + gap);
          const isToday = i === days - 1;

          if (count === 0) {
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={h - 2}
                  width={barW}
                  height={2}
                  rx={1.5}
                  fill="#ffb84d"
                  opacity={0.08}
                />
                {/* Invisible hover target */}
                <rect
                  x={x}
                  y={0}
                  width={barW}
                  height={h}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                />
              </g>
            );
          }

          const totalH = (count / max) * (h - 2);
          const baseY = h - totalH;
          const opacity = 0.3 + (count / max) * 0.7;

          // Stack: Reddit on bottom, HN in middle, YT on top
          const rH = (reddit[i] / count) * totalH;
          const hH = (hn[i] / count) * totalH;
          const yH = (yt[i] / count) * totalH;

          // Determine segments bottom-up
          const segments: { y: number; height: number; fill: string }[] = [];
          let cursor = h;
          if (reddit[i] > 0) {
            segments.push({ y: cursor - rH, height: rH, fill: REDDIT_COLOR });
            cursor -= rH;
          }
          if (hn[i] > 0) {
            segments.push({ y: cursor - hH, height: hH, fill: HN_COLOR });
            cursor -= hH;
          }
          if (yt[i] > 0) {
            segments.push({ y: cursor - yH, height: yH, fill: YT_COLOR });
          }

          return (
            <g key={i} opacity={hovered === i ? 1 : opacity}>
              {isToday && hovered !== i && (
                <animate
                  attributeName="opacity"
                  values={`${opacity};${Math.max(opacity - 0.2, 0.3)};${opacity}`}
                  dur="2s"
                  repeatCount="indefinite"
                />
              )}
              <clipPath id={`spark-${id}-${i}`}>
                <rect x={x} y={baseY} width={barW} height={totalH} rx={1.5} />
              </clipPath>
              <g clipPath={`url(#spark-${id}-${i})`}>
                {segments.map((seg, j) => (
                  <rect
                    key={j}
                    x={x}
                    y={seg.y}
                    width={barW}
                    height={seg.height}
                    fill={seg.fill}
                  />
                ))}
              </g>
              {/* Invisible hover target covering full height */}
              <rect
                x={x}
                y={0}
                width={barW}
                height={h}
                fill="transparent"
                onMouseEnter={() => setHovered(i)}
              />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered !== null && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            bottom: h + 6,
            left: hovered * (barW + gap) + barW / 2,
            transform: "translateX(-50%)",
          }}
        >
          <div
            className="rounded-md px-2.5 py-1.5 text-[0.55rem] font-mono leading-tight whitespace-nowrap"
            style={{
              background: "rgba(15, 15, 15, 0.95)",
              border: "1px solid rgba(255,184,77,0.2)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              color: "var(--color-ink-dim)",
            }}
          >
            <div className="font-semibold mb-1" style={{ color: "var(--color-ink)" }}>
              {dayLabels[hovered]}
            </div>
            {totals[hovered] === 0 ? (
              <div style={{ color: "var(--color-ink-faint)" }}>No activity</div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {reddit[hovered] > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: REDDIT_COLOR }} />
                    <span>Reddit</span>
                    <span style={{ color: REDDIT_COLOR, marginLeft: "auto" }}>{reddit[hovered]}</span>
                  </div>
                )}
                {hn[hovered] > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: HN_COLOR }} />
                    <span>HN</span>
                    <span style={{ color: HN_COLOR, marginLeft: "auto" }}>{hn[hovered]}</span>
                  </div>
                )}
                {yt[hovered] > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: YT_COLOR }} />
                    <span>YouTube</span>
                    <span style={{ color: YT_COLOR, marginLeft: "auto" }}>{yt[hovered]}</span>
                  </div>
                )}
                <div
                  className="mt-0.5 pt-0.5"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "var(--color-ink-faint)" }}
                >
                  {totals[hovered]} total
                </div>
              </div>
            )}
          </div>
          {/* Arrow */}
          <div
            className="mx-auto w-0 h-0"
            style={{
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "4px solid rgba(15, 15, 15, 0.95)",
            }}
          />
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Source card                                                                 */
/* -------------------------------------------------------------------------- */

function SourceCard({ source }: { source: PulseSource }) {
  const colors = platformColor(source.platform);
  const hasThumb = !!source.thumbnail;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border transition-all duration-200 hover:border-amber-400/40 hover:-translate-y-0.5 overflow-hidden"
      style={{
        background: "var(--color-paper-raised)",
        borderColor: "var(--color-paper-edge)",
      }}
    >
      {/* YouTube thumbnail */}
      {hasThumb && (
        <div className="relative w-full aspect-video overflow-hidden">
          <img
            src={source.thumbnail}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/10 transition-colors">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,0,0,0.9)" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 ml-0.5" fill="white">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[0.6rem] font-mono uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ background: colors.bg, color: colors.fg }}
          >
            {platformLabel(source.platform)}
          </span>
          {source.subreddit && (
            <span
              className="text-[0.6rem] font-mono"
              style={{ color: "var(--color-ink-faint)" }}
            >
              r/{source.subreddit}
            </span>
          )}
          <span
            className="text-[0.6rem] font-mono ml-auto"
            style={{ color: "var(--color-ink-faint)" }}
          >
            {timeAgo(source.publishedAt)}
          </span>
        </div>

        <p
          className="text-sm leading-relaxed font-medium"
          style={{ color: "var(--color-ink)" }}
        >
          {source.title}
        </p>

        <div
          className="mt-2 flex items-center gap-3 text-[0.65rem] font-mono"
          style={{ color: "var(--color-ink-dim)" }}
        >
          <span>
            {source.platform === "youtube"
              ? "▶"
              : source.platform === "reddit"
                ? "↑"
                : "▴"}{" "}
            {formatScore(source.score)}
          </span>
          {source.commentCount != null && (
            <span>{source.commentCount} comments</span>
          )}
          {source.author && <span>by {source.author}</span>}
        </div>
      </div>
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Leaderboard row                                                            */
/* -------------------------------------------------------------------------- */

function TopicRow({
  topic,
  rank,
  isExpanded,
  onToggle,
  onCopyLink,
  copied,
  rowRef,
  sparklineDays = 7,
  allSources,
  conceptMap = {},
}: {
  topic: PulseTopic;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  onCopyLink: () => void;
  copied: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  sparklineDays?: number;
  allSources?: PulseSource[];
  conceptMap?: Record<string, ConceptInfo>;
}) {
  const topSource = topic.sources[0];

  return (
    <div ref={rowRef}>
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full text-left group pulse-row"
        style={{ background: "transparent", border: "none", padding: 0 }}
      >
        <div
          className={`flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-200 ${
            isExpanded
              ? "pulse-row-expanded"
              : "pulse-row-idle"
          }`}
          style={rank === 2 ? { borderLeft: "2px solid rgba(255,184,77,0.3)" } : undefined}
        >
          {/* Rank */}
          <span
            className={`text-sm font-mono w-6 text-right shrink-0 ${rank === 2 ? "font-semibold" : ""}`}
            style={{ color: rank <= 3 ? "var(--color-accent)" : "var(--color-ink-faint)" }}
          >
            {rank}
          </span>

          {/* Direction arrow */}
          <span className={`text-xs shrink-0 ${directionColor(topic.direction)}`}>
            {directionArrow(topic.direction)}
          </span>

          {/* Label + headline teaser + funded indicator */}
          <div className="flex-1 min-w-0">
            <span className="flex items-center gap-2">
              <span
                className="font-medium text-sm group-hover:text-amber-300 transition-colors"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
              >
                {topic.label}
              </span>
              {(() => {
                const fundedCount = topic.relatedConceptSlugs
                  .filter((s) => conceptMap[s])
                  .length;
                if (fundedCount === 0) return null;
                return (
                  <span
                    className="text-[0.5rem] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 hidden sm:inline"
                    style={{
                      color: "rgba(74, 222, 128, 0.65)",
                      background: "rgba(74, 222, 128, 0.06)",
                      border: "1px solid rgba(74, 222, 128, 0.1)",
                    }}
                  >
                    ⬡ {fundedCount}
                  </span>
                );
              })()}
            </span>
            {topSource && (
              <span
                className="text-[0.65rem] leading-tight mt-0.5 block truncate"
                style={{ color: "var(--color-ink-faint)" }}
              >
                {topSource.title}
              </span>
            )}
          </div>

          {/* Activity sparkline — 7-day heartbeat */}
          <div className="hidden sm:flex items-center shrink-0">
            <Sparkline sources={allSources ?? topic.sources} id={topic.slug} days={sparklineDays} />
          </div>

          {/* Score */}
          <span
            className="text-sm font-mono w-16 text-right shrink-0"
            style={{ color: "var(--color-accent)" }}
          >
            {formatScore(topic.score)}
          </span>

          {/* Delta */}
          <span
            className={`text-xs font-mono w-14 text-right shrink-0 ${directionColor(topic.direction)}`}
          >
            {topic.delta !== 0
              ? `${topic.delta > 0 ? "+" : ""}${topic.delta}%`
              : "—"}
          </span>

          {/* Mentions count */}
          <span
            className="text-xs font-mono w-8 text-right shrink-0 hidden md:block"
            style={{ color: "var(--color-ink-faint)" }}
          >
            {topic.mentions}
          </span>

          {/* Expand indicator */}
          <span
            className="text-xs transition-transform shrink-0"
            style={{
              color: "var(--color-ink-faint)",
              transform: isExpanded ? "rotate(180deg)" : "rotate(0)",
            }}
          >
            ▾
          </span>
        </div>
      </button>

      {/* Expanded sources */}
      {isExpanded && topic.sources.length > 0 && (
        <div className="px-4 pb-4 pt-2">
          <div className="ml-10 grid grid-cols-1 md:grid-cols-2 gap-3">
            {topic.sources.slice(0, 6).map((source, i) => (
              <SourceCard key={i} source={source} />
            ))}
          </div>
          <div className="ml-10 mt-3 flex items-center gap-2 flex-wrap">
            {topic.relatedConceptSlugs.length > 0 && (() => {
              const resolved = topic.relatedConceptSlugs
                .map((s) => conceptMap[s])
                .filter((c): c is ConceptInfo => !!c);
              if (resolved.length === 0) return null;
              return (
                <>
                  <span
                    className="text-[0.6rem] font-mono uppercase tracking-widest"
                    style={{ color: "var(--color-ink-faint)" }}
                  >
                    In the atlas:
                  </span>
                  {resolved.map((c) => (
                    <a
                      key={c.slug}
                      href={`/concept/${c.slug}`}
                      className="text-xs px-2 py-1 rounded border transition-colors hover:border-amber-400/40"
                      style={{
                        color: "var(--color-accent)",
                        borderColor: "var(--color-paper-edge)",
                        background: "rgba(255,184,77,0.06)",
                        fontFamily: "var(--font-display)",
                      }}
                    >
                      {c.title.length > 50 ? c.title.slice(0, 50).replace(/\s+\S*$/, "") + "…" : c.title}
                    </a>
                  ))}
                </>
              );
            })()}
            <button
              onClick={(e) => { e.stopPropagation(); onCopyLink(); }}
              className="ml-auto text-[0.6rem] font-mono uppercase tracking-widest px-2 py-1 rounded border transition-all hover:border-amber-400/40"
              style={{
                color: copied ? "var(--color-accent)" : "var(--color-ink-faint)",
                borderColor: copied ? "rgba(255,184,77,0.3)" : "var(--color-paper-edge)",
                background: copied ? "rgba(255,184,77,0.08)" : "transparent",
                cursor: "pointer",
              }}
            >
              {copied ? "Copied!" : "Share link"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Time-window recompute — filter sources, re-score, re-rank client-side     */
/* -------------------------------------------------------------------------- */

function recomputeForWindow(
  topics: PulseTopic[],
  window: TimeWindow,
): PulseTopic[] {
  if (window === "7d") return topics;

  const now = Date.now();
  const windowMs = 3 * 86400000; // 3 days
  const cutoff = now - windowMs;

  return topics
    .map((t) => {
      const filtered = t.sources.filter(
        (s) => new Date(s.publishedAt).getTime() >= cutoff,
      );
      if (filtered.length === 0 && t.mentions > 0) {
        // Topic has activity but none in this window — still show it with 0
        return { ...t, sources: filtered, score: 0, mentions: 0, delta: -100, direction: "down" as const };
      }
      if (filtered.length === 0) return t; // quiet topic, pass through

      // Re-score: Reddit 1x, HN 1.5x, YouTube by reddit score (already split)
      let score = 0;
      for (const s of filtered) {
        if (s.platform === "hackernews") score += s.score * 1.5;
        else score += s.score;
      }
      score = Math.round(score);

      // Delta: compare first half vs second half of the 3-day window
      const midpoint = cutoff + windowMs / 2;
      let recentScore = 0;
      let olderScore = 0;
      for (const s of filtered) {
        const ts = new Date(s.publishedAt).getTime();
        if (ts >= midpoint) recentScore += s.score;
        else olderScore += s.score;
      }
      // Normalize (both halves are 1.5 days)
      let delta: number;
      let direction: "up" | "down" | "steady";
      if (olderScore === 0 && recentScore === 0) {
        delta = 0;
        direction = "steady";
      } else if (olderScore === 0) {
        delta = 200;
        direction = "up";
      } else {
        delta = Math.round(((recentScore - olderScore) / olderScore) * 100);
        direction = delta > 15 ? "up" : delta < -15 ? "down" : "steady";
      }

      return {
        ...t,
        sources: filtered,
        score,
        mentions: filtered.length,
        delta,
        direction,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/* -------------------------------------------------------------------------- */
/* Reactive narrative lede — updates with time window                        */
/* -------------------------------------------------------------------------- */

function generateLede(
  active: PulseTopic[],
  _window: TimeWindow,
  conceptMap: Record<string, ConceptInfo> = {},
): { lede: string; stats: { topics: number; mentions: number; sources: number; funded: number } } {
  const fundedCount = active.filter(
    (t) => t.relatedConceptSlugs.some((s) => conceptMap[s]),
  ).length;

  const stats = {
    topics: active.length,
    mentions: active.reduce((s, t) => s + t.mentions, 0),
    sources: active.reduce((s, t) => s + t.sources.length, 0),
    funded: fundedCount,
  };

  const leader = active[0];
  const mover = active
    .filter((t) => t.direction === "up" && t.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0];
  const cooling = active
    .filter((t) => t.direction === "down" && t.delta < 0)
    .sort((a, b) => a.delta - b.delta)[0];

  const parts: string[] = [];

  if (leader) {
    const leaderFunded = leader.relatedConceptSlugs.filter((s) => conceptMap[s]).length;
    const topTitle = leader.sources[0]?.title;
    if (topTitle) {
      let truncated = topTitle;
      if (topTitle.length > 90) {
        truncated = topTitle.slice(0, 90).replace(/\s+\S*$/, "") + "…";
      }
      if (leaderFunded > 0) {
        parts.push(
          `${leader.label} leading the board — ${leaderFunded} NASA-funded ${leaderFunded === 1 ? "study" : "studies"} in the atlas. "${truncated}"`,
        );
      } else {
        parts.push(`${leader.label} leading the board — social momentum only. "${truncated}"`);
      }
    } else {
      parts.push(`${leader.label} leading the board with ${leader.mentions} mentions across platforms`);
    }
  }

  if (mover && mover.slug !== leader?.slug) {
    parts.push(`${mover.label} surging +${mover.delta}%`);
  }

  if (cooling) {
    parts.push(`${cooling.label} cooling off`);
  }

  return { lede: parts.join(". ") + ".", stats };
}

export default function PulseBoard({ topics, generatedAt, conceptMap = {} }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showQuiet, setShowQuiet] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("7d");
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Original sources map for sparklines (always show full range)
  const originalSourcesMap = useMemo(() => {
    const m = new Map<string, PulseSource[]>();
    for (const t of topics) m.set(t.slug, t.sources);
    return m;
  }, [topics]);

  const windowTopics = useMemo(
    () => recomputeForWindow(topics, timeWindow),
    [topics, timeWindow],
  );

  const activeTopics = windowTopics.filter((t) => t.mentions > 0);
  const quietTopics = windowTopics.filter((t) => t.mentions === 0);

  // Reactive narrative lede — updates when time window changes
  const { lede, stats } = useMemo(
    () => generateLede(activeTopics, timeWindow, conceptMap),
    [activeTopics, timeWindow, conceptMap],
  );

  const biggestMover = activeTopics
    .filter((t) => t.direction === "up" && t.delta > 0)
    .sort((a, b) => b.delta - a.delta)[0] ?? null;

  // Deep links: read hash on mount, auto-expand + scroll
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && topics.some((t) => t.slug === hash)) {
      setExpanded(hash);
      // Scroll after a tick so the DOM has expanded
      requestAnimationFrame(() => {
        const el = rowRefs.current.get(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, []);

  const toggle = useCallback((slug: string) => {
    setExpanded((prev) => {
      const next = prev === slug ? null : slug;
      // Update URL hash without scrolling
      if (next) {
        history.replaceState(null, "", `#${next}`);
      } else {
        history.replaceState(null, "", window.location.pathname);
      }
      return next;
    });
  }, []);

  const copyLink = useCallback((slug: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 1500);
    });
  }, []);

  const heroTopic = activeTopics[0];
  const restTopics = activeTopics.slice(1);

  return (
    <div>
      {/* Glow animation for hero */}
      <style>{`
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Reactive narrative lede + time-window toggle */}
      <div className="flex items-start justify-between gap-4 px-4 mb-4">
        <div className="flex-1 min-w-0">
          <p
            className="text-sm md:text-base leading-relaxed"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-ink-dim)" }}
          >
            {lede}
          </p>
          <div
            className="mt-2 flex items-center gap-3 text-[0.6rem] font-mono uppercase tracking-widest"
            style={{ color: "var(--color-ink-faint)" }}
          >
            <span>{stats.topics} active</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span>{stats.mentions} mentions</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span>{stats.sources} sources</span>
            {stats.funded > 0 && (
              <>
                <span style={{ opacity: 0.3 }}>·</span>
                <span style={{ color: "rgba(74, 222, 128, 0.65)" }}>
                  {stats.funded} with funded research
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
        {(["3d", "7d"] as const).map((w) => (
          <button
            key={w}
            onClick={() => setTimeWindow(w)}
            className="text-[0.65rem] font-mono uppercase tracking-widest px-3 py-1.5 rounded-md transition-all"
            style={{
              background: timeWindow === w ? "rgba(255,184,77,0.12)" : "transparent",
              color: timeWindow === w ? "var(--color-accent)" : "var(--color-ink-faint)",
              border: timeWindow === w ? "1px solid rgba(255,184,77,0.25)" : "1px solid transparent",
              cursor: "pointer",
            }}
          >
            {w === "3d" ? "3 days" : "7 days"}
          </button>
        ))}
        </div>
      </div>

      {/* Hero spotlight — #1 topic */}
      {heroTopic && (
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(heroTopic.slug, el);
          }}
        >
          <HeroSpotlight
            topic={heroTopic}
            onToggle={() => toggle(heroTopic.slug)}
            isExpanded={expanded === heroTopic.slug}
            conceptMap={conceptMap}
          />
          {/* Hero expanded sources */}
          {expanded === heroTopic.slug && heroTopic.sources.length > 0 && (
            <div className="px-4 pb-4 -mt-2 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {heroTopic.sources.slice(0, 6).map((source, i) => (
                  <SourceCard key={i} source={source} />
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {heroTopic.relatedConceptSlugs.length > 0 && (() => {
                  const resolved = heroTopic.relatedConceptSlugs
                    .map((s) => conceptMap[s])
                    .filter((c): c is ConceptInfo => !!c);
                  if (resolved.length === 0) return null;
                  return (
                  <>
                    <span
                      className="text-[0.6rem] font-mono uppercase tracking-widest"
                      style={{ color: "var(--color-ink-faint)" }}
                    >
                      In the atlas:
                    </span>
                    {resolved.map((c) => (
                      <a
                        key={c.slug}
                        href={`/concept/${c.slug}`}
                        className="text-xs px-2 py-1 rounded border transition-colors hover:border-amber-400/40"
                        style={{
                          color: "var(--color-accent)",
                          borderColor: "var(--color-paper-edge)",
                          background: "rgba(255,184,77,0.06)",
                          fontFamily: "var(--font-display)",
                        }}
                      >
                        {c.title.length > 50 ? c.title.slice(0, 50).replace(/\s+\S*$/, "") + "…" : c.title}
                      </a>
                    ))}
                  </>
                  );
                })()}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyLink(heroTopic.slug);
                  }}
                  className="ml-auto text-[0.6rem] font-mono uppercase tracking-widest px-2 py-1 rounded border transition-all hover:border-amber-400/40"
                  style={{
                    color:
                      copiedSlug === heroTopic.slug
                        ? "var(--color-accent)"
                        : "var(--color-ink-faint)",
                    borderColor:
                      copiedSlug === heroTopic.slug
                        ? "rgba(255,184,77,0.3)"
                        : "var(--color-paper-edge)",
                    background:
                      copiedSlug === heroTopic.slug
                        ? "rgba(255,184,77,0.08)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {copiedSlug === heroTopic.slug ? "Copied!" : "Share link"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Biggest mover callout — only if it's NOT the #1 topic */}
      {biggestMover && biggestMover.slug !== heroTopic?.slug && (
        <div
          className="mx-4 mb-3 px-4 py-2.5 rounded-lg flex items-center gap-3"
          style={{
            background: "rgba(74, 222, 128, 0.05)",
            border: "1px solid rgba(74, 222, 128, 0.12)",
          }}
        >
          <span className="text-green-400 text-xs">▲</span>
          <span
            className="text-[0.6rem] font-mono uppercase tracking-widest shrink-0"
            style={{ color: "rgba(74, 222, 128, 0.7)" }}
          >
            Biggest mover
          </span>
          <span
            className="text-sm font-medium shrink-0"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-ink)",
            }}
          >
            {biggestMover.label}
          </span>
          <span className="text-sm font-mono text-green-400 shrink-0">
            +{biggestMover.delta}%
          </span>
          {biggestMover.sources[0] && (
            <span
              className="text-[0.65rem] flex-1 min-w-0 truncate hidden sm:block"
              style={{ color: "var(--color-ink-faint)" }}
            >
              — {biggestMover.sources[0].title}
            </span>
          )}
        </div>
      )}

      {/* Header row — for the rest of the board */}
      {restTopics.length > 0 && (
        <>
          <div
            className="flex items-center gap-4 px-4 py-2 mb-1 text-[0.6rem] font-mono uppercase tracking-widest"
            style={{ color: "var(--color-ink-faint)" }}
          >
            <span className="w-6 text-right">#</span>
            <span className="w-4" />
            <span className="flex-1">Topic</span>
            <span className="w-[72px] hidden sm:block text-right">{timeWindow === "3d" ? "3-day" : "7-day"}</span>
            <span className="w-16 text-right">Score</span>
            <span className="w-14 text-right">Change</span>
            <span className="w-8 text-right hidden md:block">Hits</span>
            <span className="w-4" />
          </div>

          {/* Divider */}
          <div
            className="mx-4 mb-2"
            style={{ borderBottom: "1px solid var(--color-paper-edge)" }}
          />
        </>
      )}

      {/* Remaining topics (rank 2+) */}
      {restTopics.map((topic, i) => (
        <TopicRow
          key={topic.slug}
          topic={topic}
          rank={i + 2}
          isExpanded={expanded === topic.slug}
          onToggle={() => toggle(topic.slug)}
          onCopyLink={() => copyLink(topic.slug)}
          copied={copiedSlug === topic.slug}
          sparklineDays={timeWindow === "3d" ? 3 : 7}
          allSources={originalSourcesMap.get(topic.slug)}
          conceptMap={conceptMap}
          rowRef={(el) => {
            if (el) rowRefs.current.set(topic.slug, el);
          }}
        />
      ))}

      {/* Quiet topics — collapsed by default */}
      {quietTopics.length > 0 && (
        <div className="mt-6 px-4">
          <button
            onClick={() => setShowQuiet((v) => !v)}
            className="text-[0.6rem] font-mono uppercase tracking-widest flex items-center gap-2"
            style={{
              color: "var(--color-ink-faint)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <span>
              {quietTopics.length} topics quiet {timeWindow === "3d" ? "last 3 days" : "this week"}
            </span>
            <span
              className="text-xs transition-transform"
              style={{
                transform: showQuiet ? "rotate(180deg)" : "rotate(0)",
              }}
            >
              ▾
            </span>
          </button>
          {showQuiet && (
            <div className="flex flex-wrap gap-2 mt-2">
              {quietTopics.map((t) => (
                <span
                  key={t.slug}
                  className="text-xs font-mono px-2 py-1 rounded"
                  style={{
                    color: "var(--color-ink-faint)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timestamp + sparkline legend */}
      <div
        className="mt-8 px-4 flex items-center gap-4 flex-wrap text-[0.6rem] font-mono"
        style={{ color: "var(--color-ink-faint)" }}
      >
        <span>
          Data from Reddit + Hacker News · Updated{" "}
          {new Date(generatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="hidden sm:flex items-center gap-3 ml-auto">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#ff6b35" }} />
            Reddit
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#ffb84d" }} />
            HN
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#ff4444" }} />
            YouTube
          </span>
        </span>
      </div>
    </div>
  );
}
