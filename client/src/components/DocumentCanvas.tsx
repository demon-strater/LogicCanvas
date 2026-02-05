import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentBox } from "./DocumentBox";
import { GroupBox } from "./GroupBox";
import type { Document, DocumentEdge, DocumentGroup, GroupEdge } from "@shared/schema";

type Props = {
  documents: Document[];
  edges: DocumentEdge[];
  groups: DocumentGroup[];
  groupEdges: GroupEdge[];
  selectedDocumentId: number | null;
  selectedGroupId: number | null;
  expandedGroups: Set<number>;
  onSelectDocument: (id: number | null) => void;
  onSelectGroup: (id: number | null) => void;
  onToggleGroupExpand: (id: number) => void;
  onClickDocument: (id: number) => void;
  onUpdateDocumentPosition: (id: number, x: number, y: number, prevX?: number, prevY?: number) => void;
  onUpdateGroupPosition: (id: number, x: number, y: number, prevX?: number, prevY?: number) => void;
  onEditGroup: (id: number) => void;
  onDeleteGroup: (id: number) => void;
};

export function DocumentCanvas({
  documents,
  edges = [],
  groups = [],
  groupEdges = [],
  selectedDocumentId,
  selectedGroupId,
  expandedGroups,
  onSelectDocument,
  onSelectGroup,
  onToggleGroupExpand,
  onClickDocument,
  onUpdateDocumentPosition,
  onUpdateGroupPosition,
  onEditGroup,
  onDeleteGroup,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [docPositions, setDocPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [groupPositions, setGroupPositions] = useState<Record<number, { x: number; y: number }>>({});

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

  const getDocumentPosition = useCallback((doc: Document, index: number, width: number) => {
    if (doc.x && doc.y && (doc.x !== 100 || doc.y !== 100)) {
      return { x: doc.x, y: doc.y };
    }
    const cols = Math.max(1, Math.floor((width - 100) / 320));
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: 180 + col * 320,
      y: 120 + row * 200,
    };
  }, []);

  useEffect(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    documents.forEach((doc, index) => {
      positions[doc.id] = getDocumentPosition(doc, index, dimensions.width);
    });
    setDocPositions(positions);
  }, [documents, dimensions.width, getDocumentPosition]);

  const getGroupPosition = useCallback((group: DocumentGroup, index: number) => {
    if (group.x && group.y && (group.x !== 100 || group.y !== 100)) {
      return { x: group.x, y: group.y };
    }
    return {
      x: 150 + index * 400,
      y: 150,
    };
  }, []);

  useEffect(() => {
    const positions: Record<number, { x: number; y: number }> = {};
    groups.forEach((group, index) => {
      positions[group.id] = getGroupPosition(group, index);
    });
    setGroupPositions(positions);
  }, [groups, getGroupPosition]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onSelectDocument(null);
        onSelectGroup(null);
      }
    },
    [onSelectDocument, onSelectGroup]
  );

  const handleLocalPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    setDocPositions(prev => ({ ...prev, [id]: { x, y } }));
    onUpdateDocumentPosition(id, x, y, prevX, prevY);
  };

  const handleGroupPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    setGroupPositions(prev => ({ ...prev, [id]: { x, y } }));
    onUpdateGroupPosition(id, x, y, prevX, prevY);
  };

  const getDocumentsInGroup = (groupId: number) => {
    return documents.filter(doc => doc.groupId === groupId);
  };

  const getChildGroups = (parentId: number) => {
    return groups.filter(g => g.parentId === parentId);
  };

  const ungroupedDocuments = documents.filter(doc => !doc.groupId);

  const getEdgeColor = (edgeType: string) => {
    switch (edgeType) {
      case "flow": return "hsl(var(--primary))";
      case "depends": return "hsl(var(--destructive))";
      case "parent": return "hsl(142, 76%, 36%)";
      default: return "hsl(var(--muted-foreground))";
    }
  };

  const allPositions = [...Object.values(docPositions), ...Object.values(groupPositions)];
  const canvasWidth = Math.max(dimensions.width, ...allPositions.map(p => p.x + 400), 1200);
  const canvasHeight = Math.max(dimensions.height, ...allPositions.map(p => p.y + 300), 800);

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

      {groups.filter(g => !g.parentId).map((group, index) => {
        const pos = groupPositions[group.id] || getGroupPosition(group, index);
        return (
          <GroupBox
            key={`group-${group.id}`}
            group={group}
            documents={getDocumentsInGroup(group.id)}
            childGroups={getChildGroups(group.id)}
            x={pos.x}
            y={pos.y}
            isSelected={selectedGroupId === group.id}
            isExpanded={expandedGroups?.has(group.id) || false}
            onSelect={onSelectGroup}
            onToggleExpand={onToggleGroupExpand}
            onDragEnd={handleGroupPositionUpdate}
            onEdit={onEditGroup}
            onDelete={onDeleteGroup}
          />
        );
      })}

      {ungroupedDocuments.map((doc, index) => {
        const pos = docPositions[doc.id] || getDocumentPosition(doc, index, dimensions.width);
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
