import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentBox } from "./DocumentBox";
import { GroupBox } from "./GroupBox";
import { Minimap } from "./Minimap";
import { TimelineHeader, TimelineGridLines } from "./TimelineHeader";
import { PanelLeftIcon, ZoomIn, ZoomOut, RotateCcw } from "@/lib/icons";
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
const ZOOM_STEP = 0.02;
const WHEEL_ZOOM_SENSITIVITY = 0.0008;

const ZOOM_L1 = 0.08;
const ZOOM_L2 = 0.1;
const ZOOM_L3 = 0.3;
const ZOOM_L4 = 0.6;
const PAN_SPEED = 1.5;
const DOC_WIDTH = 340;
const DOC_HEIGHT = 190;
const DOC_GAP_X = 24;
const DOC_GAP_Y = 86;
const GROUP_PADDING = 36;
const GROUP_HEADER = 112;
const GROUP_CONTENT_GAP = 32;
const GROUP_MONTH_MARGIN = 12;
const TIMELINE_HEIGHT = 50;
const TIMELINE_GAP = 80;
const TIMELINE_MONTH_WIDTH = 800;
const TIMELINE_OFFSET_X = 150;
const TIMELINE_BASE_YEAR = 2026;
const TIMELINE_BASE_MONTH = 1;
const OBSTACLE_MARGIN = 25;
const LAYER_SIDEBAR_DEFAULT_WIDTH = 288;
const LAYER_SIDEBAR_CLOSE_WIDTH = LAYER_SIDEBAR_DEFAULT_WIDTH / 3;
const LAYER_SIDEBAR_MIN_DRAG_WIDTH = 80;
const LAYER_SIDEBAR_MAX_WIDTH = 480;

type ObstacleRect = { left: number; top: number; right: number; bottom: number; id?: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getDocumentYearMonth(doc: Document) {
  const date = new Date(doc.createdAt);
  if (Number.isNaN(date.getTime())) {
    return { year: TIMELINE_BASE_YEAR, month: TIMELINE_BASE_MONTH };
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function getMonthLeftX(year: number, month: number) {
  const monthIndex = (year - TIMELINE_BASE_YEAR) * 12 + month - TIMELINE_BASE_MONTH;
  return TIMELINE_OFFSET_X + monthIndex * TIMELINE_MONTH_WIDTH;
}

function getMonthCenterX(year: number, month: number) {
  return getMonthLeftX(year, month) + TIMELINE_MONTH_WIDTH / 2;
}

function clampDocumentXToMonth(doc: Document, x: number) {
  const { year, month } = getDocumentYearMonth(doc);
  const monthLeft = getMonthLeftX(year, month);
  const minX = monthLeft + GROUP_MONTH_MARGIN + DOC_WIDTH / 2 + GROUP_PADDING;
  const maxX = monthLeft + TIMELINE_MONTH_WIDTH - GROUP_MONTH_MARGIN - DOC_WIDTH / 2 - GROUP_PADDING;
  if (minX > maxX) {
    return getMonthCenterX(year, month);
  }
  return clamp(x, minX, maxX);
}

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

function computeEdgePath(
  sourceX: number, sourceY: number,
  targetX: number, targetY: number,
  halfW: number, halfH: number,
  targetHalfW: number, targetHalfH: number,
  obstacles: ObstacleRect[],
  _baseCurveDist: number = 400,
  sourceGap: number = 6,
  targetGap: number = 16
): string {
  return computeClosestGroupEdgePath(
    { x: sourceX, y: sourceY, width: halfW * 2, height: halfH * 2 },
    { x: targetX, y: targetY, width: targetHalfW * 2, height: targetHalfH * 2 },
    obstacles,
    sourceGap,
    targetGap,
  );
}

type GroupEdgeRect = { x: number; y: number; width: number; height: number };
type EdgeSide = "left" | "right" | "top" | "bottom";
type EdgePoint = { x: number; y: number; portX: number; portY: number; side: EdgeSide };

function rectToObstacle(rect: GroupEdgeRect, id?: number): ObstacleRect {
  return {
    id,
    left: rect.x - rect.width / 2,
    top: rect.y - rect.height / 2,
    right: rect.x + rect.width / 2,
    bottom: rect.y + rect.height / 2,
  };
}

function getGroupEdgeAnchors(rect: GroupEdgeRect, _gap: number): EdgePoint[] {
  const left = rect.x - rect.width / 2;
  const right = rect.x + rect.width / 2;
  const top = rect.y - rect.height / 2;
  const bottom = rect.y + rect.height / 2;

  return [
    { x: left, y: rect.y, portX: left, portY: rect.y, side: "left" },
    { x: right, y: rect.y, portX: right, portY: rect.y, side: "right" },
    { x: rect.x, y: top, portX: rect.x, portY: top, side: "top" },
    { x: rect.x, y: bottom, portX: rect.x, portY: bottom, side: "bottom" },
  ];
}

function directionPenalty(side: EdgeSide, dx: number, dy: number, isSource: boolean): number {
  const primaryHorizontal = Math.abs(dx) >= Math.abs(dy);
  if (isSource) {
    if (primaryHorizontal) return (dx < 0 && side === "left") || (dx > 0 && side === "right") ? 0 : 80;
    return (dy < 0 && side === "top") || (dy > 0 && side === "bottom") ? 0 : 80;
  }

  if (primaryHorizontal) return (dx < 0 && side === "right") || (dx > 0 && side === "left") ? 0 : 80;
  return (dy < 0 && side === "bottom") || (dy > 0 && side === "top") ? 0 : 80;
}

function routeLength(points: { x: number; y: number }[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    length += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return length;
}

function routeCrossesObstacles(points: { x: number; y: number }[], obstacles: ObstacleRect[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (obstacles.some((obs) => lineSegIntersectsRect(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, obs))) {
      return true;
    }
  }
  return false;
}

function orthogonalizePoints(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const result: { x: number; y: number }[] = [];

  for (const point of points) {
    const prev = result[result.length - 1];
    if (!prev) {
      result.push(point);
      continue;
    }

    if (point.x === prev.x || point.y === prev.y) {
      if (point.x !== prev.x || point.y !== prev.y) result.push(point);
      continue;
    }

    result.push({ x: point.x, y: prev.y }, point);
  }

  return result.filter((point, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return point.x !== prev.x || point.y !== prev.y;
  });
}

function buildOrthogonalRoutePath(
  start: EdgePoint,
  corePoints: { x: number; y: number }[],
  end: EdgePoint
): string {
  const startPort = { x: start.portX, y: start.portY };
  const endPort = { x: end.portX, y: end.portY };
  const points = [
    { x: start.x, y: start.y },
    startPort,
    ...corePoints.slice(1, -1),
    endPort,
    { x: end.x, y: end.y },
  ];
  const orthogonalPoints = orthogonalizePoints(points).filter((point, index, arr) => {
    if (index === 0) return true;
    const prev = arr[index - 1];
    return point.x !== prev.x || point.y !== prev.y;
  });

  return orthogonalPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function computeClosestGroupEdgePath(
  source: GroupEdgeRect,
  target: GroupEdgeRect,
  _obstacles: ObstacleRect[] = [],
  sourceGap = 10,
  targetGap = 22
): string {
  const sourceAnchors = getGroupEdgeAnchors(source, sourceGap);
  const targetAnchors = getGroupEdgeAnchors(target, targetGap);
  let bestRoute: { points: { x: number; y: number }[]; cost: number } | null = null;

  for (const start of sourceAnchors) {
    for (const end of targetAnchors) {
      const startPoint = { x: start.x, y: start.y };
      const endPoint = { x: end.x, y: end.y };
      const routes: { x: number; y: number }[][] = [
        [startPoint, { x: end.x, y: start.y }, endPoint],
        [startPoint, { x: start.x, y: end.y }, endPoint],
      ];

      for (const points of routes) {
        const normalizedPoints = points.filter((point, index, arr) => {
          if (index === 0) return true;
          const prev = arr[index - 1];
          return point.x !== prev.x || point.y !== prev.y;
        });

        const bends = Math.max(0, normalizedPoints.length - 2);
        const cost = routeLength(normalizedPoints) + bends * 0.001;

        if (!bestRoute || cost < bestRoute.cost) {
          bestRoute = { points: [start, ...normalizedPoints, end], cost };
        }
      }
    }
  }

  if (bestRoute) {
    const start = bestRoute.points[0] as EdgePoint;
    const end = bestRoute.points[bestRoute.points.length - 1] as EdgePoint;
    return buildOrthogonalRoutePath(start, bestRoute.points.slice(1, -1), end);
  }

  return "";
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
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  
  // Multi-selection state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const selectionStartRef = useRef({ x: 0, y: 0 });
  const [isLayerSidebarOpen, setIsLayerSidebarOpen] = useState(true);
  const [layerSidebarWidth, setLayerSidebarWidth] = useState(LAYER_SIDEBAR_DEFAULT_WIDTH);
  const cascadeDragStartRef = useRef<{
    id: number;
    groupPositions: Record<number, { x: number; y: number }>;
    docPositions: Record<number, { x: number; y: number }>;
  } | null>(null);

  const handleLayerSidebarResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = layerSidebarWidth;
    let latestWidth = startWidth;

    const handleMouseMove = (event: MouseEvent) => {
      latestWidth = startWidth + event.clientX - startX;
      setLayerSidebarWidth(
        Math.max(
          LAYER_SIDEBAR_MIN_DRAG_WIDTH,
          Math.min(LAYER_SIDEBAR_MAX_WIDTH, latestWidth),
        ),
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      if (latestWidth <= LAYER_SIDEBAR_CLOSE_WIDTH) {
        setIsLayerSidebarOpen(false);
        setLayerSidebarWidth(LAYER_SIDEBAR_DEFAULT_WIDTH);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, [layerSidebarWidth]);

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

  // Native non-passive wheel listener so Ctrl+scroll zooms the canvas
  // instead of triggering the browser's page zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;

      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const worldX = (mouseX - currentPan.x) / currentZoom;
        const worldY = (mouseY - currentPan.y) / currentZoom;

        const zoomFactor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, currentZoom * zoomFactor));

        const newPanX = mouseX - worldX * newZoom;
        const newPanY = mouseY - worldY * newZoom;

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      } else {
        const dy = -e.deltaY * PAN_SPEED;
        const dx = -e.deltaX * PAN_SPEED;
        setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
                groupTop = Math.min(...docBounds.map(b => b.top)) - GROUP_HEADER - GROUP_CONTENT_GAP;
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
      return { x: clampDocumentXToMonth(doc, doc.x), y: doc.y };
    }
    const colWidth = DOC_WIDTH + DOC_GAP_X;
    const rowHeight = DOC_HEIGHT + DOC_GAP_Y;
    const cols = Math.max(1, Math.floor((width - 100) / colWidth));
    const row = Math.floor(index / cols);
    const col = index % cols;
    const { year, month } = getDocumentYearMonth(doc);
    const defaultX = getMonthCenterX(year, month) + (col - Math.floor(cols / 2)) * colWidth;
    return {
      x: clampDocumentXToMonth(doc, defaultX),
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
    const doc = documents.find((item) => item.id === id);
    const nextX = doc ? clampDocumentXToMonth(doc, x) : x;
    setDocPositions(prev => ({ ...prev, [id]: { x: nextX, y } }));
  }, [documents]);

  const getGroupCascadeIds = useCallback((groupId: number) => {
    const groupIds = new Set<number>([groupId]);
    let changed = true;

    while (changed) {
      changed = false;
      groups.forEach((group) => {
        if (group.parentId != null && groupIds.has(group.parentId) && !groupIds.has(group.id)) {
          groupIds.add(group.id);
          changed = true;
        }
      });
    }

    const docIds = documents
      .filter((doc) => doc.groupId != null && groupIds.has(doc.groupId))
      .map((doc) => doc.id);

    return { groupIds, docIds };
  }, [documents, groups]);

  const getDescendantDocuments = useCallback((groupId: number): Document[] => {
    const childGroups = groups.filter((group) => group.parentId === groupId);
    return [
      ...documents.filter((doc) => doc.groupId === groupId),
      ...childGroups.flatMap((group) => getDescendantDocuments(group.id)),
    ];
  }, [documents, groups]);

  const clampGroupXToMonthRange = useCallback((
    groupId: number,
    x: number,
    positions: Record<number, { x: number; y: number }> = docPositions
  ) => {
    const group = groups.find((item) => item.id === groupId);
    const groupDocs = getDescendantDocuments(groupId);
    if (groupDocs.length === 0) return x;

    const monthLeft = Math.min(...groupDocs.map((doc) => {
      const { year, month } = getDocumentYearMonth(doc);
      return getMonthLeftX(year, month);
    }));
    const monthRight = Math.max(...groupDocs.map((doc) => {
      const { year, month } = getDocumentYearMonth(doc);
      return getMonthLeftX(year, month) + TIMELINE_MONTH_WIDTH;
    }));

    const docXs = groupDocs
      .map((doc) => positions[doc.id]?.x)
      .filter((value): value is number => typeof value === "number");
    const contentWidth = docXs.length > 0
      ? Math.max(DOC_WIDTH + GROUP_PADDING * 2, (Math.max(...docXs) - Math.min(...docXs)) + DOC_WIDTH + GROUP_PADDING * 2)
      : DOC_WIDTH + GROUP_PADDING * 2;
    const groupWidth = Math.max(group?.manualWidth ?? 0, contentWidth);
    const minX = monthLeft + GROUP_MONTH_MARGIN + groupWidth / 2;
    const maxX = monthRight - GROUP_MONTH_MARGIN - groupWidth / 2;

    if (minX > maxX) {
      return (monthLeft + monthRight) / 2;
    }
    return clamp(x, minX, maxX);
  }, [docPositions, getDescendantDocuments, groups]);

  const handleGroupDragMove = useCallback((id: number, x: number, y: number, prevX: number, prevY: number) => {
    const deltaX = x - prevX;
    const deltaY = y - prevY;
    const { groupIds, docIds } = getGroupCascadeIds(id);

    if (cascadeDragStartRef.current?.id !== id) {
      cascadeDragStartRef.current = {
        id,
        groupPositions: { ...groupPositions, [id]: { x: prevX, y: prevY } },
        docPositions: { ...docPositions },
      };
    }
    const start = cascadeDragStartRef.current;

    setGroupPositions((prev) => {
      const next = { ...prev };
      groupIds.forEach((groupId) => {
        const base = groupId === id
          ? { x: prevX, y: prevY }
          : start.groupPositions[groupId];
        if (base) {
          next[groupId] = {
            x: clampGroupXToMonthRange(groupId, base.x + deltaX),
            y: base.y + deltaY,
          };
        }
      });
      return next;
    });

    setDocPositions((prev) => {
      const next = { ...prev };
      docIds.forEach((docId) => {
        const base = start.docPositions[docId];
        if (base) {
          const doc = documents.find((item) => item.id === docId);
          const proposedX = base.x + deltaX;
          next[docId] = {
            x: doc ? clampDocumentXToMonth(doc, proposedX) : proposedX,
            y: base.y + deltaY,
          };
        }
      });
      return next;
    });
  }, [clampGroupXToMonthRange, docPositions, documents, getGroupCascadeIds, groupPositions]);

  // Handle multi-drag for documents
  const handleLocalPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    const activeDoc = documents.find((doc) => doc.id === id);
    const clampedX = activeDoc ? clampDocumentXToMonth(activeDoc, x) : x;
    const deltaX = clampedX - prevX;
    const deltaY = y - prevY;
    
    // If this document is part of multi-selection, move all selected items
    if (selectedDocIds.has(id) && selectedDocIds.size > 1) {
      const newDocPositions = { ...docPositions };
      selectedDocIds.forEach(docId => {
        if (docId !== id && docPositions[docId]) {
          const doc = documents.find((item) => item.id === docId);
          const proposedX = docPositions[docId].x + deltaX;
          const newX = doc ? clampDocumentXToMonth(doc, proposedX) : proposedX;
          const newY = docPositions[docId].y + deltaY;
          newDocPositions[docId] = { x: newX, y: newY };
          onUpdateDocumentPosition(docId, newX, newY);
        }
      });
      newDocPositions[id] = { x: clampedX, y };
      setDocPositions(newDocPositions);
      onUpdateDocumentPosition(id, clampedX, y, prevX, prevY);
      
      // Also move selected groups
      if (selectedGroupIds.size > 0) {
        const newGroupPositions = { ...groupPositions };
        selectedGroupIds.forEach(groupId => {
          if (groupPositions[groupId]) {
            const newX = clampGroupXToMonthRange(groupId, groupPositions[groupId].x + deltaX);
            const newY = groupPositions[groupId].y + deltaY;
            newGroupPositions[groupId] = { x: newX, y: newY };
            onUpdateGroupPosition(groupId, newX, newY);
          }
        });
        setGroupPositions(newGroupPositions);
      }
    } else {
      setDocPositions(prev => ({ ...prev, [id]: { x: clampedX, y } }));
      onUpdateDocumentPosition(id, clampedX, y, prevX, prevY);
    }
  };

  // Handle multi-drag for groups
  const handleGroupPositionUpdate = (id: number, x: number, y: number, prevX: number, prevY: number) => {
    const deltaX = x - prevX;
    const deltaY = y - prevY;
    const { groupIds: cascadeGroupIds, docIds: cascadeDocIds } = getGroupCascadeIds(id);
    const cascadeStart = cascadeDragStartRef.current?.id === id ? cascadeDragStartRef.current : null;
    cascadeDragStartRef.current = null;
    
    // If this group is part of multi-selection, move all selected items
    if (selectedGroupIds.has(id) && (selectedGroupIds.size > 1 || selectedDocIds.size > 0)) {
      const newGroupPositions = { ...groupPositions };
      selectedGroupIds.forEach(groupId => {
        if (groupId !== id && groupPositions[groupId]) {
          const newX = clampGroupXToMonthRange(groupId, groupPositions[groupId].x + deltaX);
          const newY = groupPositions[groupId].y + deltaY;
          newGroupPositions[groupId] = { x: newX, y: newY };
          onUpdateGroupPosition(groupId, newX, newY);
        }
      });
      const clampedGroupX = clampGroupXToMonthRange(id, x);
      newGroupPositions[id] = { x: clampedGroupX, y };
      setGroupPositions(newGroupPositions);
      onUpdateGroupPosition(id, clampedGroupX, y, prevX, prevY);
      
      // Also move selected documents
      if (selectedDocIds.size > 0) {
        const newDocPositions = { ...docPositions };
        selectedDocIds.forEach(docId => {
          if (docPositions[docId]) {
            const doc = documents.find((item) => item.id === docId);
            const proposedX = docPositions[docId].x + deltaX;
            const newX = doc ? clampDocumentXToMonth(doc, proposedX) : proposedX;
            const newY = docPositions[docId].y + deltaY;
            newDocPositions[docId] = { x: newX, y: newY };
            onUpdateDocumentPosition(docId, newX, newY);
          }
        });
        setDocPositions(newDocPositions);
      }
    } else {
      setGroupPositions(prev => {
        const clampedGroupX = clampGroupXToMonthRange(id, x);
        const next = { ...prev, [id]: { x: clampedGroupX, y } };
        cascadeGroupIds.forEach(groupId => {
          const base = cascadeStart?.groupPositions[groupId] ?? prev[groupId];
          if (groupId !== id && base) {
            const newX = clampGroupXToMonthRange(groupId, base.x + deltaX);
            const newY = base.y + deltaY;
            next[groupId] = { x: newX, y: newY };
            onUpdateGroupPosition(groupId, newX, newY);
          }
        });
        return next;
      });
      setDocPositions(prev => {
        const next = { ...prev };
        cascadeDocIds.forEach(docId => {
          const base = cascadeStart?.docPositions[docId] ?? prev[docId];
          if (base) {
            const doc = documents.find((item) => item.id === docId);
            const proposedX = base.x + deltaX;
            const newX = doc ? clampDocumentXToMonth(doc, proposedX) : proposedX;
            const newY = base.y + deltaY;
            next[docId] = { x: newX, y: newY };
            onUpdateDocumentPosition(docId, newX, newY);
          }
        });
        return next;
      });
      onUpdateGroupPosition(id, clampGroupXToMonthRange(id, x), y, prevX, prevY);
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

  const groupLayerItems = useMemo(() => {
    const childMap = new Map<number, DocumentGroup[]>();
    groups.forEach((group) => {
      if (group.parentId === null) return;
      const children = childMap.get(group.parentId) ?? [];
      children.push(group);
      childMap.set(group.parentId, children);
    });

    const collectGroupIds = (groupId: number): number[] => {
      const children = childMap.get(groupId) ?? [];
      return [
        groupId,
        ...children.flatMap((child) => collectGroupIds(child.id)),
      ];
    };

    const countDocs = (groupId: number) => {
      const ids = new Set(collectGroupIds(groupId));
      return documents.filter((doc) => doc.groupId !== null && ids.has(doc.groupId)).length;
    };

    return groups
      .filter((group) => group.parentId === null)
      .sort((a, b) => {
        const aMonth = a.monthStart ?? 99;
        const bMonth = b.monthStart ?? 99;
        if (aMonth !== bMonth) return aMonth - bMonth;
        return a.name.localeCompare(b.name);
      })
      .map((group) => ({
        group,
        count: countDocs(group.id),
        children: (childMap.get(group.id) ?? [])
          .sort((a, b) => {
            const aMonth = a.monthStart ?? 99;
            const bMonth = b.monthStart ?? 99;
            if (aMonth !== bMonth) return aMonth - bMonth;
            return a.name.localeCompare(b.name);
          })
          .map((child) => ({
            group: child,
            count: countDocs(child.id),
          })),
      }));
  }, [documents, groups]);

  const timelineStartMonth = TIMELINE_BASE_MONTH;
  const timelineEndMonth = 12;

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
      data-testid="document-canvas"
    >
      {isLayerSidebarOpen ? (
      <aside
        className="absolute left-4 top-16 max-h-[calc(100%-8rem)] overflow-y-auto rounded-md border bg-card/95 shadow-lg backdrop-blur-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ zIndex: 22, width: layerSidebarWidth }}
        data-testid="group-layer-sidebar"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="border-b px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">레이어</h2>
            <span className="text-[11px] text-muted-foreground">{documents.length}개 보고서</span>
          </div>
        </div>
        <div className="space-y-2 p-2">
          {groupLayerItems.map(({ group, count, children }) => (
            <div key={`layer-group-${group.id}`} className="rounded border bg-background/70">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-muted/60"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectGroup(group.id);
                }}
              >
                <span className="min-w-0 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-sm"
                    style={{ backgroundColor: group.color ?? "#6366f1" }}
                  />
                  <span className="truncate text-xs font-medium">{group.name}</span>
                </span>
                <span className="flex-shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {count}개
                </span>
              </button>
              {children.length > 0 && (
                <div className="border-t py-1">
                  {children.map(({ group: child, count: childCount }) => (
                    <button
                      key={`layer-child-${child.id}`}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 pl-7 text-left hover:bg-muted/60"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectGroup(child.id);
                      }}
                    >
                      <span className="min-w-0 flex items-center gap-2">
                        <span
                          className="h-2 w-2 flex-shrink-0 rounded-sm"
                          style={{ backgroundColor: child.color ?? "#6366f1" }}
                        />
                        <span className="truncate text-[11px] text-foreground/80">{child.name}</span>
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-muted-foreground">{childCount}개</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div
          className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md hover:bg-primary/20"
          onMouseDown={handleLayerSidebarResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize layer sidebar"
          data-testid="layer-sidebar-resize-handle"
        />
      </aside>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute left-4 top-16 h-9 w-9 bg-card/95 shadow-lg backdrop-blur-sm"
          style={{ zIndex: 22 }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setLayerSidebarWidth(LAYER_SIDEBAR_DEFAULT_WIDTH);
            setIsLayerSidebarOpen(true);
          }}
          data-testid="button-open-layer-sidebar"
        >
          <PanelLeftIcon className="h-4 w-4" />
        </Button>
      )}

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
          style={{ width: canvasWidth, height: canvasHeight, zIndex: 16 }}
        >
          <defs>
            <marker id="arrow-flow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
              <path d="M 1 1 L 9 5 L 1 9 Z" fill="hsl(var(--primary))" fillOpacity="0.7" stroke="none" />
            </marker>
            <marker id="arrow-depends" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
              <path d="M 1 1 L 9 5 L 1 9 Z" fill="hsl(var(--destructive))" fillOpacity="0.7" stroke="none" />
            </marker>
            <marker id="arrow-parent" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
              <path d="M 1 1 L 9 5 L 1 9 Z" fill="hsl(142, 60%, 45%)" fillOpacity="0.7" stroke="none" />
            </marker>
            <marker id="arrow-related" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <circle cx="4" cy="4" r="3" fill="hsl(var(--muted-foreground))" fillOpacity="0.5" stroke="none" />
            </marker>
            <marker id="arrow-group-flow" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
              <path d="M 1 1 L 11 6 L 1 11 Z" fill="hsl(var(--primary))" fillOpacity="0.6" stroke="none" />
            </marker>
            <marker id="arrow-group-depends" markerWidth="12" markerHeight="12" refX="11" refY="6" orient="auto">
              <path d="M 1 1 L 11 6 L 1 11 Z" fill="hsl(var(--destructive))" fillOpacity="0.6" stroke="none" />
            </marker>
          </defs>

          {/* Group-to-group edges (visible once child groups are visible) */}
          {zoom >= ZOOM_L2 && groupEdges.map((edge) => {
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
                const h = DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
                return { centerX: cx, centerY: cy, width: w, height: h };
              }
              let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
              for (const d of childDocs) {
                const docPos = docPositions[d.id];
                const docX = docPos?.x ?? d.x;
                const docY = docPos?.y ?? d.y;
                if (docX != null && docY != null) {
                  mnX = Math.min(mnX, docX - DOC_WIDTH / 2);
                  mxX = Math.max(mxX, docX + DOC_WIDTH / 2);
                  mnY = Math.min(mnY, docY - DOC_HEIGHT / 2);
                  mxY = Math.max(mxY, docY + DOC_HEIGHT / 2);
                }
              }
              if (mnX === Infinity) {
                const cgPos = groupPositions[childGroup.id];
                const cx = cgPos ? cgPos.x : childGroup.x;
                const cy = cgPos ? cgPos.y + TIMELINE_GAP : (childGroup.y ?? 0) + TIMELINE_GAP;
                return {
                  centerX: cx,
                  centerY: cy,
                  width: DOC_WIDTH + GROUP_PADDING * 2,
                  height: DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
                };
              }
              const w = Math.max(DOC_WIDTH + GROUP_PADDING * 2, (mxX - mnX) + GROUP_PADDING * 2);
              const h = Math.max(
                DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
                (mxY - mnY) + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
              );
              const topLeftX = mnX - GROUP_PADDING;
              const topLeftY = mnY - GROUP_HEADER - GROUP_CONTENT_GAP;
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
                  autoH = (mxY - mnY) + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
                  const topLeftX = mnX - GROUP_PADDING;
                  const topLeftY = mnY - GROUP_HEADER - GROUP_CONTENT_GAP;
                  cx = topLeftX + autoW / 2;
                  cy = topLeftY + autoH / 2;
                } else {
                  autoW = DOC_WIDTH + GROUP_PADDING * 2;
                  autoH = DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
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
                  autoH = DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
                  cx = pos.x;
                  cy = pos.y + TIMELINE_GAP;
                }
              }
              
              return {
                x: cx,
                y: cy,
                width: autoW,
                height: autoH
              };
            };
            
            const sourceCenter = getGroupCenter(sourceGroup);
            const targetCenter = getGroupCenter(targetGroup);
            if (!sourceCenter || !targetCenter) return null;

            const groupObstacles = groups
              .filter((group) => group.id !== sourceGroup.id && group.id !== targetGroup.id)
              .map((group) => getGroupCenter(group))
              .filter((bounds): bounds is GroupEdgeRect => bounds !== null)
              .map((bounds) => rectToObstacle(bounds));
            const pathD = computeClosestGroupEdgePath(sourceCenter, targetCenter, groupObstacles);
            
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
                  strokeLinejoin="round"
                />
                <path
                  d={pathD}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.75"
                  strokeDasharray={edge.edgeType === "related" ? "6,4" : undefined}
                  markerEnd={`url(#${markerId})`}
                />
              </g>
            );
          })}

          {/* Top-level workflow arrows, inferred from the visible major-group order. */}
          {zoom >= ZOOM_L1 && (() => {
            const getChildBounds = (childGroup: DocumentGroup) => {
              const childDocs = documents.filter((doc) => doc.groupId === childGroup.id);
              if (childDocs.length === 0) {
                const pos = groupPositions[childGroup.id];
                if (!pos) return null;
                return {
                  x: pos.x,
                  y: pos.y + TIMELINE_GAP,
                  width: DOC_WIDTH + GROUP_PADDING * 2,
                  height: DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
                };
              }

              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              childDocs.forEach((doc) => {
                const pos = docPositions[doc.id];
                if (!pos) return;
                minX = Math.min(minX, pos.x - DOC_WIDTH / 2);
                maxX = Math.max(maxX, pos.x + DOC_WIDTH / 2);
                minY = Math.min(minY, pos.y - DOC_HEIGHT / 2);
                maxY = Math.max(maxY, pos.y + DOC_HEIGHT / 2);
              });

              if (minX === Infinity) return null;
              const width = (maxX - minX) + GROUP_PADDING * 2;
              const height = (maxY - minY) + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
              const topLeftX = minX - GROUP_PADDING;
              const topLeftY = minY - GROUP_HEADER - GROUP_CONTENT_GAP;
              return {
                x: topLeftX + width / 2,
                y: topLeftY + height / 2,
                width,
                height,
              };
            };

            const getTopBounds = (group: DocumentGroup) => {
              const children = groups.filter((child) => child.parentId === group.id);
              const directDocs = documents.filter((doc) => doc.groupId === group.id);
              const items: GroupEdgeRect[] = [];

              children.forEach((child) => {
                const bounds = getChildBounds(child);
                if (bounds) items.push(bounds);
              });

              directDocs.forEach((doc) => {
                const pos = docPositions[doc.id];
                if (pos) {
                  items.push({ x: pos.x, y: pos.y, width: DOC_WIDTH, height: DOC_HEIGHT });
                }
              });

              if (items.length === 0) {
                const pos = groupPositions[group.id];
                if (!pos) return null;
                return {
                  x: pos.x,
                  y: pos.y + TIMELINE_GAP,
                  width: DOC_WIDTH + GROUP_PADDING * 2,
                  height: DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
                };
              }

              let minX = Infinity;
              let minY = Infinity;
              let maxX = -Infinity;
              let maxY = -Infinity;
              items.forEach((item) => {
                minX = Math.min(minX, item.x - item.width / 2);
                maxX = Math.max(maxX, item.x + item.width / 2);
                minY = Math.min(minY, item.y - item.height / 2);
                maxY = Math.max(maxY, item.y + item.height / 2);
              });

              const width = (maxX - minX) + GROUP_PADDING * 2;
              const height = (maxY - minY) + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
              const topLeftX = minX - GROUP_PADDING;
              const topLeftY = minY - GROUP_HEADER - GROUP_CONTENT_GAP;
              return {
                x: topLeftX + width / 2,
                y: topLeftY + height / 2,
                width,
                height,
              };
            };

            const topGroups = groups
              .filter((group) => group.parentId === null)
              .map((group) => ({ group, bounds: getTopBounds(group) }))
              .filter((item): item is { group: DocumentGroup; bounds: GroupEdgeRect } => item.bounds !== null)
              .sort((a, b) => {
                if (Math.abs(a.bounds.y - b.bounds.y) > 8) return a.bounds.y - b.bounds.y;
                return a.bounds.x - b.bounds.x;
              });

            return topGroups.slice(0, -1).map((item, index) => {
              const next = topGroups[index + 1];
              const groupObstacles = topGroups
                .filter((candidate) => candidate.group.id !== item.group.id && candidate.group.id !== next.group.id)
                .map((candidate) => rectToObstacle(candidate.bounds));
              const pathD = computeClosestGroupEdgePath(item.bounds, next.bounds, groupObstacles, 18, 26);

              return (
                <g key={`major-workflow-${item.group.id}-${next.group.id}`}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke="hsl(var(--background))"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeOpacity="0.75"
                    markerEnd="url(#arrow-group-flow)"
                  />
                </g>
              );
            });
          })()}
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
              groupPositions={groupPositions}
              x={pos.x}
              y={pos.y + TIMELINE_GAP}
              zoom={zoom}
              isSelected={selectedGroupId === group.id || selectedGroupIds.has(group.id)}
              isExpanded={true}
              isTopLevel={true}
              isSpacePressed={isSpacePressed}
              onSelect={handleGroupSelect}
              onToggleExpand={onToggleGroupExpand}
              onDragMove={handleGroupDragMove}
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
              groupPositions={groupPositions}
              x={pos.x}
              y={pos.y + TIMELINE_GAP}
              zoom={zoom}
              isSelected={selectedGroupId === group.id || selectedGroupIds.has(group.id)}
              isExpanded={false}
              isTopLevel={false}
              isSpacePressed={isSpacePressed}
              onSelect={handleGroupSelect}
              onToggleExpand={onToggleGroupExpand}
              onDragMove={handleGroupDragMove}
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

    </div>
  );
}
