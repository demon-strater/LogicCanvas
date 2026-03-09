import { useCallback, useRef, useState, useMemo } from "react";
import type { Document, DocumentGroup } from "@shared/schema";

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;
const MINIMAP_PADDING = 12;
const DOC_WIDTH = 260;
const DOC_HEIGHT = 130;
const GROUP_PADDING = 30;
const GROUP_HEADER = 100;

type Props = {
  documents: Document[];
  groups: DocumentGroup[];
  docPositions: Record<number, { x: number; y: number }>;
  groupPositions: Record<number, { x: number; y: number }>;
  allDocuments: Document[];
  zoom: number;
  pan: { x: number; y: number };
  viewportWidth: number;
  viewportHeight: number;
  onNavigate: (pan: { x: number; y: number }) => void;
};

export function Minimap({
  documents,
  groups,
  docPositions,
  groupPositions,
  allDocuments,
  zoom,
  pan,
  viewportWidth,
  viewportHeight,
  onNavigate,
}: Props) {
  const minimapRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const contentBounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    Object.values(docPositions).forEach(pos => {
      minX = Math.min(minX, pos.x - DOC_WIDTH / 2);
      maxX = Math.max(maxX, pos.x + DOC_WIDTH / 2);
      minY = Math.min(minY, pos.y - DOC_HEIGHT / 2);
      maxY = Math.max(maxY, pos.y + DOC_HEIGHT / 2);
    });

    groups.forEach(group => {
      const pos = groupPositions[group.id];
      if (!pos) return;

      const groupDocs = allDocuments.filter(d => d.groupId === group.id);
      const childGroups = groups.filter(g => g.parentId === group.id);

      if (groupDocs.length === 0 && childGroups.length === 0) {
        minX = Math.min(minX, pos.x - (DOC_WIDTH + GROUP_PADDING * 2) / 2);
        maxX = Math.max(maxX, pos.x + (DOC_WIDTH + GROUP_PADDING * 2) / 2);
        minY = Math.min(minY, pos.y - (DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING) / 2);
        maxY = Math.max(maxY, pos.y + (DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING) / 2);
      }
    });

    if (minX === Infinity) {
      return { minX: 0, minY: 0, maxX: 1200, maxY: 800, width: 1200, height: 800 };
    }

    const pad = 200;
    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
  }, [docPositions, groupPositions, groups, allDocuments]);

  const innerW = MINIMAP_WIDTH - MINIMAP_PADDING * 2;
  const innerH = MINIMAP_HEIGHT - MINIMAP_PADDING * 2;
  const scale = Math.min(innerW / contentBounds.width, innerH / contentBounds.height);

  const toMinimapX = (wx: number) => MINIMAP_PADDING + (wx - contentBounds.minX) * scale;
  const toMinimapY = (wy: number) => MINIMAP_PADDING + (wy - contentBounds.minY) * scale;

  const vpWorldLeft = -pan.x / zoom;
  const vpWorldTop = -pan.y / zoom;
  const vpWorldWidth = viewportWidth / zoom;
  const vpWorldHeight = viewportHeight / zoom;

  const vpX = toMinimapX(vpWorldLeft);
  const vpY = toMinimapY(vpWorldTop);
  const vpW = vpWorldWidth * scale;
  const vpH = vpWorldHeight * scale;

  const navigateToMinimapPoint = useCallback((clientX: number, clientY: number) => {
    const rect = minimapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    const worldX = (mx - MINIMAP_PADDING) / scale + contentBounds.minX;
    const worldY = (my - MINIMAP_PADDING) / scale + contentBounds.minY;

    const newPanX = -(worldX - viewportWidth / (2 * zoom)) * zoom;
    const newPanY = -(worldY - viewportHeight / (2 * zoom)) * zoom;

    onNavigate({ x: newPanX, y: newPanY });
  }, [scale, contentBounds, zoom, viewportWidth, viewportHeight, onNavigate]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    navigateToMinimapPoint(e.clientX, e.clientY);
  }, [navigateToMinimapPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    navigateToMinimapPoint(e.clientX, e.clientY);
  }, [isDragging, navigateToMinimapPoint]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const childGroupBounds = useMemo(() => {
    const result: Record<number, { x: number; y: number; w: number; h: number }> = {};
    groups.filter(g => g.parentId !== null).forEach(group => {
      const groupDocs = allDocuments.filter(d => d.groupId === group.id);
      if (groupDocs.length === 0) {
        const pos = groupPositions[group.id];
        if (pos) {
          result[group.id] = {
            x: pos.x, y: pos.y,
            w: DOC_WIDTH + GROUP_PADDING * 2,
            h: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING,
          };
        }
        return;
      }
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      groupDocs.forEach(doc => {
        const dp = docPositions[doc.id];
        if (dp) {
          gMinX = Math.min(gMinX, dp.x - DOC_WIDTH / 2);
          gMaxX = Math.max(gMaxX, dp.x + DOC_WIDTH / 2);
          gMinY = Math.min(gMinY, dp.y - DOC_HEIGHT / 2);
          gMaxY = Math.max(gMaxY, dp.y + DOC_HEIGHT / 2);
        }
      });
      if (gMinX !== Infinity) {
        const w = (gMaxX - gMinX) + GROUP_PADDING * 2;
        const h = (gMaxY - gMinY) + GROUP_HEADER + GROUP_PADDING;
        const topLeftX = gMinX - GROUP_PADDING;
        const topLeftY = gMinY - GROUP_HEADER;
        result[group.id] = {
          x: topLeftX + w / 2,
          y: topLeftY + h / 2,
          w, h,
        };
      }
    });
    return result;
  }, [groups, allDocuments, docPositions, groupPositions]);

  const topGroupBounds = useMemo(() => {
    const result: Record<number, { x: number; y: number; w: number; h: number }> = {};
    groups.filter(g => g.parentId === null).forEach(group => {
      const children = groups.filter(g => g.parentId === group.id);
      const allItems: { x: number; y: number; w: number; h: number }[] = [];
      children.forEach(child => {
        const cb = childGroupBounds[child.id];
        if (cb) allItems.push(cb);
      });
      if (allItems.length === 0) {
        const pos = groupPositions[group.id];
        if (pos) {
          result[group.id] = {
            x: pos.x, y: pos.y,
            w: DOC_WIDTH + GROUP_PADDING * 2,
            h: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING,
          };
        }
        return;
      }
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      allItems.forEach(item => {
        gMinX = Math.min(gMinX, item.x - item.w / 2);
        gMaxX = Math.max(gMaxX, item.x + item.w / 2);
        gMinY = Math.min(gMinY, item.y - item.h / 2);
        gMaxY = Math.max(gMaxY, item.y + item.h / 2);
      });
      const w = (gMaxX - gMinX) + GROUP_PADDING * 2;
      const h = (gMaxY - gMinY) + GROUP_HEADER + GROUP_PADDING;
      const topLeftX = gMinX - GROUP_PADDING;
      const topLeftY = gMinY - GROUP_HEADER;
      result[group.id] = {
        x: topLeftX + w / 2,
        y: topLeftY + h / 2,
        w, h,
      };
    });
    return result;
  }, [groups, childGroupBounds, groupPositions]);

  if (Object.keys(docPositions).length === 0 && groups.length === 0) return null;

  return (
    <div
      ref={minimapRef}
      className="absolute right-4 border rounded-lg bg-card/90 backdrop-blur-sm shadow-lg overflow-hidden select-none"
      style={{
        width: MINIMAP_WIDTH,
        height: MINIMAP_HEIGHT,
        bottom: 68,
        zIndex: 20,
        cursor: isDragging ? 'grabbing' : 'pointer',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      data-testid="canvas-minimap"
    >
      <svg width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT} className="absolute inset-0">
        {groups.filter(g => g.parentId === null).map(group => {
          const bounds = topGroupBounds[group.id];
          if (!bounds) return null;
          const rx = toMinimapX(bounds.x - bounds.w / 2);
          const ry = toMinimapY(bounds.y - bounds.h / 2);
          const rw = bounds.w * scale;
          const rh = bounds.h * scale;
          return (
            <rect
              key={`tg-${group.id}`}
              x={rx} y={ry} width={Math.max(2, rw)} height={Math.max(2, rh)}
              rx={1.5}
              fill={`${group.color || '#6366f1'}15`}
              stroke={`${group.color || '#6366f1'}40`}
              strokeWidth={0.5}
            />
          );
        })}

        {groups.filter(g => g.parentId !== null).map(group => {
          const bounds = childGroupBounds[group.id];
          if (!bounds) return null;
          const rx = toMinimapX(bounds.x - bounds.w / 2);
          const ry = toMinimapY(bounds.y - bounds.h / 2);
          const rw = bounds.w * scale;
          const rh = bounds.h * scale;
          return (
            <rect
              key={`cg-${group.id}`}
              x={rx} y={ry} width={Math.max(2, rw)} height={Math.max(2, rh)}
              rx={1}
              fill={`${group.color || '#6366f1'}25`}
              stroke={`${group.color || '#6366f1'}60`}
              strokeWidth={0.5}
            />
          );
        })}

        {Object.entries(docPositions).map(([id, pos]) => {
          const dx = toMinimapX(pos.x) - (DOC_WIDTH * scale) / 2;
          const dy = toMinimapY(pos.y) - (DOC_HEIGHT * scale) / 2;
          const dw = DOC_WIDTH * scale;
          const dh = DOC_HEIGHT * scale;
          return (
            <rect
              key={`doc-${id}`}
              x={dx} y={dy}
              width={Math.max(2, dw)} height={Math.max(1.5, dh)}
              rx={0.5}
              fill="hsl(var(--primary))"
              fillOpacity={0.5}
              stroke="hsl(var(--primary))"
              strokeOpacity={0.7}
              strokeWidth={0.3}
            />
          );
        })}

        <rect
          x={vpX} y={vpY}
          width={Math.max(4, vpW)} height={Math.max(4, vpH)}
          rx={1}
          fill="hsl(var(--primary) / 0.08)"
          stroke="hsl(var(--primary))"
          strokeWidth={1.2}
          strokeOpacity={0.8}
        />
      </svg>
    </div>
  );
}
