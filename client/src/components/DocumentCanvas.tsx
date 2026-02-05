import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentBox } from "./DocumentBox";
import type { Document, DocumentEdge } from "@shared/schema";

type Props = {
  documents: Document[];
  edges: DocumentEdge[];
  selectedDocumentId: number | null;
  onSelectDocument: (id: number | null) => void;
  onClickDocument: (id: number) => void;
  onUpdateDocumentPosition: (id: number, x: number, y: number, prevX?: number, prevY?: number) => void;
};

export function DocumentCanvas({
  documents,
  edges = [],
  selectedDocumentId,
  onSelectDocument,
  onClickDocument,
  onUpdateDocumentPosition,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [docPositions, setDocPositions] = useState<Record<number, { x: number; y: number }>>({});

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

  const getDocumentPosition = useCallback((doc: Document, index: number) => {
    if (doc.x && doc.y && (doc.x !== 100 || doc.y !== 100)) {
      return { x: doc.x, y: doc.y };
    }
    const cols = Math.max(1, Math.floor((dimensions.width - 100) / 320));
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: 180 + col * 320,
      y: 120 + row * 200,
    };
  }, [dimensions]);

  useEffect(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    documents.forEach((doc, index) => {
      positions[doc.id] = getDocumentPosition(doc, index);
    });
    setDocPositions(positions);
  }, [documents, getDocumentPosition]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onSelectDocument(null);
      }
    },
    [onSelectDocument]
  );

  const handleLocalPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    setDocPositions(prev => ({ ...prev, [id]: { x, y } }));
    onUpdateDocumentPosition(id, x, y, prevX, prevY);
  };

  const getEdgeColor = (edgeType: string) => {
    switch (edgeType) {
      case "flow": return "hsl(var(--primary))";
      case "depends": return "hsl(var(--destructive))";
      case "parent": return "hsl(142, 76%, 36%)";
      default: return "hsl(var(--muted-foreground))";
    }
  };

  const canvasWidth = Math.max(dimensions.width, ...Object.values(docPositions).map(p => p.x + 200), 1200);
  const canvasHeight = Math.max(dimensions.height, ...Object.values(docPositions).map(p => p.y + 200), 800);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-background overflow-auto"
      onClick={handleCanvasClick}
      data-testid="document-canvas"
    >
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
          width: canvasWidth,
          height: canvasHeight,
        }}
      />

      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: canvasWidth, height: canvasHeight }}
      >
        <defs>
          <marker
            id="arrowhead-flow"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="hsl(var(--primary))"
            />
          </marker>
          <marker
            id="arrowhead-depends"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="hsl(var(--destructive))"
            />
          </marker>
          <marker
            id="arrowhead-parent"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="hsl(142, 76%, 36%)"
            />
          </marker>
          <marker
            id="arrowhead-related"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill="hsl(var(--muted-foreground))"
            />
          </marker>
        </defs>

        {edges.map((edge) => {
          const sourcePos = docPositions[edge.sourceDocId];
          const targetPos = docPositions[edge.targetDocId];
          if (!sourcePos || !targetPos) return null;

          const dx = targetPos.x - sourcePos.x;
          const dy = targetPos.y - sourcePos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist === 0) return null;

          const boxHalfWidth = 144;
          const boxHalfHeight = 80;
          const arrowOffset = 15;

          const angle = Math.atan2(dy, dx);
          const startX = sourcePos.x + Math.cos(angle) * boxHalfWidth;
          const startY = sourcePos.y + Math.sin(angle) * boxHalfHeight * 0.8;
          const endX = targetPos.x - Math.cos(angle) * (boxHalfWidth + arrowOffset);
          const endY = targetPos.y - Math.sin(angle) * (boxHalfHeight * 0.8 + arrowOffset);

          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;
          const perpX = -dy / dist * 30;
          const perpY = dx / dist * 30;

          return (
            <g key={edge.id}>
              <path
                d={`M ${startX} ${startY} Q ${midX + perpX} ${midY + perpY} ${endX} ${endY}`}
                fill="none"
                stroke={getEdgeColor(edge.edgeType)}
                strokeWidth="2"
                strokeDasharray={edge.edgeType === "related" ? "5,5" : "none"}
                markerEnd={`url(#arrowhead-${edge.edgeType})`}
              />
              {edge.label && (
                <text
                  x={midX + perpX * 0.5}
                  y={midY + perpY * 0.5 - 5}
                  fontSize="11"
                  fill="hsl(var(--muted-foreground))"
                  textAnchor="middle"
                  className="select-none"
                >
                  {edge.label.length > 20 ? edge.label.slice(0, 20) + "..." : edge.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {documents.map((doc, index) => {
        const pos = docPositions[doc.id] || getDocumentPosition(doc, index);
        return (
          <DocumentBox
            key={doc.id}
            document={doc}
            x={pos.x}
            y={pos.y}
            isSelected={selectedDocumentId === doc.id}
            onSelect={onSelectDocument}
            onClick={onClickDocument}
            onDragEnd={handleLocalPositionUpdate}
          />
        );
      })}

      {documents.length === 0 && (
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">문서가 없습니다</h3>
            <p className="text-sm">
              새 문서 버튼을 클릭하여 첫 번째 문서를 추가하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
