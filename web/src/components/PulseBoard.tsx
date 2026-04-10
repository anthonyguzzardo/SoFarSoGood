/**
 * PulseBoard — the trending leaderboard.
 *
 * A Kalshi-inspired ranked list of topics with momentum bars,
 * delta badges, and expandable rows that reveal the actual sources
 * (Reddit threads, HN posts) driving the trend.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { PulseTopic, PulseSource } from "../lib/pulse.ts";

interface Props {
  topics: PulseTopic[];
  generatedAt: string;
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
/* Sparkline — 7-day activity chart from source timestamps                    */
/* -------------------------------------------------------------------------- */

function Sparkline({ sources }: { sources: PulseSource[] }) {
  const now = Date.now();
  const dayMs = 86400000;
  const days = 7;

  // Bucket sources into daily bins (index 0 = 7 days ago, 6 = today)
  const buckets = new Array(days).fill(0);
  for (const s of sources) {
    const age = now - new Date(s.publishedAt).getTime();
    const dayIndex = days - 1 - Math.floor(age / dayMs);
    if (dayIndex >= 0 && dayIndex < days) {
      buckets[dayIndex]++;
    }
  }

  const max = Math.max(...buckets, 1);
  const w = 72;
  const h = 20;
  const barW = 7;
  const gap = (w - barW * days) / (days - 1);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      style={{ overflow: "visible" }}
    >
      {buckets.map((count, i) => {
        const barH = max > 0 ? (count / max) * (h - 2) : 0;
        const x = i * (barW + gap);
        const y = h - barH;
        const isToday = i === days - 1;
        const opacity = count === 0 ? 0.08 : 0.3 + (count / max) * 0.7;
        return (
          <rect
            key={i}
            x={x}
            y={count === 0 ? h - 2 : y}
            width={barW}
            height={count === 0 ? 2 : barH}
            rx={1.5}
            fill={isToday && count > 0 ? "#ffb84d" : "#ffb84d"}
            opacity={opacity}
          >
            {isToday && count > 0 && (
              <animate
                attributeName="opacity"
                values={`${opacity};${Math.max(opacity - 0.2, 0.3)};${opacity}`}
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </rect>
        );
      })}
    </svg>
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
}: {
  topic: PulseTopic;
  rank: number;
  isExpanded: boolean;
  onToggle: () => void;
  onCopyLink: () => void;
  copied: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
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
          style={rank === 1 ? { borderLeft: "2px solid var(--color-accent)" } : undefined}
        >
          {/* Rank */}
          <span
            className={`text-sm font-mono w-6 text-right shrink-0 ${rank === 1 ? "font-semibold" : ""}`}
            style={{ color: rank === 1 ? "var(--color-accent)" : "var(--color-ink-faint)" }}
          >
            {rank}
          </span>

          {/* Direction arrow */}
          <span className={`text-xs shrink-0 ${directionColor(topic.direction)}`}>
            {directionArrow(topic.direction)}
          </span>

          {/* Label + headline teaser */}
          <div className="flex-1 min-w-0">
            <span
              className="font-medium text-sm group-hover:text-amber-300 transition-colors block"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
            >
              {topic.label}
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
            <Sparkline sources={topic.sources} />
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
            {topic.relatedConceptSlugs.length > 0 && (
              <>
                <span
                  className="text-[0.6rem] font-mono uppercase tracking-widest"
                  style={{ color: "var(--color-ink-faint)" }}
                >
                  Related in the atlas:
                </span>
                {topic.relatedConceptSlugs.map((slug) => (
                  <a
                    key={slug}
                    href={`/concept/${slug}`}
                    className="text-xs font-mono px-2 py-1 rounded border transition-colors hover:border-amber-400/40"
                    style={{
                      color: "var(--color-accent)",
                      borderColor: "var(--color-paper-edge)",
                      background: "rgba(255,184,77,0.06)",
                    }}
                  >
                    {slug}
                  </a>
                ))}
              </>
            )}
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

export default function PulseBoard({ topics, generatedAt }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showQuiet, setShowQuiet] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const activeTopics = topics.filter((t) => t.mentions > 0);
  const quietTopics = topics.filter((t) => t.mentions === 0);

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

  return (
    <div>
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-4 py-2 mb-1 text-[0.6rem] font-mono uppercase tracking-widest"
        style={{ color: "var(--color-ink-faint)" }}
      >
        <span className="w-6 text-right">#</span>
        <span className="w-4" />
        <span className="flex-1">Topic</span>
        <span className="w-[72px] hidden sm:block text-right">7-day</span>
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

      {/* Biggest mover callout */}
      {biggestMover && (
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

      {/* Active topics */}
      {activeTopics.map((topic, i) => (
        <TopicRow
          key={topic.slug}
          topic={topic}
          rank={i + 1}
          isExpanded={expanded === topic.slug}
          onToggle={() => toggle(topic.slug)}
          onCopyLink={() => copyLink(topic.slug)}
          copied={copiedSlug === topic.slug}
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
              {quietTopics.length} topics quiet this week
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

      {/* Timestamp */}
      <div
        className="mt-8 px-4 text-[0.6rem] font-mono"
        style={{ color: "var(--color-ink-faint)" }}
      >
        Data from Reddit + Hacker News · Updated{" "}
        {new Date(generatedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}
