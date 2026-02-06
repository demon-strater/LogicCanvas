import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentBox } from "./DocumentBox";
import { GroupBox } from "./GroupBox";
import { Minimap } from "./Minimap";
import { TimelineHeader, TimelineGridLines } from "./TimelineHeader";
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
  viewingDocumentId?: number | null;
};

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const DOC_WIDTH = 260;
const DOC_HEIGHT = 130;
const GROUP_PADDING = 30;
const GROUP_HEADER = 100;
const TIMELINE_HEIGHT = 50;
const TIMELINE_GAP = 80;

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
  viewingDocumentId,
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
  
  // Multi-selection state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const selectionStartRef = useRef({ x: 0, y: 0 });

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

  // Initial centering: center view on diagram content when data first loads
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    
    // Wait for documents or groups to be available
    const hasContent = documents.length > 0 || groups.length > 0;
    if (!hasContent || dimensions.width === 0) return;
    
    hasInitialized.current = true;
    
    // Calculate content bounds
    const allX: number[] = [];
    const allY: number[] = [];
    
    documents.forEach(d => {
      if (d.x !== null && d.y !== null) {
        allX.push(d.x);
        allY.push(d.y);
      }
    });
    
    groups.forEach(g => {
      if (g.x !== null && g.y !== null) {
        allX.push(g.x);
        allY.push(g.y);
      }
    });
    
    if (allX.length === 0) return;
    
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    
    // Calculate center of content
    const contentCenterX = (minX + maxX) / 2;
    const contentCenterY = (minY + maxY) / 2;
    
    // Set initial zoom to fit content (with margin)
    const contentWidth = maxX - minX + 800;
    const contentHeight = maxY - minY + 600;
    const scaleX = dimensions.width / contentWidth;
    const scaleY = (dimensions.height - 48) / contentHeight;
    const fitZoom = Math.min(scaleX, scaleY, 1) * 0.8;
    const initialZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
    
    // Calculate pan to center content in viewport
    const viewportCenterX = dimensions.width / 2;
    const viewportCenterY = (dimensions.height - 48) / 2 + 48;
    const panX = viewportCenterX - contentCenterX * initialZoom;
    const panY = viewportCenterY - contentCenterY * initialZoom;
    
    setZoom(initialZoom);
    setPan({ x: panX, y: panY });
  }, [documents, groups, dimensions]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Get cursor position relative to container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate world coordinates at cursor position
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    // Zoom with scroll (no Ctrl needed), centered on cursor
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));

    // Adjust pan to keep cursor position stable
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
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

  const handleMinimapNavigate = useCallback((newPan: { x: number; y: number }) => {
    setPan(newPan);
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
    const target = e.target as HTMLElement;
    
    // Middle mouse button (scroll wheel click) = always pan
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    
    // Only handle left mouse button for other interactions
    if (e.button !== 0) return;
    
    // Check if clicking on interactive elements (documents, groups, buttons)
    const isInteractiveElement = target.closest('[data-testid^="document-box-"]') ||
                                  target.closest('[data-testid^="group-box-"]') ||
                                  target.closest('button') ||
                                  target.closest('[role="button"]');
    
    const isBackground = target.hasAttribute('data-canvas-bg') || 
                         target === containerRef.current ||
                         target === contentRef.current ||
                         target.tagName === 'svg';
    
    // Spacebar + drag = always pan, regardless of what element is clicked
    if (isSpacePressed) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      return;
    }
    
    // Background click = selection rectangle
    if (isBackground && !isInteractiveElement) {
      e.preventDefault();
      
      // Start selection rectangle instead of panning
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const worldX = (e.clientX - rect.left - pan.x) / zoom;
        const worldY = (e.clientY - rect.top - pan.y) / zoom;
        setIsSelecting(true);
        selectionStartRef.current = { x: worldX, y: worldY };
        setSelectionRect({ startX: worldX, startY: worldY, endX: worldX, endY: worldY });
        
        // Clear previous selection unless Shift is held
        if (!e.shiftKey) {
          setSelectedDocIds(new Set());
          setSelectedGroupIds(new Set());
        }
      }
    }
  }, [isSpacePressed, pan, zoom]);
  
  // Selection rectangle mouse move/up handlers
  useEffect(() => {
    if (!isSelecting) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      const worldX = (e.clientX - rect.left - pan.x) / zoom;
      const worldY = (e.clientY - rect.top - pan.y) / zoom;
      
      setSelectionRect(prev => prev ? { ...prev, endX: worldX, endY: worldY } : null);
    };

    const handleMouseUp = () => {
      if (selectionRect) {
        // Calculate selection bounds
        const minX = Math.min(selectionRect.startX, selectionRect.endX);
        const maxX = Math.max(selectionRect.startX, selectionRect.endX);
        const minY = Math.min(selectionRect.startY, selectionRect.endY);
        const maxY = Math.max(selectionRect.startY, selectionRect.endY);
        
        // Find documents within selection
        const newSelectedDocs = new Set(selectedDocIds);
        documents.forEach(doc => {
          const pos = docPositions[doc.id];
          if (pos) {
            const docLeft = pos.x - DOC_WIDTH / 2;
            const docRight = pos.x + DOC_WIDTH / 2;
            const docTop = pos.y - DOC_HEIGHT / 2;
            const docBottom = pos.y + DOC_HEIGHT / 2;
            
            // Check if document intersects with selection rectangle
            if (docRight >= minX && docLeft <= maxX && docBottom >= minY && docTop <= maxY) {
              newSelectedDocs.add(doc.id);
            }
          }
        });
        setSelectedDocIds(newSelectedDocs);
        
        // Find groups within selection - compute actual bounds from documents
        const newSelectedGroups = new Set(selectedGroupIds);
        groups.forEach(group => {
          const pos = groupPositions[group.id];
          if (pos) {
            // Calculate actual group bounds from its documents
            const groupDocs = documents.filter(d => d.groupId === group.id);
            let groupLeft = pos.x - DOC_WIDTH / 2;
            let groupRight = pos.x + DOC_WIDTH / 2;
            let groupTop = pos.y - DOC_HEIGHT / 2;
            let groupBottom = pos.y + DOC_HEIGHT / 2;
            
            if (groupDocs.length > 0) {
              const docBounds = groupDocs.map(d => {
                const dp = docPositions[d.id];
                return dp ? {
                  left: dp.x - DOC_WIDTH / 2,
                  right: dp.x + DOC_WIDTH / 2,
                  top: dp.y - DOC_HEIGHT / 2,
                  bottom: dp.y + DOC_HEIGHT / 2
                } : null;
              }).filter(Boolean) as { left: number; right: number; top: number; bottom: number }[];
              
              if (docBounds.length > 0) {
                groupLeft = Math.min(...docBounds.map(b => b.left)) - GROUP_PADDING;
                groupRight = Math.max(...docBounds.map(b => b.right)) + GROUP_PADDING;
                groupTop = Math.min(...docBounds.map(b => b.top)) - GROUP_HEADER;
                groupBottom = Math.max(...docBounds.map(b => b.bottom)) + GROUP_PADDING;
              }
            }
            
            if (groupRight >= minX && groupLeft <= maxX && groupBottom >= minY && groupTop <= maxY) {
              newSelectedGroups.add(group.id);
            }
          }
        });
        setSelectedGroupIds(newSelectedGroups);
      }
      
      setIsSelecting(false);
      setSelectionRect(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSelecting, selectionRect, documents, groups, docPositions, groupPositions, selectedDocIds, selectedGroupIds, pan, zoom]);

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
    const colWidth = DOC_WIDTH + 40;
    const rowHeight = DOC_HEIGHT + 40;
    const cols = Math.max(1, Math.floor((width - 100) / colWidth));
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: 180 + col * colWidth,
      y: 120 + row * rowHeight,
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
        // Clear multi-selection when clicking empty space
        if (!e.shiftKey) {
          setSelectedDocIds(new Set());
          setSelectedGroupIds(new Set());
        }
      }
    },
    [onSelectDocument, onSelectGroup]
  );

  const handleDocDragMove = useCallback((id: number, x: number, y: number) => {
    setDocPositions(prev => ({ ...prev, [id]: { x, y } }));
  }, []);

  // Handle multi-drag for documents
  const handleLocalPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    const deltaX = x - prevX;
    const deltaY = y - prevY;
    
    // If this document is part of multi-selection, move all selected items
    if (selectedDocIds.has(id) && selectedDocIds.size > 1) {
      const newDocPositions = { ...docPositions };
      selectedDocIds.forEach(docId => {
        if (docId !== id && docPositions[docId]) {
          const newX = docPositions[docId].x + deltaX;
          const newY = docPositions[docId].y + deltaY;
          newDocPositions[docId] = { x: newX, y: newY };
          onUpdateDocumentPosition(docId, newX, newY);
        }
      });
      newDocPositions[id] = { x, y };
      setDocPositions(newDocPositions);
      onUpdateDocumentPosition(id, x, y, prevX, prevY);
      
      // Also move selected groups
      if (selectedGroupIds.size > 0) {
        const newGroupPositions = { ...groupPositions };
        selectedGroupIds.forEach(groupId => {
          if (groupPositions[groupId]) {
            const newX = groupPositions[groupId].x + deltaX;
            const newY = groupPositions[groupId].y + deltaY;
            newGroupPositions[groupId] = { x: newX, y: newY };
            onUpdateGroupPosition(groupId, newX, newY);
          }
        });
        setGroupPositions(newGroupPositions);
      }
    } else {
      setDocPositions(prev => ({ ...prev, [id]: { x, y } }));
      onUpdateDocumentPosition(id, x, y, prevX, prevY);
    }
  };

  // Handle multi-drag for groups
  const handleGroupPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    const deltaX = x - prevX;
    const deltaY = y - prevY;
    
    // If this group is part of multi-selection, move all selected items
    if (selectedGroupIds.has(id) && (selectedGroupIds.size > 1 || selectedDocIds.size > 0)) {
      const newGroupPositions = { ...groupPositions };
      selectedGroupIds.forEach(groupId => {
        if (groupId !== id && groupPositions[groupId]) {
          const newX = groupPositions[groupId].x + deltaX;
          const newY = groupPositions[groupId].y + deltaY;
          newGroupPositions[groupId] = { x: newX, y: newY };
          onUpdateGroupPosition(groupId, newX, newY);
        }
      });
      newGroupPositions[id] = { x, y };
      setGroupPositions(newGroupPositions);
      onUpdateGroupPosition(id, x, y, prevX, prevY);
      
      // Also move selected documents
      if (selectedDocIds.size > 0) {
        const newDocPositions = { ...docPositions };
        selectedDocIds.forEach(docId => {
          if (docPositions[docId]) {
            const newX = docPositions[docId].x + deltaX;
            const newY = docPositions[docId].y + deltaY;
            newDocPositions[docId] = { x: newX, y: newY };
            onUpdateDocumentPosition(docId, newX, newY);
          }
        });
        setDocPositions(newDocPositions);
      }
    } else {
      setGroupPositions(prev => ({ ...prev, [id]: { x, y } }));
      onUpdateGroupPosition(id, x, y, prevX, prevY);
    }
  };
  
  // Handle individual item selection (with Shift for multi-select)
  const handleDocSelect = useCallback((id: number, shiftKey?: boolean) => {
    if (shiftKey) {
      // Shift+click toggles the item in selection
      setSelectedDocIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else if (selectedDocIds.has(id)) {
      // Clicking an already-selected item: keep selection for multi-drag
      // Do nothing - keep existing selection
    } else {
      // Clicking a non-selected item: select only this one
      setSelectedDocIds(new Set([id]));
      setSelectedGroupIds(new Set());
    }
    onSelectDocument(id);
  }, [onSelectDocument, selectedDocIds]);
  
  const handleGroupSelect = useCallback((id: number, shiftKey?: boolean) => {
    if (shiftKey) {
      // Shift+click toggles the item in selection
      setSelectedGroupIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    } else if (selectedGroupIds.has(id)) {
      // Clicking an already-selected item: keep selection for multi-drag
      // Do nothing - keep existing selection
    } else {
      // Clicking a non-selected item: select only this one
      setSelectedGroupIds(new Set([id]));
      setSelectedDocIds(new Set());
    }
    onSelectGroup(id);
  }, [onSelectGroup, selectedGroupIds]);

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

  // Calculate month range for timeline (2025년 12월 to 2026년 12월 = 13 months)
  const timelineStartMonth = 12;
  const timelineEndMonth = 24; // 24 = December of next year

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-background overflow-hidden ${isPanning ? 'cursor-grabbing' : isSpacePressed ? 'cursor-grab' : ''}`}
      onClick={handleCanvasClick}
      onMouseDown={handlePanStart}
      onAuxClick={(e) => e.preventDefault()}
      onWheel={handleWheel}
      data-testid="document-canvas"
    >
      {/* Fixed timeline header at top */}
      <TimelineHeader
        startMonth={timelineStartMonth}
        endMonth={timelineEndMonth}
        year={2025}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        monthWidth={2000}
        offsetX={150}
        zoom={zoom}
        panX={pan.x}
        activeDate={viewingDocumentId ? documents.find(d => d.id === viewingDocumentId)?.createdAt : null}
        activeDocTitle={viewingDocumentId ? documents.find(d => d.id === viewingDocumentId)?.title : null}
      />

      {/* Timeline grid lines - fixed to viewport, scales with zoom */}
      <TimelineGridLines
        startMonth={timelineStartMonth}
        endMonth={timelineEndMonth}
        year={2025}
        monthWidth={2000}
        offsetX={150}
        zoom={zoom}
        panX={pan.x}
        viewportHeight={dimensions.height}
      />

      <div
        ref={contentRef}
        className="absolute origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y + 48}px) scale(${zoom})`,
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
          style={{ width: canvasWidth, height: canvasHeight, zIndex: 3 }}
        >
          <defs>
            <marker id="arrow-flow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M 0 0.5 L 7 3 L 0 5.5" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-depends" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M 0 0.5 L 7 3 L 0 5.5" fill="none" stroke="hsl(var(--destructive))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-parent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M 0 0.5 L 7 3 L 0 5.5" fill="none" stroke="hsl(142, 60%, 45%)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-related" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <path d="M 0 0.5 L 7 3 L 0 5.5" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-group-flow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M 1 0.5 L 9 4 L 1 7.5" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id="arrow-group-depends" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M 1 0.5 L 9 4 L 1 7.5" fill="none" stroke="hsl(var(--destructive))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>

          {/* Document-to-document edges */}
          {edges.filter(e => e.edgeType === "depends").map((edge) => {
            const sourcePos = docPositions[edge.sourceDocId];
            const targetPos = docPositions[edge.targetDocId];
            if (!sourcePos || !targetPos) return null;

            const HALF_W = DOC_WIDTH / 2;
            const HALF_H = DOC_HEIGHT / 2;
            const sx = sourcePos.x, sy = sourcePos.y;
            const tx = targetPos.x, ty = targetPos.y;
            const dx = tx - sx, dy = ty - sy;
            const absDx = Math.abs(dx), absDy = Math.abs(dy);

            let startX: number, startY: number, endX: number, endY: number;
            let horizontal: boolean;

            if (absDx * DOC_HEIGHT > absDy * DOC_WIDTH) {
              horizontal = true;
              if (dx > 0) {
                startX = sx + HALF_W; startY = sy;
                endX = tx - HALF_W; endY = ty;
              } else {
                startX = sx - HALF_W; startY = sy;
                endX = tx + HALF_W; endY = ty;
              }
            } else {
              horizontal = false;
              if (dy > 0) {
                startX = sx; startY = sy + HALF_H;
                endX = tx; endY = ty - HALF_H;
              } else {
                startX = sx; startY = sy - HALF_H;
                endX = tx; endY = ty + HALF_H;
              }
            }

            const dist = Math.sqrt((endX-startX)**2 + (endY-startY)**2);
            const t = Math.min(1, dist / 400);
            const curveStrength = 30 + t * 50;

            let pathD: string;
            if (horizontal) {
              const dir = dx > 0 ? 1 : -1;
              pathD = `M ${startX} ${startY} C ${startX + dir * curveStrength} ${startY}, ${endX - dir * curveStrength} ${endY}, ${endX} ${endY}`;
            } else {
              const dir = dy > 0 ? 1 : -1;
              pathD = `M ${startX} ${startY} C ${startX} ${startY + dir * curveStrength}, ${endX} ${endY - dir * curveStrength}, ${endX} ${endY}`;
            }

            const edgeColor = getEdgeColor(edge.edgeType);
            const markerId = `arrow-${edge.edgeType}`;

            return (
              <g key={edge.id}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="hsl(var(--background))"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeOpacity="0.7"
                  markerEnd={`url(#${markerId})`}
                />
              </g>
            );
          })}

          {/* Group-to-group edges (workflow connections between groups) */}
          {groupEdges.map((edge) => {
            const sourceGroup = groups.find(g => g.id === edge.sourceGroupId);
            const targetGroup = groups.find(g => g.id === edge.targetGroupId);
            if (!sourceGroup || !targetGroup) return null;
            
            const getChildGroupBounds = (childGroup: typeof sourceGroup) => {
              const childDocs = documents.filter(d => d.groupId === childGroup.id);
              if (childDocs.length === 0) {
                const cgPos = groupPositions[childGroup.id];
                const cx = cgPos ? cgPos.x : childGroup.x;
                const cy = cgPos ? cgPos.y + TIMELINE_GAP : (childGroup.y ?? 0) + TIMELINE_GAP;
                const w = DOC_WIDTH + GROUP_PADDING * 2;
                const h = DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING;
                return { centerX: cx, centerY: cy, width: w, height: h };
              }
              let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
              for (const d of childDocs) {
                if (d.x != null && d.y != null) {
                  mnX = Math.min(mnX, d.x - DOC_WIDTH / 2);
                  mxX = Math.max(mxX, d.x + DOC_WIDTH / 2);
                  mnY = Math.min(mnY, d.y - DOC_HEIGHT / 2);
                  mxY = Math.max(mxY, d.y + DOC_HEIGHT / 2);
                }
              }
              if (mnX === Infinity) {
                const cgPos = groupPositions[childGroup.id];
                const cx = cgPos ? cgPos.x : childGroup.x;
                const cy = cgPos ? cgPos.y + TIMELINE_GAP : (childGroup.y ?? 0) + TIMELINE_GAP;
                return { centerX: cx, centerY: cy, width: DOC_WIDTH + GROUP_PADDING * 2, height: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING };
              }
              const w = Math.max(DOC_WIDTH + GROUP_PADDING * 2, (mxX - mnX) + GROUP_PADDING * 2);
              const h = Math.max(DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING, (mxY - mnY) + GROUP_HEADER + GROUP_PADDING);
              const topLeftX = mnX - GROUP_PADDING;
              const topLeftY = mnY - GROUP_HEADER;
              return { centerX: topLeftX + w / 2, centerY: topLeftY + h / 2, width: w, height: h };
            };

            const getGroupCenter = (group: typeof sourceGroup) => {
              const pos = groupPositions[group.id];
              if (!pos) return null;
              
              const childGrps = groups.filter(g => g.parentId === group.id);
              
              if (childGrps.length > 0) {
                const allItems: { x: number; y: number; w: number; h: number }[] = [];
                for (const cg of childGrps) {
                  const cb = getChildGroupBounds(cg);
                  allItems.push({ x: cb.centerX, y: cb.centerY, w: cb.width, h: cb.height });
                }
                if (allItems.length > 0) {
                  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
                  for (const item of allItems) {
                    mnX = Math.min(mnX, item.x - item.w / 2);
                    mxX = Math.max(mxX, item.x + item.w / 2);
                    mnY = Math.min(mnY, item.y - item.h / 2);
                    mxY = Math.max(mxY, item.y + item.h / 2);
                  }
                  const w = (mxX - mnX) + GROUP_PADDING * 2;
                  const h = (mxY - mnY) + GROUP_HEADER + GROUP_PADDING;
                  const topLeftX = mnX - GROUP_PADDING;
                  const topLeftY = mnY - GROUP_HEADER;
                  return {
                    x: topLeftX + w / 2,
                    y: topLeftY + h / 2,
                    width: w,
                    height: h
                  };
                }
              }
              
              const directDocs = documents.filter(d => d.groupId === group.id);
              if (directDocs.length > 0) {
                const cb = getChildGroupBounds(group);
                return { x: cb.centerX, y: cb.centerY, width: cb.width, height: cb.height };
              }
              
              return { 
                x: pos.x, 
                y: pos.y + TIMELINE_GAP, 
                width: DOC_WIDTH + GROUP_PADDING * 2, 
                height: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING 
              };
            };
            
            const sourceCenter = getGroupCenter(sourceGroup);
            const targetCenter = getGroupCenter(targetGroup);
            if (!sourceCenter || !targetCenter) return null;
            
            const HALF_W = sourceCenter.width / 2;
            const HALF_H = sourceCenter.height / 2;
            const TARGET_HALF_W = targetCenter.width / 2;
            const TARGET_HALF_H = targetCenter.height / 2;
            
            const dx = targetCenter.x - sourceCenter.x;
            const dy = targetCenter.y - sourceCenter.y;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            
            let startX: number, startY: number, endX: number, endY: number;
            
            if (absDx * sourceCenter.height > absDy * sourceCenter.width) {
              if (dx > 0) {
                startX = sourceCenter.x + HALF_W;
                startY = sourceCenter.y;
                endX = targetCenter.x - TARGET_HALF_W;
                endY = targetCenter.y;
              } else {
                startX = sourceCenter.x - HALF_W;
                startY = sourceCenter.y;
                endX = targetCenter.x + TARGET_HALF_W;
                endY = targetCenter.y;
              }
            } else {
              if (dy > 0) {
                startX = sourceCenter.x;
                startY = sourceCenter.y + HALF_H;
                endX = targetCenter.x;
                endY = targetCenter.y - TARGET_HALF_H;
              } else {
                startX = sourceCenter.x;
                startY = sourceCenter.y - HALF_H;
                endX = targetCenter.x;
                endY = targetCenter.y + TARGET_HALF_H;
              }
            }
            
            const gdx = targetCenter.x - sourceCenter.x;
            const gdy = targetCenter.y - sourceCenter.y;
            const gAbsDx = Math.abs(gdx);
            const gAbsDy = Math.abs(gdy);
            const gDist = Math.sqrt((endX-startX)**2 + (endY-startY)**2);
            const gt = Math.min(1, gDist / 600);
            const gCurve = 50 + gt * 80;
            
            let pathD: string;
            if (gAbsDx > gAbsDy) {
              const dir = gdx > 0 ? 1 : -1;
              pathD = `M ${startX} ${startY} C ${startX + dir * gCurve} ${startY}, ${endX - dir * gCurve} ${endY}, ${endX} ${endY}`;
            } else {
              const dir = gdy > 0 ? 1 : -1;
              pathD = `M ${startX} ${startY} C ${startX} ${startY + dir * gCurve}, ${endX} ${endY - dir * gCurve}, ${endX} ${endY}`;
            }
            
            const edgeColor = edge.edgeType === "depends" 
              ? "hsl(var(--destructive))" 
              : "hsl(var(--primary))";
            const markerId = edge.edgeType === "depends" ? "arrow-group-depends" : "arrow-group-flow";
            
            return (
              <g key={`group-edge-${edge.id}`}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="hsl(var(--background))"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeOpacity="0.5"
                  strokeDasharray={edge.edgeType === "related" ? "6,4" : undefined}
                  markerEnd={`url(#${markerId})`}
                />
              </g>
            );
          })}
        </svg>

        {/* Selection rectangle */}
        {selectionRect && (
          <div
            className="absolute border-2 border-primary/60 bg-primary/10 pointer-events-none"
            style={{
              left: Math.min(selectionRect.startX, selectionRect.endX),
              top: Math.min(selectionRect.startY, selectionRect.endY),
              width: Math.abs(selectionRect.endX - selectionRect.startX),
              height: Math.abs(selectionRect.endY - selectionRect.startY),
              zIndex: 1000,
            }}
          />
        )}

        {/* Render top-level groups (parentId === null) with their child groups (중분류) inside */}
        {groups
          .filter(g => g.parentId === null)
          .map((group, index) => {
          const pos = groupPositions[group.id] || getGroupPosition(group, index);
          // Get direct child groups (중분류) for this top-level group
          const childGroups = groups.filter(g => g.parentId === group.id);
          return (
            <GroupBox
              key={`group-${group.id}`}
              group={group}
              documents={[]}
              childGroups={childGroups}
              allDocuments={documents}
              docPositions={docPositions}
              x={pos.x}
              y={pos.y + TIMELINE_GAP}
              isSelected={selectedGroupId === group.id || selectedGroupIds.has(group.id)}
              isExpanded={true}
              isTopLevel={true}
              isSpacePressed={isSpacePressed}
              onSelect={handleGroupSelect}
              onToggleExpand={onToggleGroupExpand}
              onDragEnd={handleGroupPositionUpdate}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
            />
          );
        })}

        {/* Render child groups (중분류) separately so they're visible and draggable */}
        {groups
          .filter(g => g.parentId !== null)
          .map((group, index) => {
          const pos = groupPositions[group.id] || getGroupPosition(group, index);
          const groupDocs = documents.filter(d => d.groupId === group.id);
          return (
            <GroupBox
              key={`group-${group.id}`}
              group={group}
              documents={groupDocs}
              childGroups={[]}
              allDocuments={documents}
              docPositions={docPositions}
              x={pos.x}
              y={pos.y + TIMELINE_GAP}
              isSelected={selectedGroupId === group.id || selectedGroupIds.has(group.id)}
              isExpanded={false}
              isTopLevel={false}
              isSpacePressed={isSpacePressed}
              onSelect={handleGroupSelect}
              onToggleExpand={onToggleGroupExpand}
              onDragEnd={handleGroupPositionUpdate}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
            />
          );
        })}

        {/* Render document boxes */}
        {documents.map((doc) => {
          const pos = docPositions[doc.id];
          if (!pos) return null;
          return (
            <DocumentBox
              key={`doc-${doc.id}`}
              document={doc}
              x={pos.x}
              y={pos.y}
              isSelected={selectedDocumentId === doc.id || selectedDocIds.has(doc.id)}
              isSpacePressed={isSpacePressed}
              onSelect={handleDocSelect}
              onClick={onClickDocument}
              onDragMove={handleDocDragMove}
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

      <Minimap
        documents={documents}
        groups={groups}
        docPositions={docPositions}
        groupPositions={groupPositions}
        allDocuments={documents}
        zoom={zoom}
        pan={pan}
        viewportWidth={dimensions.width}
        viewportHeight={dimensions.height}
        onNavigate={handleMinimapNavigate}
      />

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
        스크롤: 확대/축소 (커서 중심) | 스페이스+드래그: 화면이동
      </div>
    </div>
  );
}
