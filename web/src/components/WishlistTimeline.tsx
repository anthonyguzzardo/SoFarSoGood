/**
 * WishlistTimeline — "The River of Knowledge"
 *
 * An SVG horizontal timeline spanning 1800 BCE to 2024 CE. Each paper is a
 * dot positioned by year, sized by importance, colored by field. Hover shows
 * a tooltip; click scrolls to and highlights the corresponding card in the
 * WishlistBrowser below.
 *
 * Uses a piecewise linear scale to give more visual space to the
 * information-dense modern era while still showing ancient entries.
 */

import { useCallback, useMemo, useRef, useState } from "react";

interface Entry {
  id: string;
  title: string;
  author: string;
  year: number;
  field: string;
  importance: string;
  era: string;
}

interface Props {
  entries: Entry[];
  fieldColors: Record<string, string>;
  eraColors: Record<string, string>;
  eraLabels: Record<string, string>;
  eras: string[];
  onSelect?: (id: string) => void;
}

/** Piecewise linear mapping from year to 0-1 position. */
function yearToX(year: number): number {
  // Breakpoints: give more room to denser modern eras
  //   -1800 to 500   → 0.00 to 0.15  (ancient: 2300 years → 15%)
  //   500 to 1400    → 0.15 to 0.25  (medieval: 900 years → 10%)
  //   1400 to 1700   → 0.25 to 0.38  (early modern: 300 years → 13%)
  //   1700 to 1900   → 0.38 to 0.55  (enlightenment + 19th: 200 years → 17%)
  //   1900 to 2025   → 0.55 to 1.00  (20th-21st: 125 years → 45%)
  const segments: [number, number, number, number][] = [
    [-1800, 500, 0, 0.15],
    [500, 1400, 0.15, 0.25],
    [1400, 1700, 0.25, 0.38],
    [1700, 1900, 0.38, 0.55],
    [1900, 2025, 0.55, 1.0],
  ];

  for (const [yMin, yMax, xMin, xMax] of segments) {
    if (year >= yMin && year <= yMax) {
      const t = (year - yMin) / (yMax - yMin);
      return xMin + t * (xMax - xMin);
    }
  }
  // Clamp
  if (year < -1800) return 0;
  return 1;
}

/** Dot radius by importance. */
function importanceRadius(importance: string): number {
  switch (importance) {
    case "foundational": return 5;
    case "seminal": return 4;
    case "significant": return 3.5;
    default: return 3;
  }
}

function displayYear(year: number): string {
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

export default function WishlistTimeline({
  entries,
  fieldColors,
  eraColors,
  eraLabels,
  eras,
  onSelect,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    entry: Entry;
  } | null>(null);

  const WIDTH = 1200;
  const HEIGHT = 160;
  const PAD_X = 40;
  const PAD_Y = 30;
  const PLOT_W = WIDTH - PAD_X * 2;
  const PLOT_H = HEIGHT - PAD_Y * 2;

  /** Map entries to positioned dots, stacking vertically to avoid overlap. */
  const dots = useMemo(() => {
    // Sort by year for stacking
    const sorted = [...entries].sort((a, b) => a.year - b.year);
    // Track used y positions per x column (binned to 8px)
    const columns = new Map<number, number>();

    return sorted.map((e) => {
      const xNorm = yearToX(e.year);
      const x = PAD_X + xNorm * PLOT_W;
      const xBin = Math.round(x / 8) * 8;
      const col = columns.get(xBin) ?? 0;
      columns.set(xBin, col + 1);

      // Stack dots vertically from the center line
      const centerY = PAD_Y + PLOT_H / 2;
      const offset = col % 2 === 0 ? col / 2 : -(col + 1) / 2;
      const y = centerY + offset * 12;

      return { ...e, x, y: Math.max(PAD_Y + 6, Math.min(HEIGHT - PAD_Y - 6, y)) };
    });
  }, [entries]);

  /** Era background bands. */
  const eraBands = useMemo(() => {
    const eraYearRanges: Record<string, [number, number]> = {
      ancient: [-1800, 500],
      medieval: [500, 1400],
      "early-modern": [1400, 1700],
      enlightenment: [1700, 1800],
      "19th-century": [1800, 1900],
      "20th-century-early": [1900, 1945],
      "20th-century-mid": [1945, 1980],
      "20th-century-late": [1980, 2000],
      "21st-century": [2000, 2025],
    };

    return eras
      .filter((era) => eraYearRanges[era])
      .map((era) => {
        const [yMin, yMax] = eraYearRanges[era]!;
        const x1 = PAD_X + yearToX(yMin) * PLOT_W;
        const x2 = PAD_X + yearToX(yMax) * PLOT_W;
        return { era, x: x1, width: x2 - x1, color: eraColors[era] ?? "transparent" };
      });
  }, [eras, eraColors]);

  /** Axis tick marks. */
  const ticks = useMemo(() => {
    const years = [-1500, -1000, -500, 0, 500, 1000, 1400, 1600, 1700, 1800, 1900, 1950, 2000];
    return years.map((y) => ({
      year: y,
      x: PAD_X + yearToX(y) * PLOT_W,
      label: y < 0 ? `${Math.abs(y)} BCE` : y === 0 ? "0" : String(y),
    }));
  }, []);

  const handleDotClick = useCallback(
    (id: string) => {
      if (onSelect) onSelect(id);
      // Scroll to the card and highlight it
      const card = document.getElementById(`wishlist-${id}`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("highlight-pulse");
        setTimeout(() => card.classList.remove("highlight-pulse"), 2000);
      }
    },
    [onSelect]
  );

  const handleDotHover = useCallback(
    (entry: (Entry & { x: number; y: number }) | null) => {
      if (!entry) {
        setHoveredId(null);
        setTooltip(null);
        return;
      }
      setHoveredId(entry.id);
      // Use the dot's SVG-space position converted to percentage-based
      // positioning, so it doesn't jitter when the SVG scales.
      const xPct = (entry.x / WIDTH) * 100;
      const yPct = (entry.y / HEIGHT) * 100;
      setTooltip({ x: xPct, y: yPct, entry });
    },
    []
  );

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ maxHeight: "200px" }}
      >
        {/* Era background bands */}
        {eraBands.map((band) => (
          <rect
            key={band.era}
            x={band.x}
            y={PAD_Y - 4}
            width={band.width}
            height={PLOT_H + 8}
            fill={band.color}
            rx={2}
          />
        ))}

        {/* Center line */}
        <line
          x1={PAD_X}
          y1={PAD_Y + PLOT_H / 2}
          x2={PAD_X + PLOT_W}
          y2={PAD_Y + PLOT_H / 2}
          stroke="var(--color-paper-edge)"
          strokeWidth={1}
        />

        {/* Axis ticks */}
        {ticks.map((tick) => (
          <g key={tick.year}>
            <line
              x1={tick.x}
              y1={HEIGHT - PAD_Y + 4}
              x2={tick.x}
              y2={HEIGHT - PAD_Y + 10}
              stroke="var(--color-ink-faint)"
              strokeWidth={0.5}
            />
            <text
              x={tick.x}
              y={HEIGHT - 4}
              textAnchor="middle"
              fill="var(--color-ink-faint)"
              fontSize={8}
              fontFamily="var(--font-mono)"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {/* Paper dots — two layers: visible dot + larger invisible hit area */}
        {dots.map((d) => (
          <g key={d.id}>
            {/* Visible dot — never changes radius to avoid layout jitter */}
            <circle
              cx={d.x}
              cy={d.y}
              r={importanceRadius(d.importance)}
              fill={fieldColors[d.field] ?? "#6a6a72"}
              opacity={hoveredId && hoveredId !== d.id ? 0.3 : 0.85}
              style={{ transition: "opacity 0.15s" }}
              pointerEvents="none"
            />
            {/* Highlight ring — only visible on hover */}
            {hoveredId === d.id && (
              <circle
                cx={d.x}
                cy={d.y}
                r={importanceRadius(d.importance) + 2.5}
                fill="none"
                stroke="#fff"
                strokeWidth={1.5}
                opacity={0.8}
                pointerEvents="none"
              />
            )}
            {/* Invisible hit area — generous size for easy hovering */}
            <circle
              cx={d.x}
              cy={d.y}
              r={10}
              fill="transparent"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => handleDotHover(d)}
              onMouseLeave={() => handleDotHover(null)}
              onClick={() => handleDotClick(d.id)}
            />
          </g>
        ))}
      </svg>

      {/* Tooltip — positioned with percentages so it doesn't jitter on SVG scale */}
      {tooltip && (
        <div
          className="absolute pointer-events-none px-3 py-2 rounded text-xs z-20"
          style={{
            left: `${Math.min(tooltip.x, 80)}%`,
            bottom: `${100 - tooltip.y + 5}%`,
            background: "var(--color-paper-raised)",
            border: "1px solid var(--color-paper-edge)",
            fontFamily: "var(--font-mono)",
            maxWidth: "260px",
            whiteSpace: "nowrap",
          }}
        >
          <div
            className="font-semibold mb-0.5 leading-snug"
            style={{ fontFamily: "var(--font-display)", fontSize: "0.8125rem" }}
          >
            {tooltip.entry.title}
          </div>
          <div style={{ color: "var(--color-ink-dim)" }}>
            {tooltip.entry.author} · {displayYear(tooltip.entry.year)}
          </div>
          <div
            className="mt-0.5"
            style={{ color: fieldColors[tooltip.entry.field] ?? "var(--color-ink-dim)" }}
          >
            {tooltip.entry.field}
            {tooltip.entry.importance === "foundational" && " · foundational"}
          </div>
        </div>
      )}

      {/* Field legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 justify-center">
        {Object.entries(fieldColors)
          .filter(([f]) => entries.some((e) => e.field === f))
          .map(([field, color]) => (
            <div
              key={field}
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--color-ink-dim)", fontFamily: "var(--font-mono)" }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: color }}
              />
              {field.replace("-", " ")}
            </div>
          ))}
      </div>
    </div>
  );
}
