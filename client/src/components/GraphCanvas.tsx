import { useCallback, useEffect, useRef, useState } from "react";
import { useForceSimulation } from "@/hooks/useForceSimulation";
import { GraphNode } from "./GraphNode";
import { GraphEdge } from "./GraphEdge";
import type { Node, Edge } from "@shared/schema";

type Props = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: number | null;
  onSelectNode: (id: number | null) => void;
  onNodeDoubleClick: (id: number) => void;
  onUpdateNodePosition: (id: number, x: number, y: number) => void;
};

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onNodeDoubleClick,
  onUpdateNodePosition,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateDimensions);
      observer.disconnect();
    };
  }, []);

  const { simNodes, fixNode, releaseNode } = useForceSimulation(
    nodes,
    edges,
    dimensions.width,
    dimensions.height
  );

  const handleDragStart = useCallback(
    (id: number) => {
      const node = simNodes.find((n) => n.id === id);
      if (node) {
        fixNode(id, node.x, node.y);
      }
    },
    [simNodes, fixNode]
  );

  const handleDrag = useCallback(
    (id: number, x: number, y: number) => {
      fixNode(id, x, y);
    },
    [fixNode]
  );

  const handleDragEnd = useCallback(
    (id: number) => {
      const node = simNodes.find((n) => n.id === id);
      if (node) {
        onUpdateNodePosition(id, Math.round(node.x), Math.round(node.y));
      }
      releaseNode(id);
    },
    [simNodes, releaseNode, onUpdateNodePosition]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "svg") {
        onSelectNode(null);
      }
    },
    [onSelectNode]
  );

  return (
    <div
      ref={containerRef}
      id="graph-canvas"
      className="relative w-full h-full bg-background overflow-hidden"
      onClick={handleCanvasClick}
      data-testid="graph-canvas"
    >
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        {edges.map((edge) => (
          <GraphEdge key={edge.id} edge={edge} nodes={simNodes} />
        ))}
      </svg>

      {simNodes.map((simNode) => {
        const node = nodes.find((n) => n.id === simNode.id);
        if (!node) return null;
        return (
          <GraphNode
            key={node.id}
            node={node}
            x={simNode.x}
            y={simNode.y}
            isSelected={selectedNodeId === node.id}
            onSelect={onSelectNode}
            onDragStart={handleDragStart}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onDoubleClick={onNodeDoubleClick}
          />
        );
      })}

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-muted-foreground max-w-md px-6">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-muted-foreground/60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">No logic map yet</h3>
            <p className="text-sm">
              Upload a document or paste your text to transform it into an interactive logical map.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
