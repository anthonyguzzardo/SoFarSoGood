/**
 * Typed access to the wishlist — every paper we want indexed.
 */

import rawWishlist from "../../../data/wishlist.json" with { type: "json" };

export interface WishlistEntry {
  id: string;
  title: string;
  author: string;
  year: number;
  field: string;
  subfield: string;
  significance: string;
  era: string;
  importance: "foundational" | "seminal" | "significant" | "notable";
  status: "wanted" | "acquired" | "indexed";
  source: string;
}

export const allWishlistEntries: WishlistEntry[] =
  rawWishlist as WishlistEntry[];

/** Display year — handles BCE dates. */
export function displayYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

/** Unique fields in the corpus, sorted. */
export const allFields: string[] = [
  ...new Set(allWishlistEntries.map((e) => e.field)),
].sort();

/** Unique eras in the corpus, in chronological order. */
export const allEras: string[] = [
  "ancient",
  "medieval",
  "early-modern",
  "enlightenment",
  "19th-century",
  "20th-century-early",
  "20th-century-mid",
  "20th-century-late",
  "21st-century",
].filter((era) => allWishlistEntries.some((e) => e.era === era));

/** Human-readable era labels. */
export function eraLabel(era: string): string {
  const labels: Record<string, string> = {
    ancient: "Ancient World (before 500 CE)",
    medieval: "Medieval & Islamic Golden Age (500–1400)",
    "early-modern": "Renaissance & Early Modern (1400–1700)",
    enlightenment: "Enlightenment (1700–1800)",
    "19th-century": "19th Century",
    "20th-century-early": "Early 20th Century (1900–1945)",
    "20th-century-mid": "Mid 20th Century (1945–1980)",
    "20th-century-late": "Late 20th Century (1980–2000)",
    "21st-century": "21st Century (2000–present)",
  };
  return labels[era] ?? era;
}

/** Human-readable field labels. */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    mathematics: "Mathematics",
    physics: "Physics",
    astronomy: "Astronomy",
    chemistry: "Chemistry",
    biology: "Biology",
    medicine: "Medicine",
    "computer-science": "Computer Science",
    "earth-science": "Earth Science",
    engineering: "Engineering",
    philosophy: "Philosophy",
    "social-science": "Social Science",
  };
  return labels[field] ?? field;
}

/** Stats about the wishlist. */
export const wishlistStats = {
  total: allWishlistEntries.length,
  wanted: allWishlistEntries.filter((e) => e.status === "wanted").length,
  acquired: allWishlistEntries.filter((e) => e.status === "acquired").length,
  indexed: allWishlistEntries.filter((e) => e.status === "indexed").length,
  oldestYear: Math.min(...allWishlistEntries.map((e) => e.year)),
  newestYear: Math.max(...allWishlistEntries.map((e) => e.year)),
  yearSpan:
    Math.max(...allWishlistEntries.map((e) => e.year)) -
    Math.min(...allWishlistEntries.map((e) => e.year)),
  byField: Object.fromEntries(
    allFields.map((f) => [
      f,
      allWishlistEntries.filter((e) => e.field === f).length,
    ])
  ),
  byEra: Object.fromEntries(
    allEras.map((era) => [
      era,
      allWishlistEntries.filter((e) => e.era === era).length,
    ])
  ),
};
