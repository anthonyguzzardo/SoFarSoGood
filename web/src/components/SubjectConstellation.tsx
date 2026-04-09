/**
 * SubjectConstellation — a force-positioned visualization where keywords
 * are stars and proximity reflects co-occurrence in the same concepts.
 *
 * Keywords that frequently appear together cluster into constellations.
 * Click any keyword to search for it in the ConceptBrowser.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

interface KeywordNode {
  label: string;
  count: number;
}

interface CoEdge {
  source: string;
  target: string;
  weight: number;
}

interface Props {
  keywords: KeywordNode[];
  edges: CoEdge[];
}

interface GNode {
  id: string;
  label: string;
  count: number;
}

interface GLink {
  source: string;
  target: string;
  weight: number;
}

export default function SubjectConstellation({ keywords, edges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const HEIGHT = 500;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(containerRef.current);
    setWidth(containerRef.current.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Only include keywords that appear in at least one edge
  const connectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of edges) {
      s.add(e.source);
      s.add(e.target);
    }
    return s;
  }, [edges]);

  const graphData = useMemo(() => {
    const nodes: GNode[] = keywords
      .filter((k) => connectedIds.has(k.label))
      .map((k) => ({ id: k.label, label: k.label, count: k.count }));

    const nodeSet = new Set(nodes.map((n) => n.id));
    const links: GLink[] = edges.filter(
      (e) => nodeSet.has(e.source) && nodeSet.has(e.target)
    );

    return { nodes, links };
  }, [keywords, edges, connectedIds]);

  const maxCount = useMemo(
    () => Math.max(...graphData.nodes.map((n) => n.count), 1),
    [graphData]
  );

  return (
    <div ref={containerRef} className="w-full">
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center text-xs font-mono"
            style={{ height: HEIGHT, color: "var(--color-ink-faint)" }}
          >
            building constellation…
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
            const t = Math.log(n.count + 1) / Math.log(maxCount + 1);
            const radius = 2 + t * 5;

            // Star dot
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
            ctx.fillStyle = `rgba(255, 184, 77, ${0.3 + t * 0.7})`;
            ctx.fill();

            // Label
            if (globalScale > 0.6 || n.count > maxCount * 0.3) {
              const fontSize = Math.max(9, 10 + t * 4) / globalScale;
              ctx.font = `${fontSize}px ui-monospace, "JetBrains Mono", monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = `rgba(232, 230, 223, ${0.35 + t * 0.65})`;
              ctx.fillText(n.label, n.x, n.y + radius + 2);
            }
          }}
          linkColor={(link: any) => {
            const w = (link as GLink).weight;
            const opacity = Math.min(0.04 + w * 0.03, 0.2);
            return `rgba(255, 184, 77, ${opacity})`;
          }}
          linkWidth={(link: any) => Math.max(0.5, (link as GLink).weight * 0.5)}
          onNodeClick={(node: any) => {
            window.location.href = `/?q=${encodeURIComponent((node as GNode).label)}`;
          }}
          cooldownTicks={100}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.4}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      </Suspense>
    </div>
  );
}
