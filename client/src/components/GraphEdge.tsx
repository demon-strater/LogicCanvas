import { memo } from "react";
import type { Edge } from "@shared/schema";

type SimNode = {
  id: number;
  x: number;
  y: number;
};

type Props = {
  edge: Edge;
  nodes: SimNode[];
};

const edgeTypeConfig = {
  related: { color: "stroke-muted-foreground/40", dashArray: "" },
  supports: { color: "stroke-chart-3/60", dashArray: "" },
  contradicts: { color: "stroke-destructive/60", dashArray: "8 4" },
  implies: { color: "stroke-primary/60", dashArray: "4 4" },
};

function GraphEdgeComponent({ edge, nodes }: Props) {
  const source = nodes.find((n) => n.id === edge.sourceId);
  const target = nodes.find((n) => n.id === edge.targetId);

  if (!source || !target) return null;

  const config = edgeTypeConfig[edge.edgeType as keyof typeof edgeTypeConfig] || edgeTypeConfig.related;

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return null;

  const midX = (source.x + target.x) / 2;
  const midY = (source.y + target.y) / 2;

  const arrowSize = 8;
  const angle = Math.atan2(dy, dx);
  const arrowX = target.x - (dx / dist) * 50;
  const arrowY = target.y - (dy / dist) * 50;

  const arrowPoints = [
    [arrowX, arrowY],
    [
      arrowX - arrowSize * Math.cos(angle - Math.PI / 6),
      arrowY - arrowSize * Math.sin(angle - Math.PI / 6),
    ],
    [
      arrowX - arrowSize * Math.cos(angle + Math.PI / 6),
      arrowY - arrowSize * Math.sin(angle + Math.PI / 6),
    ],
  ]
    .map((p) => p.join(","))
    .join(" ");

  return (
    <g data-testid={`edge-${edge.id}`}>
      <line
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        className={config.color}
        strokeWidth={2}
        strokeDasharray={config.dashArray}
        strokeLinecap="round"
      />
      <polygon points={arrowPoints} className={config.color.replace("stroke-", "fill-")} />
      {edge.label && (
        <text
          x={midX}
          y={midY - 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px] font-medium"
        >
          {edge.label}
        </text>
      )}
    </g>
  );
}

export const GraphEdge = memo(GraphEdgeComponent);
