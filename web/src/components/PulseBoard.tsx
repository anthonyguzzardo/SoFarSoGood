/**
 * PulseBoard — the trending leaderboard.
 *
 * A Kalshi-inspired ranked list of topics with momentum bars,
 * delta badges, and expandable rows that reveal the actual sources
 * (Reddit threads, HN posts) driving the trend.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { PulseTopic, PulseSource, Quadrant } from "../lib/pulse.ts";

type TimeWindow = "3d" | "7d";

interface ConceptInfo {
  slug: string;
  title: string;
}

interface TopicWeek {
  date: string;
  score: number;
  rank: number;
  mentions: number;
}

type TopicHistory = Record<string, TopicWeek[]>;

interface Props {
  topics: PulseTopic[];
  generatedAt: string;
  conceptMap?: Record<string, ConceptInfo>;
  topicHistory?: TopicHistory;
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
        : platform === "arxiv"
          ? "ArXiv"
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
    case "arxiv":
      return { bg: "rgba(100, 149, 237, 0.15)", fg: "#6495ed" };
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

const QUADRANT_STYLE: Record<Quadrant, { color: string; bg: string; label: string }> = {
  "real-deal":       { color: "rgba(74, 222, 128, 0.85)",  bg: "rgba(74, 222, 128, 0.08)",  label: "Real Deal" },
  "hype-cycle":      { color: "rgba(251, 191, 36, 0.85)",  bg: "rgba(251, 191, 36, 0.08)",  label: "Hype Cycle" },
  "sleeping-giant":  { color: "rgba(96, 165, 250, 0.85)",  bg: "rgba(96, 165, 250, 0.08)",  label: "Sleeping Giant" },
  "dead-zone":       { color: "rgba(148, 163, 184, 0.6)",  bg: "rgba(148, 163, 184, 0.05)", label: "Dead Zone" },
};

function QuadrantBadge({ quadrant }: { quadrant?: Quadrant }) {
  if (!quadrant) return null;
  const style = QUADRANT_STYLE[quadrant];
  return (
    <span
      className="text-[0.5rem] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
      style={{ color: style.color, background: style.bg, border: `1px solid ${style.color.replace(/[\d.]+\)$/, "0.2)")}` }}
    >
      {style.label}
    </span>
  );
}

function QuadrantSummary({ topics }: { topics: PulseTopic[] }) {
  const counts: Record<Quadrant, number> = { "real-deal": 0, "hype-cycle": 0, "sleeping-giant": 0, "dead-zone": 0 };
  for (const t of topics) {
    const q = t.quadrant ?? "dead-zone";
    counts[q]++;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.6rem] font-mono" style={{ color: "var(--color-ink-dim)" }}>
      {(Object.entries(QUADRANT_STYLE) as [Quadrant, typeof QUADRANT_STYLE[Quadrant]][]).map(([q, s]) => (
        <span key={q} className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
          <span style={{ color: s.color }}>{counts[q]}</span>
          <span>{s.label}</span>
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero spotlight — the #1 topic gets a dominant visual treatment              */
/* -------------------------------------------------------------------------- */

function HeroSpotlight({
  topic,
  onToggle,
  isExpanded,
  conceptMap = {},
  trajectory,
  weeklyHistory,
  showTrendLine,
}: {
  topic: PulseTopic;
  onToggle: () => void;
  isExpanded: boolean;
  conceptMap?: Record<string, ConceptInfo>;
  trajectory?: number;
  weeklyHistory?: TopicWeek[];
  showTrendLine?: boolean;
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
                <QuadrantBadge quadrant={topic.quadrant as Quadrant | undefined} />
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
                {topic.resonance != null && topic.resonance > 0 && (
                  <>
                    <span style={{ opacity: 0.3 }}>·</span>
                    <span style={{ color: QUADRANT_STYLE[topic.quadrant as Quadrant ?? "dead-zone"]?.color ?? "var(--color-ink-dim)" }}>
                      {topic.resonance} resonance
                    </span>
                  </>
                )}
                {trajectory != null && (
                  <>
                    <span style={{ opacity: 0.3 }}>·</span>
                    <span style={{ color: trajectory > 0 ? "#4ade80" : "#f87171" }}>
                      {trajectory > 0 ? `↑${trajectory}` : `↓${Math.abs(trajectory)}`} vs weekly
                    </span>
                  </>
                )}
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

              {/* 4-week trend line */}
              {showTrendLine && weeklyHistory && (
                <div className="mt-3 flex items-center gap-3">
                  <span
                    className="text-[0.55rem] font-mono uppercase tracking-widest shrink-0"
                    style={{ color: "var(--color-ink-faint)" }}
                  >
                    {weeklyHistory.length - 1}w trend
                  </span>
                  <TrendLine weeks={weeklyHistory} id={`hero-${topic.slug}`} width={120} height={28} />
                </div>
              )}

              {/* Reality check — what NASA is actually funding + resonance context */}
              {resolvedConcepts.length > 0 ? (
                <div
                  className="mt-3 flex items-center gap-2 flex-wrap"
                  style={{ borderTop: "1px solid rgba(74, 222, 128, 0.08)", paddingTop: "0.75rem" }}
                >
                  <span
                    className="text-[0.6rem] font-mono uppercase tracking-widest shrink-0"
                    style={{ color: "rgba(74, 222, 128, 0.7)" }}
                  >
                    {topic.quadrant === "real-deal"
                      ? `Knowledge-backed — ${resolvedConcepts.length} NASA ${resolvedConcepts.length === 1 ? "study" : "studies"}`
                      : `⬡ NASA funded ${resolvedConcepts.length} ${resolvedConcepts.length === 1 ? "study" : "studies"}`}
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
                  style={{
                    color: topic.quadrant === "hype-cycle"
                      ? "rgba(251, 191, 36, 0.7)"
                      : "var(--color-ink-faint)",
                    opacity: topic.quadrant === "hype-cycle" ? 1 : 0.6,
                    borderTop: "1px solid rgba(255,255,255,0.04)",
                    paddingTop: "0.75rem",
                  }}
                >
                  {topic.quadrant === "hype-cycle"
                    ? "Trending, but shallow — no deep knowledge backing yet"
                    : "⬡ Social momentum only — no funded research indexed yet"}
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
  const arxiv = new Array(days).fill(0);
  for (const s of sources) {
    const age = now - new Date(s.publishedAt).getTime();
    const dayIndex = days - 1 - Math.floor(age / dayMs);
    if (dayIndex >= 0 && dayIndex < days) {
      if (s.platform === "reddit") reddit[dayIndex]++;
      else if (s.platform === "hackernews") hn[dayIndex]++;
      else if (s.platform === "youtube") yt[dayIndex]++;
      else if (s.platform === "arxiv") arxiv[dayIndex]++;
    }
  }

  const totals = reddit.map((r, i) => r + hn[i] + yt[i] + arxiv[i]);
  const max = Math.max(...totals, 1);
  const w = 72;
  const h = 20;
  const barW = 7;
  const gap = (w - barW * days) / (days - 1);

  // Platform colors
  const REDDIT_COLOR = "#ff6b35";
  const HN_COLOR = "#ffb84d";
  const YT_COLOR = "#ff4444";
  const ARXIV_COLOR = "#6495ed";

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

          // Stack: Reddit on bottom, HN, YT, ArXiv on top
          const rH = (reddit[i] / count) * totalH;
          const hH = (hn[i] / count) * totalH;
          const yH = (yt[i] / count) * totalH;
          const aH = (arxiv[i] / count) * totalH;

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
            cursor -= yH;
          }
          if (arxiv[i] > 0) {
            segments.push({ y: cursor - aH, height: aH, fill: ARXIV_COLOR });
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
                {arxiv[hovered] > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-sm" style={{ background: ARXIV_COLOR }} />
                    <span>ArXiv</span>
                    <span style={{ color: ARXIV_COLOR, marginLeft: "auto" }}>{arxiv[hovered]}</span>
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
/* TrendLine — multi-week score trajectory from historical snapshots          */
/* -------------------------------------------------------------------------- */

function formatWeekLabel(date: string, isLast: boolean): string {
  if (isLast) return "Now";
  const d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function TrendLine({ weeks, id, width = 72, height = 20 }: { weeks: TopicWeek[]; id: string; width?: number; height?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const w = width;
  const h = height;
  const padY = 2;

  const scores = weeks.map((wk) => wk.score);
  const max = Math.max(...scores, 1);
  const hasActivity = scores.some((s) => s > 0);

  if (!hasActivity) {
    // All zeros — show flat faint line
    return (
      <div className="shrink-0" style={{ width: w, height: h }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <line x1={0} y1={h - 1} x2={w} y2={h - 1} stroke="#ffb84d" strokeWidth={1} opacity={0.08} />
        </svg>
      </div>
    );
  }

  // Compute points
  const points = scores.map((s, i) => ({
    x: (i / (scores.length - 1)) * w,
    y: padY + (1 - s / max) * (h - padY * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${w},${h} L0,${h} Z`;

  // Color based on trend direction (last vs first non-zero)
  const firstNonZero = scores.findIndex((s) => s > 0);
  const lastScore = scores[scores.length - 1];
  const refScore = scores[firstNonZero] || 0;
  const trending = lastScore > refScore ? "up" : lastScore < refScore ? "down" : "flat";
  const lineColor = trending === "up" ? "#4ade80" : trending === "down" ? "#f87171" : "#ffb84d";
  const fillColor = trending === "up" ? "rgba(74, 222, 128, 0.12)" : trending === "down" ? "rgba(248, 113, 113, 0.08)" : "rgba(255, 184, 77, 0.08)";

  return (
    <div
      className="relative shrink-0"
      style={{ width: w, height: h }}
      onMouseLeave={() => setHovered(null)}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        {/* Fill area */}
        <path d={areaPath} fill={fillColor} />
        {/* Line */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hovered === i ? 3 : (i === scores.length - 1 ? 2.5 : 1.5)}
              fill={hovered === i ? lineColor : (i === scores.length - 1 ? lineColor : "var(--color-paper-raised)")}
              stroke={lineColor}
              strokeWidth={1}
              opacity={hovered === i ? 1 : (i === scores.length - 1 ? 1 : 0.6)}
            />
            {/* Invisible hover target */}
            <rect
              x={p.x - w / (scores.length * 2)}
              y={0}
              width={w / scores.length}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
            />
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered !== null && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            bottom: h + 6,
            left: points[hovered].x,
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
            <div className="font-semibold mb-0.5" style={{ color: "var(--color-ink)" }}>
              {formatWeekLabel(weeks[hovered].date, hovered === weeks.length - 1)}
            </div>
            {weeks[hovered].score > 0 ? (
              <div className="flex flex-col gap-0.5">
                <div>
                  Score: <span style={{ color: lineColor }}>{formatScore(weeks[hovered].score)}</span>
                </div>
                <div>
                  Rank: <span style={{ color: "var(--color-accent)" }}>#{weeks[hovered].rank || "—"}</span>
                </div>
                <div>
                  {weeks[hovered].mentions} sources
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--color-ink-faint)" }}>No activity</div>
            )}
          </div>
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
          {(source as any).arxivCategory && (
            <span
              className="text-[0.6rem] font-mono"
              style={{ color: "var(--color-ink-faint)" }}
            >
              {(source as any).arxivCategory}
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
          {source.platform === "arxiv" ? (
            <>
              {(source as any).authors && <span>{(source as any).authors}</span>}
            </>
          ) : (
            <>
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
            </>
          )}
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
  weeklyHistory,
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
  weeklyHistory?: TopicWeek[];
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
              <span className="hidden sm:inline">
                <QuadrantBadge quadrant={topic.quadrant as Quadrant | undefined} />
              </span>
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

          {/* Trend chart — weekly trend (7d) or daily activity (3d) */}
          <div className="hidden sm:flex items-center shrink-0">
            {weeklyHistory && sparklineDays === 7 ? (
              <TrendLine weeks={weeklyHistory} id={topic.slug} />
            ) : (
              <Sparkline sources={allSources ?? topic.sources} id={topic.slug} days={sparklineDays} />
            )}
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
          `${leader.label} leading the board — ${leaderFunded} NASA-funded ${leaderFunded === 1 ? "study" : "studies"} indexed. "${truncated}"`,
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

export default function PulseBoard({ topics, generatedAt, conceptMap = {}, topicHistory = {} }: Props) {
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

  // Rank trajectory: compare 7d vs 3d rankings to surface cross-window momentum
  const trajectoryMap = useMemo(() => {
    const active7d = recomputeForWindow(topics, "7d").filter(t => t.mentions > 0);
    const active3d = recomputeForWindow(topics, "3d").filter(t => t.mentions > 0);
    const rank7d = new Map(active7d.map((t, i) => [t.slug, i + 1] as const));
    const rank3d = new Map(active3d.map((t, i) => [t.slug, i + 1] as const));
    const map = new Map<string, number>();
    for (const [slug, r7] of rank7d) {
      const r3 = rank3d.get(slug);
      if (r3 != null && r7 !== r3) {
        map.set(slug, r7 - r3); // positive = higher rank in 3d = gaining recent momentum
      }
    }
    return map;
  }, [topics]);

  // Top movers: topics with biggest rank changes between 7d and 3d
  const movers = useMemo(() => {
    const entries = [...trajectoryMap.entries()];
    const findLabel = (slug: string) => topics.find(t => t.slug === slug)?.label ?? slug;
    const risers = entries
      .filter(([, d]) => d > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([slug, diff]) => ({ slug, label: findLabel(slug), diff }));
    const fallers = entries
      .filter(([, d]) => d < 0)
      .sort(([, a], [, b]) => a - b)
      .slice(0, 3)
      .map(([slug, diff]) => ({ slug, label: findLabel(slug), diff }));
    return { risers, fallers };
  }, [trajectoryMap, topics]);

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
            trajectory={trajectoryMap.get(heroTopic.slug)}
            weeklyHistory={topicHistory[heroTopic.slug]}
            showTrendLine={timeWindow === "7d"}
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

      {/* Quadrant summary */}
      <div className="mx-4 mb-3">
        <QuadrantSummary topics={windowTopics} />
      </div>

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

      {/* Movers ticker — 3d vs 7d rank trajectory */}
      {(movers.risers.length > 0 || movers.fallers.length > 0) && (
        <div
          className="mx-4 mb-3 px-4 py-2 rounded-lg flex items-center gap-3 flex-wrap"
          style={{
            background: "rgba(255,255,255,0.015)",
            border: "1px solid var(--color-paper-edge)",
          }}
        >
          <span
            className="text-[0.55rem] font-mono uppercase tracking-widest shrink-0"
            style={{ color: "var(--color-ink-faint)" }}
          >
            3d momentum
          </span>
          {movers.risers.map((m) => (
            <span key={m.slug} className="flex items-center gap-1 text-[0.6rem] font-mono">
              <span style={{ color: "#4ade80" }}>↑{m.diff}</span>
              <span style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-display)" }}>{m.label}</span>
            </span>
          ))}
          {movers.fallers.length > 0 && movers.risers.length > 0 && (
            <span style={{ color: "var(--color-ink-faint)", opacity: 0.3 }}>·</span>
          )}
          {movers.fallers.map((m) => (
            <span key={m.slug} className="flex items-center gap-1 text-[0.6rem] font-mono">
              <span style={{ color: "#f87171" }}>↓{Math.abs(m.diff)}</span>
              <span style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-display)" }}>{m.label}</span>
            </span>
          ))}
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
            <span className="w-[72px] hidden sm:block text-right">{timeWindow === "3d" ? "3-day" : "Trend"}</span>
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
          weeklyHistory={topicHistory[topic.slug]}
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

      {/* The signal — top sources, reactive to time window */}
      {(() => {
        // Collect all sources from active topics, deduplicate by URL
        const allWindowSources: PulseSource[] = [];
        const seen = new Set<string>();
        for (const t of activeTopics) {
          for (const s of t.sources) {
            if (!seen.has(s.url)) {
              seen.add(s.url);
              allWindowSources.push(s);
            }
          }
        }
        allWindowSources.sort((a, b) => b.score - a.score);
        const topSignalSources = allWindowSources.slice(0, 6);
        if (topSignalSources.length === 0) return null;

        const featured = topSignalSources[0];
        const rest = topSignalSources.slice(1);
        const fColor = platformColor(featured.platform);
        const fLabel = platformLabel(featured.platform);
        const fIcon = featured.platform === "youtube" ? "▶" : featured.platform === "reddit" ? "↑" : featured.platform === "arxiv" ? "📄" : "▴";

        return (
          <div className="mt-12 px-4">
            <div
              className="text-[0.6rem] font-mono uppercase tracking-[0.2em] mb-6"
              style={{ color: "var(--color-accent)" }}
            >
              The signal {timeWindow === "3d" ? "last 3 days" : "this week"}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Featured discussion — hero treatment */}
              <a
                href={featured.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group lg:col-span-3 rounded-xl border overflow-hidden transition-all hover:border-amber-400/40 hover:-translate-y-0.5 flex flex-col"
                style={{
                  background: "var(--color-paper-raised)",
                  borderColor: "var(--color-paper-edge)",
                }}
              >
                {featured.thumbnail && (
                  <div className="relative w-full aspect-video overflow-hidden">
                    <img
                      src={featured.thumbnail}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
                      <div
                        className="w-14 h-14 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(255,0,0,0.9)" }}
                      >
                        <svg viewBox="0 0 24 24" className="w-6 h-6 ml-0.5" fill="white">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="text-[0.6rem] font-mono uppercase tracking-widest px-2 py-0.5 rounded"
                      style={{ background: fColor.bg, color: fColor.fg }}
                    >
                      {fLabel}
                    </span>
                    {featured.subreddit && (
                      <span
                        className="text-[0.6rem] font-mono"
                        style={{ color: "var(--color-ink-faint)" }}
                      >
                        r/{featured.subreddit}
                      </span>
                    )}
                    <span
                      className="text-[0.55rem] font-mono uppercase tracking-widest ml-auto px-2 py-0.5 rounded"
                      style={{
                        background: "rgba(255,184,77,0.08)",
                        color: "var(--color-accent)",
                        border: "1px solid rgba(255,184,77,0.15)",
                      }}
                    >
                      Top signal
                    </span>
                  </div>

                  <p
                    className="font-semibold text-lg md:text-xl leading-snug group-hover:text-amber-300 transition-colors flex-1"
                    style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
                  >
                    {featured.title}
                  </p>

                  <div
                    className="mt-4 flex items-center gap-4 text-[0.65rem] font-mono"
                    style={{ color: "var(--color-ink-dim)" }}
                  >
                    <span style={{ color: "var(--color-accent)" }}>
                      {fIcon} {featured.score.toLocaleString()}
                    </span>
                    {featured.commentCount != null && (
                      <span>{featured.commentCount.toLocaleString()} comments</span>
                    )}
                    {featured.author && <span>by {featured.author}</span>}
                  </div>
                </div>
              </a>

              {/* Ranked list of remaining discussions */}
              <div className="lg:col-span-2 flex flex-col gap-1">
                <div
                  className="text-[0.6rem] font-mono uppercase tracking-widest px-3 py-2 mb-1"
                  style={{ color: "var(--color-ink-faint)" }}
                >
                  Also trending
                </div>
                {rest.map((source, i) => {
                  const pColor = platformColor(source.platform);
                  const pIcon = source.platform === "reddit" ? "↑" : source.platform === "youtube" ? "▶" : source.platform === "arxiv" ? "📄" : "▴";
                  return (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 px-3 py-3 rounded-lg transition-all hover:bg-white/[0.02]"
                    >
                      <span
                        className="text-xs font-mono w-4 text-right shrink-0 pt-0.5"
                        style={{ color: "var(--color-ink-faint)" }}
                      >
                        {i + 2}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-medium leading-snug group-hover:text-amber-300 transition-colors"
                          style={{
                            fontFamily: "var(--font-display)",
                            color: "var(--color-ink)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {source.title}
                        </p>
                        <div
                          className="mt-1 flex items-center gap-2 text-[0.6rem] font-mono"
                          style={{ color: "var(--color-ink-faint)" }}
                        >
                          <span
                            className="px-1.5 py-0.5 rounded"
                            style={{ background: pColor.bg, color: pColor.fg }}
                          >
                            {source.platform === "reddit"
                              ? `r/${source.subreddit || "space"}`
                              : source.platform === "hackernews"
                                ? "HN"
                                : source.platform === "arxiv"
                                  ? (source as any).arxivCategory || "ArXiv"
                                  : "YT"}
                          </span>
                          {source.platform === "arxiv" ? (
                            <span>{(source as any).authors || "preprint"}</span>
                          ) : (
                            <>
                              <span>{pIcon} {source.score.toLocaleString()}</span>
                              {source.commentCount != null && (
                                <span>{source.commentCount} comments</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Timestamp + sparkline legend */}
      <div
        className="mt-8 px-4 flex items-center gap-4 flex-wrap text-[0.6rem] font-mono"
        style={{ color: "var(--color-ink-faint)" }}
      >
        <span>
          Data from Reddit + Hacker News + ArXiv · Updated{" "}
          {new Date(generatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
        <span className="hidden sm:flex items-center gap-3 ml-auto">
          {timeWindow === "7d" ? (
            <>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-[2px]" style={{ background: "#4ade80" }} />
                Rising
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-[2px]" style={{ background: "#f87171" }} />
                Falling
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-[2px]" style={{ background: "#ffb84d" }} />
                Flat
              </span>
            </>
          ) : (
            <>
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
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: "#6495ed" }} />
                ArXiv
              </span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
