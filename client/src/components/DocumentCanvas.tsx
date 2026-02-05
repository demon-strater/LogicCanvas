import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentBox } from "./DocumentBox";
import { GroupBox } from "./GroupBox";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

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
  const contentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [docPositions, setDocPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [groupPositions, setGroupPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

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

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));

      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    } else {
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  }, [zoom, pan]);

  const handleZoomIn = useCallback(() => {
    setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Spacebar press detection for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Pan mouse handlers
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    // Only left mouse button
    if (e.button !== 0) return;
    
    const target = e.target as HTMLElement;
    
    // Check if clicking on interactive elements (documents, groups, buttons)
    const isInteractiveElement = target.closest('[data-testid^="document-box-"]') ||
                                  target.closest('[data-testid^="group-box-"]') ||
                                  target.closest('button') ||
                                  target.closest('[role="button"]');
    
    const isBackground = target.hasAttribute('data-canvas-bg') || 
                         target === containerRef.current ||
                         target === contentRef.current ||
                         target.tagName === 'svg';
    
    // Only pan if spacebar pressed (anywhere except interactive) or clicking background
    if (isSpacePressed && !isInteractiveElement) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    } else if (isBackground && !isInteractiveElement) {
      e.preventDefault();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  }, [isSpacePressed, pan]);

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
    };

    const handleMouseUp = () => {
      setIsPanning(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

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
      if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-canvas-bg]')) {
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
  const canvasWidth = Math.max(dimensions.width / zoom, ...allPositions.map(p => p.x + 400), 1200);
  const canvasHeight = Math.max(dimensions.height / zoom, ...allPositions.map(p => p.y + 300), 800);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-background overflow-hidden ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : ''}`}
      onClick={handleCanvasClick}
      onMouseDown={handlePanStart}
      onWheel={handleWheel}
      data-testid="document-canvas"
    >
      <div
        ref={contentRef}
        className="absolute origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: canvasWidth,
          height: canvasHeight,
        }}
      >
        <div
          data-canvas-bg
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
              linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
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

            const BOX_WIDTH = 288;
            const BOX_HEIGHT = 160;
            const HALF_W = BOX_WIDTH / 2;
            const HALF_H = BOX_HEIGHT / 2;

            const sourceCenterX = sourcePos.x;
            const sourceCenterY = sourcePos.y;
            const targetCenterX = targetPos.x;
            const targetCenterY = targetPos.y;

            const dx = targetCenterX - sourceCenterX;
            const dy = targetCenterY - sourceCenterY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            let startX: number, startY: number, endX: number, endY: number;
            let sourceAnchor: 'top' | 'bottom' | 'left' | 'right';
            let targetAnchor: 'top' | 'bottom' | 'left' | 'right';

            if (absDx * BOX_HEIGHT > absDy * BOX_WIDTH) {
              if (dx > 0) {
                startX = sourceCenterX + HALF_W;
                startY = sourceCenterY;
                endX = targetCenterX - HALF_W;
                endY = targetCenterY;
                sourceAnchor = 'right';
                targetAnchor = 'left';
              } else {
                startX = sourceCenterX - HALF_W;
                startY = sourceCenterY;
                endX = targetCenterX + HALF_W;
                endY = targetCenterY;
                sourceAnchor = 'left';
                targetAnchor = 'right';
              }
            } else {
              if (dy > 0) {
                startX = sourceCenterX;
                startY = sourceCenterY + HALF_H;
                endX = targetCenterX;
                endY = targetCenterY - HALF_H;
                sourceAnchor = 'bottom';
                targetAnchor = 'top';
              } else {
                startX = sourceCenterX;
                startY = sourceCenterY - HALF_H;
                endX = targetCenterX;
                endY = targetCenterY + HALF_H;
                sourceAnchor = 'top';
                targetAnchor = 'bottom';
              }
            }

            const arrowOffset = 12;
            const finalDx = endX - startX;
            const finalDy = endY - startY;
            const finalDist = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
            if (finalDist > arrowOffset) {
              endX = endX - (finalDx / finalDist) * arrowOffset;
              endY = endY - (finalDy / finalDist) * arrowOffset;
            }

            let pathD: string;
            const curveOffset = Math.min(60, Math.max(30, finalDist * 0.3));
            
            if ((sourceAnchor === 'right' && targetAnchor === 'left') || 
                (sourceAnchor === 'left' && targetAnchor === 'right')) {
              const ctrlX1 = startX + (sourceAnchor === 'right' ? curveOffset : -curveOffset);
              const ctrlX2 = endX + (targetAnchor === 'left' ? -curveOffset : curveOffset);
              pathD = `M ${startX} ${startY} C ${ctrlX1} ${startY}, ${ctrlX2} ${endY}, ${endX} ${endY}`;
            } else {
              const ctrlY1 = startY + (sourceAnchor === 'bottom' ? curveOffset : -curveOffset);
              const ctrlY2 = endY + (targetAnchor === 'top' ? -curveOffset : curveOffset);
              pathD = `M ${startX} ${startY} C ${startX} ${ctrlY1}, ${endX} ${ctrlY2}, ${endX} ${endY}`;
            }

            const edgeColor = getEdgeColor(edge.edgeType);
            const isDashed = edge.edgeType === "related";
            const markerId = `arrowhead-${edge.edgeType}`;
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 10;

            return (
              <g key={edge.id}>
                <path
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="2"
                  strokeDasharray={isDashed ? "5,5" : undefined}
                  markerEnd={`url(#${markerId})`}
                  className="transition-opacity"
                />
                {edge.label && (
                  <text
                    x={labelX}
                    y={labelY}
                    fontSize="10"
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

        {documents.length === 0 && groups.length === 0 && (
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
              <h3 className="text-lg font-semibold mb-2">캔버스가 비어있습니다</h3>
              <p className="text-sm">
                오른쪽 하단의 버튼을 사용해 문서나 그룹을 추가하세요.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-card/90 backdrop-blur-sm border rounded-lg p-1 shadow-lg">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          data-testid="button-zoom-out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          onClick={handleResetZoom}
          className="px-2 py-1 text-xs font-medium min-w-[48px] hover:bg-muted rounded transition-colors"
          data-testid="button-zoom-reset"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          data-testid="button-zoom-in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetZoom}
          title="초기화"
          data-testid="button-zoom-fit"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="absolute top-4 left-4 text-xs text-muted-foreground bg-card/80 backdrop-blur-sm px-2 py-1 rounded">
        Ctrl+스크롤: 확대/축소 | 스페이스+드래그: 화면이동 | 배경 드래그: 화면이동
      </div>
    </div>
  );
}
