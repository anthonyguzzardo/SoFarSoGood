/**
 * ConceptNeighborhood — a mini force graph showing a concept and its
 * immediate neighbors. Replaces the flat "More like this" grid with a
 * visual cluster that invites exploration.
 *
 * Uses react-force-graph-2d (already installed) via dynamic import to
 * keep SSR clean. Shows only the center concept + its related concepts
 * as a small star-pattern graph.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

interface RelatedConcept {
  slug: string;
  title: string;
  year: number;
  phase: string | null;
}

interface Props {
  center: RelatedConcept;
  neighbors: RelatedConcept[];
}

interface GNode {
  id: string;
  title: string;
  year: number;
  isCenter: boolean;
  color: string;
}

interface GLink {
  source: string;
  target: string;
}

const PHASE_COLOR: Record<string, string> = {
  I: "#ffb84d",
  II: "#ff8c4d",
  III: "#ff4d4d",
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default function ConceptNeighborhood({ center, neighbors }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(500);
  const HEIGHT = 300;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    setWidth(containerRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodes: GNode[] = [
      {
        id: center.slug,
        title: center.title,
        year: center.year,
        isCenter: true,
        color: PHASE_COLOR[center.phase ?? ""] ?? "#e8e6df",
      },
      ...neighbors.map((n) => ({
        id: n.slug,
        title: n.title,
        year: n.year,
        isCenter: false,
        color: PHASE_COLOR[n.phase ?? ""] ?? "#6a6a72",
      })),
    ];

    const links: GLink[] = neighbors.map((n) => ({
      source: center.slug,
      target: n.slug,
    }));

    return { nodes, links };
  }, [center, neighbors]);

  return (
    <div ref={containerRef} className="w-full">
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center text-xs font-mono"
            style={{ height: HEIGHT, color: "var(--color-ink-faint)" }}
          >
            loading graph…
          </div>
        }
      >
        <ForceGraph2D
          width={width}
          height={HEIGHT}
          graphData={graphData}
          backgroundColor="transparent"
          nodeRelSize={1}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const n = node as GNode & { x: number; y: number };
            const radius = n.isCenter ? 8 : 5;

            // Draw circle
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = n.color;
            ctx.globalAlpha = n.isCenter ? 1 : 0.75;
            ctx.fill();
            ctx.globalAlpha = 1;

            // Draw label if zoomed enough or center node
            if (globalScale > 0.8 || n.isCenter) {
              const label = truncate(n.title, 32);
              const fontSize = n.isCenter ? 11 / globalScale : 9 / globalScale;
              ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = n.isCenter ? "#e8e6df" : "#9a978c";
              ctx.fillText(label, n.x, n.y + radius + 3);
            }
          }}
          linkColor={() => "rgba(255, 184, 77, 0.15)"}
          linkWidth={1}
          onNodeClick={(node: any) => {
            window.location.href = `/concept/${node.id}`;
          }}
          cooldownTicks={60}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.3}
          enableZoomInteraction={false}
          enablePanInteraction={false}
        />
      </Suspense>
    </div>
  );
}
