/**
 * Typed access to curated topic deep dives.
 *
 * Topics sit *above* the concept corpus — they represent big scientific
 * questions and fields (black holes, gravity, quantum physics) that NIAC
 * concepts contribute to. Each topic links to NIAC concepts, curated media,
 * historical milestones, and open questions.
 */

import { getConcept } from "./concepts.ts";
import type { Concept } from "../../../shared/concept.ts";
import rawTopics from "../../../data/topics.json" with { type: "json" };

export interface MediaEntry {
  title: string;
  source: string;
  type: "video" | "podcast" | "book" | "documentary" | "interview" | "article";
  url: string;
  note: string;
}

export interface TimelineEntry {
  year: number;
  event: string;
}

export interface UnsolvedProblem {
  name: string;
  yearPosed: number;
  posedBy: string;
  status: "open" | "partially-resolved" | "resolved";
  significance: string;
  milestones: TimelineEntry[];
}

export interface ThoughtExperiment {
  name: string;
  yearProposed: number;
  proposedBy: string;
  description: string;
  modernStatus: string;
}

export interface Misconception {
  claim: string;
  reality: string;
}

export interface Equation {
  name: string;       // "Schwarzschild Metric"
  equation: string;   // Unicode math — "ds² = −(1 − rₛ/r)c²dt² + ..."
  note: string;       // Brief explanation of what it means
}

export interface Topic {
  slug: string;
  title: string;
  subtitle: string;
  overview: string;
  openQuestions: string[];
  unsolvedProblems: UnsolvedProblem[];
  thoughtExperiments: ThoughtExperiment[];
  misconceptions?: Misconception[];
  equations?: Equation[];
  timeline: TimelineEntry[];
  media: MediaEntry[];
  relatedConceptSlugs: string[];
  searchTerms: string[];
  relatedTopicSlugs: string[];
  /**
   * Topic maturity. Controls rendering density.
   * "full" = all sections populated (existing 5 topics).
   * "standard" = overview, open questions, timeline, related concepts.
   * "stub" = overview + related concepts. Placeholder for community expansion.
   * Defaults to "full" for backward compatibility.
   */
  tier?: "full" | "standard" | "stub";
}

export const allTopics: Topic[] = rawTopics as Topic[];

const bySlug = new Map<string, Topic>();
for (const t of allTopics) bySlug.set(t.slug, t);

export function getTopic(slug: string): Topic | undefined {
  return bySlug.get(slug);
}

/** Resolve a topic's related concept slugs into actual Concept objects. */
export function getTopicConcepts(topic: Topic): Concept[] {
  return topic.relatedConceptSlugs
    .map((s) => getConcept(s))
    .filter((c): c is Concept => c !== undefined);
}

/** Resolve a topic's related topic slugs into Topic objects. */
export function getRelatedTopics(topic: Topic): Topic[] {
  return topic.relatedTopicSlugs
    .map((s) => getTopic(s))
    .filter((t): t is Topic => t !== undefined);
}

/** Topics grouped by tier. */
export function topicsByTier() {
  return {
    full: allTopics.filter((t) => (t.tier ?? "full") === "full"),
    standard: allTopics.filter((t) => t.tier === "standard"),
    stub: allTopics.filter((t) => t.tier === "stub"),
  };
}

/** Icon for media types. */
export function mediaIcon(type: MediaEntry["type"]): string {
  switch (type) {
    case "video":
      return "▶";
    case "podcast":
      return "🎙";
    case "book":
      return "📖";
    case "documentary":
      return "🎬";
    case "interview":
      return "💬";
    case "article":
      return "📄";
  }
}
