/**
 * PulseBoard — the trending leaderboard.
 *
 * A Kalshi-inspired ranked list of topics with momentum bars,
 * delta badges, and expandable rows that reveal the actual sources
 * (Reddit threads, HN posts) driving the trend.
 */

import { useState } from "react";
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
  maxScore,
  isExpanded,
  onToggle,
}: {
  topic: PulseTopic;
  rank: number;
  maxScore: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const barWidth = maxScore > 0 ? (topic.score / maxScore) * 100 : 0;

  return (
    <div>
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
        >
          {/* Rank */}
          <span
            className="text-sm font-mono w-6 text-right shrink-0"
            style={{ color: "var(--color-ink-faint)" }}
          >
            {rank}
          </span>

          {/* Direction arrow */}
          <span className={`text-xs shrink-0 ${directionColor(topic.direction)}`}>
            {directionArrow(topic.direction)}
          </span>

          {/* Label */}
          <span
            className="font-medium text-sm min-w-[140px] shrink-0 group-hover:text-amber-300 transition-colors"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-ink)" }}
          >
            {topic.label}
          </span>

          {/* Momentum bar */}
          <div className="flex-1 hidden sm:block">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.05)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${barWidth}%`,
                  background:
                    "linear-gradient(90deg, rgba(255,184,77,0.4), rgba(255,184,77,0.8))",
                }}
              />
            </div>
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
          {topic.relatedConceptSlugs.length > 0 && (
            <div className="ml-10 mt-3 flex items-center gap-2">
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
            </div>
          )}
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

  const activeTopics = topics.filter((t) => t.mentions > 0);
  const quietTopics = topics.filter((t) => t.mentions === 0);
  const maxScore = activeTopics[0]?.score ?? 1;

  const toggle = (slug: string) =>
    setExpanded((prev) => (prev === slug ? null : slug));

  return (
    <div>
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-4 py-2 mb-1 text-[0.6rem] font-mono uppercase tracking-widest"
        style={{ color: "var(--color-ink-faint)" }}
      >
        <span className="w-6 text-right">#</span>
        <span className="w-4" />
        <span className="min-w-[140px]">Topic</span>
        <span className="flex-1 hidden sm:block">Momentum</span>
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

      {/* Active topics */}
      {activeTopics.map((topic, i) => (
        <TopicRow
          key={topic.slug}
          topic={topic}
          rank={i + 1}
          maxScore={maxScore}
          isExpanded={expanded === topic.slug}
          onToggle={() => toggle(topic.slug)}
        />
      ))}

      {/* Quiet topics */}
      {quietTopics.length > 0 && (
        <div className="mt-6 px-4">
          <div
            className="text-[0.6rem] font-mono uppercase tracking-widest mb-2"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Quiet this week
          </div>
          <div className="flex flex-wrap gap-2">
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
