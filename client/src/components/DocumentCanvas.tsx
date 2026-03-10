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
  onResizeGroup?: (id: number, width: number, height: number) => void;
  onEditGroup: (id: number) => void;
  onDeleteGroup: (id: number) => void;
  viewingDocumentId?: number | null;
};

const MIN_ZOOM = 0.03;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.05;

const ZOOM_L1 = 0.08;
const ZOOM_L2 = 0.15;
const ZOOM_L3 = 0.3;
const ZOOM_L4 = 0.6;
const PAN_SPEED = 1.5;
const DOC_WIDTH = 260;
const DOC_HEIGHT = 130;
const GROUP_PADDING = 30;
const GROUP_HEADER = 100;
const TIMELINE_HEIGHT = 50;
const TIMELINE_GAP = 80;
const OBSTACLE_MARGIN = 25;

type ObstacleRect = { left: number; top: number; right: number; bottom: number; id?: number };

function lineSegIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  r: ObstacleRect
): boolean {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  if (maxX < r.left || minX > r.right || maxY < r.top || minY > r.bottom) return false;
  if (x1 >= r.left && x1 <= r.right && y1 >= r.top && y1 <= r.bottom) return true;
  if (x2 >= r.left && x2 <= r.right && y2 >= r.top && y2 <= r.bottom) return true;
  const dx = x2 - x1, dy = y2 - y1;
  const edges: [number, number, number, number][] = [
    [r.left, r.top, r.right, r.top],
    [r.right, r.top, r.right, r.bottom],
    [r.left, r.bottom, r.right, r.bottom],
    [r.left, r.top, r.left, r.bottom],
  ];
  for (const [ex1, ey1, ex2, ey2] of edges) {
    const edx = ex2 - ex1, edy = ey2 - ey1;
    const denom = dx * edy - dy * edx;
    if (Math.abs(denom) < 0.001) continue;
    const t = ((ex1 - x1) * edy - (ey1 - y1) * edx) / denom;
    const u = ((ex1 - x1) * dy - (ey1 - y1) * dx) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

function pointInRect(px: number, py: number, r: ObstacleRect): boolean {
  return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

function computeBypassWaypoints(
  startX: number, startY: number,
  endX: number, endY: number,
  obstacles: ObstacleRect[],
  depth: number = 0
): { x: number; y: number }[] {
  if (depth > 4) return [];

  const blocking = obstacles.filter(obs =>
    lineSegIntersectsRect(startX, startY, endX, endY, obs)
  );

  if (blocking.length === 0) return [];

  const isHoriz = Math.abs(endX - startX) >= Math.abs(endY - startY);
  blocking.sort((a, b) => {
    const aCx = (a.left + a.right) / 2, aCy = (a.top + a.bottom) / 2;
    const bCx = (b.left + b.right) / 2, bCy = (b.top + b.bottom) / 2;
    if (isHoriz) {
      const dir = endX > startX ? 1 : -1;
      return dir * (aCx - bCx);
    }
    const dir = endY > startY ? 1 : -1;
    return dir * (aCy - bCy);
  });

  const obs = blocking[0];
  const obsCx = (obs.left + obs.right) / 2;
  const obsCy = (obs.top + obs.bottom) / 2;

  const candidates: { x: number; y: number; cost: number }[] = [];

  const topWp = { x: obsCx, y: obs.top - OBSTACLE_MARGIN };
  const bottomWp = { x: obsCx, y: obs.bottom + OBSTACLE_MARGIN };
  const leftWp = { x: obs.left - OBSTACLE_MARGIN, y: obsCy };
  const rightWp = { x: obs.right + OBSTACLE_MARGIN, y: obsCy };

  for (const wp of [topWp, bottomWp, leftWp, rightWp]) {
    const isInsideAnother = obstacles.some(o => o !== obs && pointInRect(wp.x, wp.y, o));
    if (isInsideAnother) continue;
    const cost = Math.hypot(wp.x - startX, wp.y - startY) + Math.hypot(endX - wp.x, endY - wp.y);
    candidates.push({ ...wp, cost });
  }

  if (candidates.length === 0) {
    const fallbackY = (startY < obsCy) ? obs.top - OBSTACLE_MARGIN * 2 : obs.bottom + OBSTACLE_MARGIN * 2;
    return [{ x: obsCx, y: fallbackY }];
  }

  candidates.sort((a, b) => a.cost - b.cost);
  const best = candidates[0];
  const wp = { x: best.x, y: best.y };

  const remainingObs = obstacles.filter(o => o !== obs);
  const beforeWps = computeBypassWaypoints(startX, startY, wp.x, wp.y, remainingObs, depth + 1);
  const afterWps = computeBypassWaypoints(wp.x, wp.y, endX, endY, remainingObs, depth + 1);

  return [...beforeWps, wp, ...afterWps];
}

function buildSmoothPath(
  startX: number, startY: number,
  endX: number, endY: number,
  waypoints: { x: number; y: number }[],
  curveStrength: number,
  horizontal: boolean,
  dirSign: number
): string {
  if (waypoints.length === 0) {
    if (horizontal) {
      return `M ${startX} ${startY} C ${startX + dirSign * curveStrength} ${startY}, ${endX - dirSign * curveStrength} ${endY}, ${endX} ${endY}`;
    } else {
      return `M ${startX} ${startY} C ${startX} ${startY + dirSign * curveStrength}, ${endX} ${endY - dirSign * curveStrength}, ${endX} ${endY}`;
    }
  }

  const allPts = [{ x: startX, y: startY }, ...waypoints, { x: endX, y: endY }];
  let path = `M ${allPts[0].x} ${allPts[0].y}`;

  for (let i = 0; i < allPts.length - 1; i++) {
    const p0 = allPts[i];
    const p1 = allPts[i + 1];
    const segDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const segCurve = Math.min(curveStrength, segDist * 0.4);
    const sdx = p1.x - p0.x, sdy = p1.y - p0.y;
    const segHoriz = Math.abs(sdx) >= Math.abs(sdy);

    if (segHoriz) {
      const d = sdx > 0 ? 1 : -1;
      path += ` C ${p0.x + d * segCurve} ${p0.y}, ${p1.x - d * segCurve} ${p1.y}, ${p1.x} ${p1.y}`;
    } else {
      const d = sdy > 0 ? 1 : -1;
      path += ` C ${p0.x} ${p0.y + d * segCurve}, ${p1.x} ${p1.y - d * segCurve}, ${p1.x} ${p1.y}`;
    }
  }

  return path;
}

function computeEdgePath(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  halfW: number, halfH: number,
  targetHalfW: number, targetHalfH: number,
  obstacles: ObstacleRect[],
  baseCurveDist: number = 400
): string {
  const dx = targetX - sourceX, dy = targetY - sourceY;
  const absDx = Math.abs(dx), absDy = Math.abs(dy);

  let startX: number, startY: number, endX: number, endY: number;
  let horizontal: boolean;

  if (absDx * (halfH * 2) > absDy * (halfW * 2)) {
    horizontal = true;
    if (dx > 0) {
      startX = sourceX + halfW; startY = sourceY;
      endX = targetX - targetHalfW; endY = targetY;
    } else {
      startX = sourceX - halfW; startY = sourceY;
      endX = targetX + targetHalfW; endY = targetY;
    }
  } else {
    horizontal = false;
    if (dy > 0) {
      startX = sourceX; startY = sourceY + halfH;
      endX = targetX; endY = targetY - targetHalfH;
    } else {
      startX = sourceX; startY = sourceY - halfH;
      endX = targetX; endY = targetY + targetHalfH;
    }
  }

  const dist = Math.hypot(endX - startX, endY - startY);
  const t = Math.min(1, dist / baseCurveDist);
  const curveStrength = 30 + t * 50;
  const dirSign = horizontal ? (dx > 0 ? 1 : -1) : (dy > 0 ? 1 : -1);

  const waypoints = computeBypassWaypoints(startX, startY, endX, endY, obstacles);
  return buildSmoothPath(startX, startY, endX, endY, waypoints, curveStrength, horizontal, dirSign);
}

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
  onResizeGroup,
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

    if (e.ctrlKey || e.metaKey) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - pan.x) / zoom;
      const worldY = (mouseY - pan.y) / zoom;

      const zoomFactor = zoom < 0.15 ? 0.01 : ZOOM_STEP;
      const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));

      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    } else {
      const dy = -e.deltaY * PAN_SPEED;
      const dx = -e.deltaX * PAN_SPEED;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
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
    if (doc.x != null && doc.y != null && (doc.x !== 100 || doc.y !== 100)) {
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
    if (group.x != null && group.y != null && (group.x !== 100 || group.y !== 100)) {
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
      case "depends": return "hsl(var(--destructive) / 0.85)";
      case "parent": return "hsl(142, 55%, 42%)";
      default: return "hsl(var(--muted-foreground) / 0.6)";
    }
  };

  const TIMELINE_MONTH_WIDTH = 800;
  const TIMELINE_OFFSET_X = 150;
  const TIMELINE_BASE_YEAR = 2025;
  const TIMELINE_BASE_MONTH = 12;

  const timelineStartMonth = TIMELINE_BASE_MONTH;
  const timelineEndMonth = 24;

  const allPositions = [...Object.values(docPositions), ...Object.values(groupPositions)];
  const timelineRightEdge = TIMELINE_OFFSET_X + (timelineEndMonth - TIMELINE_BASE_MONTH + 1) * TIMELINE_MONTH_WIDTH;
  const canvasWidth = Math.max(dimensions.width / zoom, ...allPositions.map(p => p.x + 400), timelineRightEdge + 200, 1200);
  const canvasHeight = Math.max(dimensions.height / zoom, ...allPositions.map(p => p.y + 300), 800);

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
        year={TIMELINE_BASE_YEAR}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        monthWidth={TIMELINE_MONTH_WIDTH}
        offsetX={TIMELINE_OFFSET_X}
        zoom={zoom}
        panX={pan.x}
        activeDate={viewingDocumentId ? documents.find(d => d.id === viewingDocumentId)?.createdAt : null}
        activeDocTitle={viewingDocumentId ? documents.find(d => d.id === viewingDocumentId)?.title : null}
      />

      {/* Timeline grid lines - fixed to viewport, scales with zoom */}
      <TimelineGridLines
        startMonth={timelineStartMonth}
        endMonth={timelineEndMonth}
        year={TIMELINE_BASE_YEAR}
        monthWidth={TIMELINE_MONTH_WIDTH}
        offsetX={TIMELINE_OFFSET_X}
        zoom={zoom}
        panX={pan.x}
        viewportHeight={dimensions.height}
        activeDate={viewingDocumentId ? documents.find(d => d.id === viewingDocumentId)?.createdAt : null}
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
            <marker id="arrow-flow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M 0.5 0.5 L 5 3 L 0.5 5.5 Z" fill="hsl(var(--primary))" fillOpacity="0.7" stroke="none" />
            </marker>
            <marker id="arrow-depends" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M 0.5 0.5 L 5 3 L 0.5 5.5 Z" fill="hsl(var(--destructive))" fillOpacity="0.7" stroke="none" />
            </marker>
            <marker id="arrow-parent" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M 0.5 0.5 L 5 3 L 0.5 5.5 Z" fill="hsl(142, 60%, 45%)" fillOpacity="0.7" stroke="none" />
            </marker>
            <marker id="arrow-related" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
              <circle cx="2.5" cy="2.5" r="2" fill="hsl(var(--muted-foreground))" fillOpacity="0.5" stroke="none" />
            </marker>
            <marker id="arrow-group-flow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0.5 0.5 L 7 4 L 0.5 7.5 Z" fill="hsl(var(--primary))" fillOpacity="0.6" stroke="none" />
            </marker>
            <marker id="arrow-group-depends" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0.5 0.5 L 7 4 L 0.5 7.5 Z" fill="hsl(var(--destructive))" fillOpacity="0.6" stroke="none" />
            </marker>
          </defs>

          {/* Document-to-document edges (visible at Level 5: zoom >= ZOOM_L4) */}
          {zoom >= ZOOM_L4 && (() => {
            const docObstacles: ObstacleRect[] = Object.entries(docPositions).map(([idStr, pos]) => {
              const id = Number(idStr);
              return {
                id,
                left: pos.x - DOC_WIDTH / 2 - 5,
                top: pos.y - DOC_HEIGHT / 2 - 5,
                right: pos.x + DOC_WIDTH / 2 + 5,
                bottom: pos.y + DOC_HEIGHT / 2 + 5,
              };
            });

            return edges.map((edge) => {
              const sourcePos = docPositions[edge.sourceDocId];
              const targetPos = docPositions[edge.targetDocId];
              if (!sourcePos || !targetPos) return null;

              const obstacles = docObstacles.filter(
                o => o.id !== edge.sourceDocId && o.id !== edge.targetDocId
              );

              const HALF_W = DOC_WIDTH / 2;
              const HALF_H = DOC_HEIGHT / 2;
              const pathD = computeEdgePath(
                sourcePos.x, sourcePos.y,
                targetPos.x, targetPos.y,
                HALF_W, HALF_H, HALF_W, HALF_H,
                obstacles, 400
              );

              const edgeColor = getEdgeColor(edge.edgeType);
              const markerId = `arrow-${edge.edgeType}`;
              const isRelated = edge.edgeType === "related";

              return (
                <g key={`edge-${edge.id}`}>
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
                    strokeOpacity={isRelated ? 0.5 : 0.7}
                    strokeDasharray={isRelated ? "6,4" : undefined}
                    markerEnd={`url(#${markerId})`}
                  />
                </g>
              );
            });
          })()}

          {/* Group-to-group edges (visible at Level 2+: zoom >= ZOOM_L1) */}
          {zoom >= ZOOM_L1 && groupEdges.map((edge) => {
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
              let autoW: number, autoH: number, cx: number, cy: number;
              
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
                  autoW = (mxX - mnX) + GROUP_PADDING * 2;
                  autoH = (mxY - mnY) + GROUP_HEADER + GROUP_PADDING;
                  const topLeftX = mnX - GROUP_PADDING;
                  const topLeftY = mnY - GROUP_HEADER;
                  cx = topLeftX + autoW / 2;
                  cy = topLeftY + autoH / 2;
                } else {
                  autoW = DOC_WIDTH + GROUP_PADDING * 2;
                  autoH = DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING;
                  cx = pos.x;
                  cy = pos.y + TIMELINE_GAP;
                }
              } else {
                const directDocs = documents.filter(d => d.groupId === group.id);
                if (directDocs.length > 0) {
                  const cb = getChildGroupBounds(group);
                  autoW = cb.width;
                  autoH = cb.height;
                  cx = cb.centerX;
                  cy = cb.centerY;
                } else {
                  autoW = DOC_WIDTH + GROUP_PADDING * 2;
                  autoH = DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING;
                  cx = pos.x;
                  cy = pos.y + TIMELINE_GAP;
                }
              }
              
              return {
                x: cx,
                y: cy,
                width: group.manualWidth ?? autoW,
                height: group.manualHeight ?? autoH
              };
            };
            
            const sourceCenter = getGroupCenter(sourceGroup);
            const targetCenter = getGroupCenter(targetGroup);
            if (!sourceCenter || !targetCenter) return null;

            const groupObstacles: ObstacleRect[] = groups
              .filter(g => g.id !== edge.sourceGroupId && g.id !== edge.targetGroupId)
              .map(g => {
                const gc = getGroupCenter(g);
                if (!gc) return null;
                return {
                  id: g.id,
                  left: gc.x - gc.width / 2 - 10,
                  top: gc.y - gc.height / 2 - 10,
                  right: gc.x + gc.width / 2 + 10,
                  bottom: gc.y + gc.height / 2 + 10,
                };
              })
              .filter(Boolean) as ObstacleRect[];

            const pathD = computeEdgePath(
              sourceCenter.x, sourceCenter.y,
              targetCenter.x, targetCenter.y,
              sourceCenter.width / 2, sourceCenter.height / 2,
              targetCenter.width / 2, targetCenter.height / 2,
              groupObstacles, 600
            );
            
            const edgeColor = edge.edgeType === "depends" 
              ? "hsl(var(--destructive) / 0.85)" 
              : edge.edgeType === "related"
              ? "hsl(var(--muted-foreground) / 0.6)"
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
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeOpacity="0.6"
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
              zIndex: 15,
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
          // Include documents directly assigned to this top-level group
          const directDocs = documents.filter(d => d.groupId === group.id);
          return (
            <GroupBox
              key={`group-${group.id}`}
              group={group}
              documents={directDocs}
              childGroups={childGroups}
              allDocuments={documents}
              docPositions={docPositions}
              x={pos.x}
              y={pos.y + TIMELINE_GAP}
              zoom={zoom}
              isSelected={selectedGroupId === group.id || selectedGroupIds.has(group.id)}
              isExpanded={true}
              isTopLevel={true}
              isSpacePressed={isSpacePressed}
              onSelect={handleGroupSelect}
              onToggleExpand={onToggleGroupExpand}
              onDragEnd={handleGroupPositionUpdate}
              onResize={onResizeGroup}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
            />
          );
        })}

        {/* Render child groups (중분류) — visible at Level 3+: zoom >= ZOOM_L2 */}
        {zoom >= ZOOM_L2 && groups
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
              zoom={zoom}
              isSelected={selectedGroupId === group.id || selectedGroupIds.has(group.id)}
              isExpanded={false}
              isTopLevel={false}
              isSpacePressed={isSpacePressed}
              onSelect={handleGroupSelect}
              onToggleExpand={onToggleGroupExpand}
              onDragEnd={handleGroupPositionUpdate}
              onResize={onResizeGroup}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
            />
          );
        })}

        {/* Render document boxes — visible at Level 4+: zoom >= ZOOM_L3 */}
        {zoom >= ZOOM_L3 && documents.map((doc) => {
          const pos = docPositions[doc.id];
          if (!pos) return null;
          return (
            <DocumentBox
              key={`doc-${doc.id}`}
              document={doc}
              x={pos.x}
              y={pos.y}
              zoom={zoom}
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

      <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border rounded-md px-3 py-2 shadow-sm" style={{ zIndex: 20 }} data-testid="edge-legend">
        <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 tracking-wide">연결선 의미</p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <svg width="30" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" /><path d="M 20 2 L 26 5 L 20 8 Z" fill="hsl(var(--primary))" fillOpacity="0.7" stroke="none" /></svg>
            <span className="text-[10px] text-foreground/70">흐름 (순차적 진행)</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="30" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="hsl(var(--destructive))" strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" /><path d="M 20 2 L 26 5 L 20 8 Z" fill="hsl(var(--destructive))" fillOpacity="0.6" stroke="none" /></svg>
            <span className="text-[10px] text-foreground/70">의존 (선행 필요)</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="30" height="10"><line x1="0" y1="5" x2="22" y2="5" stroke="hsl(142, 55%, 42%)" strokeWidth="1.5" strokeOpacity="0.7" strokeLinecap="round" /><path d="M 20 2 L 26 5 L 20 8 Z" fill="hsl(142, 55%, 42%)" fillOpacity="0.7" stroke="none" /></svg>
            <span className="text-[10px] text-foreground/70">상위 (계층 관계)</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="30" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeOpacity="0.45" strokeDasharray="4,3" strokeLinecap="round" /><circle cx="27" cy="5" r="2" fill="hsl(var(--muted-foreground))" fillOpacity="0.5" /></svg>
            <span className="text-[10px] text-foreground/70">관련 (참고 연관)</span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur-sm border rounded-lg p-1 shadow-lg" style={{ zIndex: 20 }}>
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
          <span className="ml-1 text-[9px] text-muted-foreground">
            {zoom < ZOOM_L1 ? "전체" : zoom < ZOOM_L2 ? "대" : zoom < ZOOM_L3 ? "중" : zoom < ZOOM_L4 ? "소" : "상세"}
          </span>
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

      <div className="absolute top-4 left-4 text-xs text-muted-foreground bg-card/80 backdrop-blur-sm px-2 py-1 rounded" style={{ zIndex: 20 }}>
        스크롤: 상하이동 | Ctrl+스크롤: 확대/축소 | 스페이스+드래그: 자유이동
      </div>
    </div>
  );
}
