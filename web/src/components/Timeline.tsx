/**
 * Timeline view — every concept as a dot on a horizontal year axis.
 *
 * Layout strategy:
 *   - The x-axis is years, evenly spaced from min to max year.
 *   - For each year, concepts stack vertically as a "column" of dots.
 *   - Hovering a dot shows a floating tooltip with title, PI, and abstract
 *     excerpt. Clicking navigates to the concept page.
 *   - Filter by phase via the chip row above the chart, like the browser.
 *
 * This is a React island so it can be interactive without a route reload,
 * but it could just as easily be a pure SVG in an .astro file. We use
 * React for the hover state management and so we can later add a "scrub"
 * mode that animates a vertical playhead across years.
 */

import { useMemo, useState } from "react";
import type { Concept, Phase } from "../../../shared/concept.ts";

interface Props {
  concepts: Concept[];
}

const PHASES: Array<Phase | "any"> = ["any", "I", "II", "III"];

const PHASE_COLOR: Record<string, string> = {
  I: "#ffb84d",
  II: "#ff8c4d",
  III: "#ff4d4d",
  unknown: "#6a6a72",
};

interface PositionedDot {
  c: Concept;
  cx: number;
  cy: number;
  r: number;
}

export default function Timeline({ concepts }: Props) {
  const [phase, setPhase] = useState<Phase | "any">("any");
  const [hovered, setHovered] = useState<PositionedDot | null>(null);

  const filtered = useMemo(
    () => (phase === "any" ? concepts : concepts.filter((c) => c.phase === phase)),
    [concepts, phase]
  );

  const years = useMemo(() => {
    const s = new Set(concepts.map((c) => c.year));
    return [...s].sort((a, b) => a - b);
  }, [concepts]);

  const minYear = years[0]!;
  const maxYear = years[years.length - 1]!;

  // SVG dimensions. Width is responsive via viewBox; height is bounded by
  // the densest column so all dots fit comfortably.
  const W = 1000;
  const PADDING_X = 60;
  const PADDING_TOP = 40;
  const PADDING_BOTTOM = 60;
  const ROW_HEIGHT = 14;
  const DOT_R = 4.5;

  const xForYear = (year: number) => {
    if (maxYear === minYear) return W / 2;
    return (
      PADDING_X +
      ((year - minYear) / (maxYear - minYear)) * (W - 2 * PADDING_X)
    );
  };

  // Stack concepts per year for vertical column layout.
  const dots = useMemo<PositionedDot[]>(() => {
    const perYear = new Map<number, Concept[]>();
    for (const c of filtered) {
      const list = perYear.get(c.year) ?? [];
      list.push(c);
      perYear.set(c.year, list);
    }
    const out: PositionedDot[] = [];
    for (const [year, list] of perYear) {
      list.forEach((c, i) => {
        out.push({
          c,
          cx: xForYear(year),
          cy: PADDING_TOP + i * ROW_HEIGHT,
          r: DOT_R,
        });
      });
    }
    return out;
  }, [filtered, minYear, maxYear]);

  const maxStack = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of filtered) counts.set(c.year, (counts.get(c.year) ?? 0) + 1);
    return Math.max(0, ...counts.values());
  }, [filtered]);

  const H = PADDING_TOP + maxStack * ROW_HEIGHT + PADDING_BOTTOM;

  return (
    <div>
      {/* Phase filter chips */}
      <div className="flex items-center gap-2 mb-6 text-xs">
        <span className="eyebrow mr-1">Phase</span>
        {PHASES.map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            className="px-2 py-1 rounded border transition font-mono"
            style={{
              borderColor:
                phase === p ? "var(--color-accent)" : "var(--color-paper-edge)",
              color:
                phase === p ? "var(--color-accent)" : "var(--color-ink-dim)",
            }}
          >
            {p === "any" ? "any" : p}
          </button>
        ))}
        <span className="ml-auto eyebrow">
          {filtered.length} concepts plotted
        </span>
      </div>

      {/* Chart */}
      <div className="relative surface rounded-lg p-4 overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          style={{ maxHeight: "70vh" }}
        >
          {/* Year tick marks + labels */}
          {years.map((year) => {
            const x = xForYear(year);
            return (
              <g key={year}>
                <line
                  x1={x}
                  x2={x}
                  y1={PADDING_TOP - 8}
                  y2={H - PADDING_BOTTOM + 8}
                  stroke="var(--color-paper-edge)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                />
                <text
                  x={x}
                  y={H - PADDING_BOTTOM + 28}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  fill="var(--color-ink-dim)"
                >
                  {year}
                </text>
              </g>
            );
          })}

          {/* Dots */}
          {dots.map((d, i) => {
            const isHovered = hovered === d;
            return (
              <a
                key={`${d.c.slug}-${i}`}
                href={`/concept/${d.c.slug}`}
                onMouseEnter={() => setHovered(d)}
                onMouseLeave={() =>
                  setHovered((current) => (current === d ? null : current))
                }
              >
                <circle
                  cx={d.cx}
                  cy={d.cy}
                  r={isHovered ? d.r + 2 : d.r}
                  fill={PHASE_COLOR[d.c.phase ?? "unknown"]}
                  fillOpacity={isHovered ? 1 : 0.75}
                  stroke={isHovered ? "white" : "transparent"}
                  strokeWidth={1.5}
                  style={{ cursor: "pointer", transition: "all 80ms" }}
                />
              </a>
            );
          })}
        </svg>

        {/* Tooltip — positioned in normal flow below the chart so it never
            collides with the SVG hover area. The chart is the discovery
            surface, the tooltip is the readout. */}
        <div
          className="mt-4 pt-4 border-t hairline min-h-[110px]"
          style={{ borderColor: "var(--color-paper-edge)" }}
        >
          {hovered ? (
            <a
              href={`/concept/${hovered.c.slug}`}
              className="block group"
              key={hovered.c.slug}
            >
              <div className="eyebrow mb-1">
                {hovered.c.year}
                {hovered.c.phase && (
                  <span style={{ color: "var(--color-accent)" }}>
                    {" "}
                    · NIAC Phase {hovered.c.phase}
                  </span>
                )}
                {hovered.c.authors[0] && (
                  <span> · {hovered.c.authors[0].name}</span>
                )}
              </div>
              <h4 className="font-display text-xl font-semibold leading-snug group-hover:underline">
                {hovered.c.title}
              </h4>
              <p
                className="mt-2 text-sm leading-relaxed line-clamp-2"
                style={{ color: "var(--color-ink-dim)" }}
              >
                {hovered.c.abstract.slice(0, 240)}…
              </p>
            </a>
          ) : (
            <div className="eyebrow">
              hover a dot to inspect · click to read
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs eyebrow">
        <span>Phase legend:</span>
        {(["I", "II", "III", "unknown"] as const).map((p) => (
          <span key={p} className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: PHASE_COLOR[p] }}
            />
            {p === "unknown" ? "unknown" : `Phase ${p}`}
          </span>
        ))}
      </div>
    </div>
  );
}
