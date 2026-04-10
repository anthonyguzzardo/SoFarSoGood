/**
 * Typed access to the pulse (trending) data.
 *
 * Source of truth: `data/pulse.json`, produced by `ingestion/fetch-pulse.ts`.
 * Like concepts.ts, this is imported statically so Astro can build the pulse
 * page at build time — no runtime fetching.
 */

import rawPulse from "../../../data/pulse.json" with { type: "json" };
import rawWeek1 from "../../../data/pulse-2026-03-13.json" with { type: "json" };
import rawWeek2 from "../../../data/pulse-2026-03-20.json" with { type: "json" };
import rawWeek3 from "../../../data/pulse-2026-03-27.json" with { type: "json" };
import rawWeek4 from "../../../data/pulse-2026-04-03.json" with { type: "json" };

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface PulseSource {
  platform: "reddit" | "hackernews" | "youtube";
  title: string;
  url: string;
  score: number;
  author?: string;
  subreddit?: string;
  thumbnail?: string;
  commentCount?: number;
  publishedAt: string;
}

export interface PulseTopic {
  slug: string;
  label: string;
  score: number;
  delta: number;
  direction: "up" | "down" | "steady";
  mentions: number;
  sources: PulseSource[];
  relatedConceptSlugs: string[];
}

export interface PulseData {
  generatedAt: string;
  topics: PulseTopic[];
}

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const pulse = rawPulse as PulseData;

/** ISO timestamp of when the pulse data was last generated. */
export const generatedAt: string = pulse.generatedAt;

/** All topics sorted by score descending (highest trending first). */
export const allPulseTopics: PulseTopic[] = pulse.topics;

/** Only topics with actual activity. */
export const activePulseTopics: PulseTopic[] = pulse.topics.filter(
  (t) => t.mentions > 0,
);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Top N trending topics. */
export function getTrendingTopics(limit = 10): PulseTopic[] {
  return activePulseTopics.slice(0, limit);
}

/** Top sources across all topics for a given platform. */
export function getTopSources(
  platform?: "reddit" | "hackernews",
  limit = 6,
): PulseSource[] {
  const all = activePulseTopics.flatMap((t) => t.sources);
  const filtered = platform ? all.filter((s) => s.platform === platform) : all;
  // Dedupe by URL
  const seen = new Set<string>();
  const unique = filtered.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
  return unique.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Get a single topic by slug. */
export function getPulseTopic(slug: string): PulseTopic | undefined {
  return pulse.topics.find((t) => t.slug === slug);
}

/** Format the delta as a display string like "+340%" or "-15%". */
export function formatDelta(delta: number): string {
  if (delta === 0) return "—";
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

/** Format score for display: 1234 → "1.2k", 12345 → "12k". */
export function formatScore(score: number): string {
  if (score >= 10000) return `${Math.round(score / 1000)}k`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return String(score);
}

/** Relative time: "2h ago", "3d ago", etc. */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

/** Platform display label. */
export function platformLabel(platform: string): string {
  switch (platform) {
    case "reddit":
      return "Reddit";
    case "hackernews":
      return "Hacker News";
    case "youtube":
      return "YouTube";
    default:
      return platform;
  }
}

/** Stats about the current pulse. */
export const pulseStats = {
  totalTopics: activePulseTopics.length,
  totalMentions: activePulseTopics.reduce((s, t) => s + t.mentions, 0),
  totalSources: activePulseTopics.reduce((s, t) => s + t.sources.length, 0),
  topScore: activePulseTopics[0]?.score ?? 0,
};

/* -------------------------------------------------------------------------- */
/* Historical snapshots — multi-week trend data                               */
/* -------------------------------------------------------------------------- */

export interface TopicWeek {
  date: string;       // ISO date label for the week
  score: number;
  rank: number;       // 1-indexed, 0 = not present
  mentions: number;
}

export type TopicHistory = Record<string, TopicWeek[]>;

const snapshots: PulseData[] = [
  rawWeek1 as PulseData,
  rawWeek2 as PulseData,
  rawWeek3 as PulseData,
  rawWeek4 as PulseData,
  pulse,
];

const snapshotDates = [
  "2026-03-13",
  "2026-03-20",
  "2026-03-27",
  "2026-04-03",
  "2026-04-09", // current
];

/** Multi-week history for every topic: slug → array of weekly data points. */
export const topicHistory: TopicHistory = (() => {
  const history: TopicHistory = {};

  // Collect all known slugs
  const allSlugs = new Set<string>();
  for (const snap of snapshots) {
    for (const t of snap.topics) allSlugs.add(t.slug);
  }

  for (const slug of allSlugs) {
    const weeks: TopicWeek[] = [];
    for (let i = 0; i < snapshots.length; i++) {
      const active = snapshots[i].topics
        .filter((t) => t.mentions > 0)
        .sort((a, b) => b.score - a.score);
      const topic = snapshots[i].topics.find((t) => t.slug === slug);
      const rankIndex = active.findIndex((t) => t.slug === slug);
      weeks.push({
        date: snapshotDates[i],
        score: topic?.score ?? 0,
        rank: rankIndex >= 0 ? rankIndex + 1 : 0,
        mentions: topic?.mentions ?? 0,
      });
    }
    history[slug] = weeks;
  }

  return history;
})();
