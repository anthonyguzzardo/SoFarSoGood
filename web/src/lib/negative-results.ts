/**
 * Typed access to the negative results archive — experiments that
 * didn't work, and why that matters.
 */

import rawResults from "../../../data/negative-results.json" with { type: "json" };

export interface NegativeResult {
  id: string;
  title: string;
  researchers: string;
  year: number;
  field: string;
  hypothesis: string;
  whatHappened: string;
  whyItMatters: string;
  status: "debunked" | "inconclusive" | "superseded" | "retracted";
  relatedConceptSlugs?: string[];
}

export const allNegativeResults: NegativeResult[] =
  rawResults as NegativeResult[];

/** Stats about the archive. */
export const graveyardStats = {
  total: allNegativeResults.length,
  debunked: allNegativeResults.filter((r) => r.status === "debunked").length,
  superseded: allNegativeResults.filter((r) => r.status === "superseded").length,
  retracted: allNegativeResults.filter((r) => r.status === "retracted").length,
  inconclusive: allNegativeResults.filter((r) => r.status === "inconclusive").length,
  oldestYear: Math.min(...allNegativeResults.map((r) => r.year)),
  newestYear: Math.max(...allNegativeResults.map((r) => r.year)),
  fields: [...new Set(allNegativeResults.map((r) => r.field))].sort(),
};

/** Status label for display. */
export function statusLabel(status: NegativeResult["status"]): string {
  const labels: Record<NegativeResult["status"], string> = {
    debunked: "Debunked",
    inconclusive: "Inconclusive",
    superseded: "Superseded",
    retracted: "Retracted",
  };
  return labels[status] ?? status;
}

/** Status color for badges. */
export function statusColor(status: NegativeResult["status"]): string {
  const colors: Record<NegativeResult["status"], string> = {
    debunked: "#f87171",
    inconclusive: "#fbbf24",
    superseded: "#60a5fa",
    retracted: "#a78bfa",
  };
  return colors[status] ?? "var(--color-ink-dim)";
}
