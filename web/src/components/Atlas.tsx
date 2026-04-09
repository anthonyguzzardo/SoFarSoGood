/**
 * Atlas — force-directed graph view of every concept and the connections
 * between them.
 *
 * Edges are computed at module load from two signals:
 *   1. Shared keywords (3+ overlapping)         — strong topical link
 *   2. Shared lead PI                           — research lineage link
 *
 * This is a placeholder for the eventual embedding-based version. Even with
 * just keyword overlap it surfaces real clusters: the tether papers cluster,
 * the venus papers cluster, the propulsion authors cluster.
 *
 * Implementation notes:
 *   - We dynamic-import react-force-graph-2d so SSR doesn't try to load
 *     canvas dependencies (the library is browser-only).
 *   - Node radius is scaled by degree — more-connected concepts are bigger.
 *   - Click navigates to the concept page; hover shows a side panel.
 *   - The graph fills the available width and a fixed pixel height. Drag
 *     and zoom are handled by the library.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Concept } from "../../../shared/concept.ts";

// Dynamic-import keeps the SSR build clean.
const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

interface Props {
  concepts: Concept[];
}

interface GraphNode {
  id: string;
  title: string;
  year: number;
  phase: string | null;
  pi: string;
  degree: number;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

const PHASE_COLOR: Record<string, string> = {
  I: "#ffb84d",
  II: "#ff8c4d",
  III: "#ff4d4d",
  unknown: "#6a6a72",
};

export default function Atlas({ concepts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [height] = useState(640);
  const [hovered, setHovered] = useState<GraphNode | null>(null);

  // Resize observer keeps the canvas filling its container.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ----------------------------------------------------------------- */
  /* Build graph data once per concepts array.                         */
  /* ----------------------------------------------------------------- */
  const graphData = useMemo(() => {
    const nodes: Map<string, GraphNode> = new Map();
    const links: GraphLink[] = [];

    for (const c of concepts) {
      nodes.set(c.slug, {
        id: c.slug,
        title: c.title,
        year: c.year,
        phase: c.phase,
        pi: c.authors.find((a) => a.isPI)?.name ?? "",
        degree: 0,
        color: PHASE_COLOR[c.phase ?? "unknown"]!,
      });
    }

    // O(n²) edge build — fine at n=188.
    for (let i = 0; i < concepts.length; i++) {
      const a = concepts[i]!;
      const aKw = new Set(a.keywords);
      const aPI = a.authors.find((x) => x.isPI)?.name ?? "";
      for (let j = i + 1; j < concepts.length; j++) {
        const b = concepts[j]!;
        let weight = 0;
        let shared = 0;
        for (const k of b.keywords) if (aKw.has(k)) shared++;
        if (shared >= 3) weight += shared;
        const bPI = b.authors.find((x) => x.isPI)?.name ?? "";
        if (aPI && aPI === bPI) weight += 5;
        if (weight > 0) {
          links.push({ source: a.slug, target: b.slug, weight });
          nodes.get(a.slug)!.degree += 1;
          nodes.get(b.slug)!.degree += 1;
        }
      }
    }

    return { nodes: [...nodes.values()], links };
  }, [concepts]);

  return (
    <div>
      {/* Top meta strip */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <div className="eyebrow">
          {graphData.nodes.length} concepts · {graphData.links.length} connections
        </div>
        <div className="eyebrow">drag · scroll to zoom · click a node to read</div>
      </div>

      {/* Graph canvas */}
      <div
        ref={containerRef}
        className="surface rounded-lg overflow-hidden"
        style={{ height }}
      >
        <Suspense
          fallback={
            <div className="h-full w-full flex items-center justify-center text-dim font-mono text-sm">
              loading atlas…
            </div>
          }
        >
          <ForceGraph2D
            width={width}
            height={height}
            graphData={graphData as any}
            backgroundColor="rgba(0,0,0,0)"
            nodeRelSize={4}
            nodeVal={(n: any) => 1 + Math.sqrt(n.degree)}
            nodeColor={(n: any) => n.color}
            linkColor={() => "rgba(255,255,255,0.08)"}
            linkWidth={(l: any) => Math.min(2, l.weight * 0.4)}
            cooldownTicks={120}
            onNodeHover={(n: any) => setHovered(n ?? null)}
            onNodeClick={(n: any) => {
              window.location.href = `/concept/${n.id}`;
            }}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node: any, ctx: any, globalScale: number) => {
              if (globalScale < 1.5) return;
              const label = node.title;
              const fontSize = 10 / globalScale;
              ctx.font = `${fontSize}px ui-sans-serif`;
              ctx.fillStyle = "rgba(232,230,223,0.8)";
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText(
                label.length > 38 ? label.slice(0, 36) + "…" : label,
                node.x,
                node.y + 6
              );
            }}
          />
        </Suspense>
      </div>

      {/* Hover readout */}
      <div
        className="mt-6 pt-4 border-t hairline min-h-[110px]"
        style={{ borderColor: "var(--color-paper-edge)" }}
      >
        {hovered ? (
          <a href={`/concept/${hovered.id}`} className="block group">
            <div className="eyebrow mb-1">
              {hovered.year}
              {hovered.phase && (
                <span style={{ color: "var(--color-accent)" }}>
                  {" "}
                  · NIAC Phase {hovered.phase}
                </span>
              )}
              {hovered.pi && <span> · {hovered.pi}</span>}
              <span> · {hovered.degree} connections</span>
            </div>
            <h4 className="font-display text-xl font-semibold leading-snug group-hover:underline">
              {hovered.title}
            </h4>
          </a>
        ) : (
          <div className="eyebrow">hover any node to inspect</div>
        )}
      </div>
    </div>
  );
}
