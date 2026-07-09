import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentGroup, Document } from "@shared/schema";

const DOC_WIDTH = 340;
const DOC_HEIGHT = 190;
const GROUP_PADDING = 24;
const GROUP_HEADER = 112;
const GROUP_CONTENT_GAP = 20;
const GROUP_RENDER_Y_OFFSET = 80;

function getStableTitleLayout(text: string, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const longestWordLength = Math.max(1, ...words.map((word) => word.length));
  const length = Math.max(1, text.length);
  const lines = Math.min(maxLines, Math.max(1, Math.ceil(length / 12)));
  return {
    lines,
    charsPerLine: Math.max(longestWordLength, Math.ceil(length / lines)),
  };
}

function estimateFittingFontSize(
  charsPerLine: number,
  lines: number,
  maxWidth: number,
  maxHeight: number,
) {
  const widthLimited = maxWidth / (charsPerLine * 0.95);
  const heightLimited = maxHeight / (lines * 1.16);
  return Math.min(widthLimited, heightLimited);
}

type Props = {
  group: DocumentGroup;
  documents: Document[];
  childGroups: DocumentGroup[];
  allDocuments: Document[];
  docPositions?: Record<number, { x: number; y: number }>;
  groupPositions?: Record<number, { x: number; y: number }>;
  x: number;
  y: number;
  zoom?: number;
  isSelected: boolean;
  isExpanded: boolean;
  isTopLevel?: boolean;
  isSpacePressed?: boolean;
  onSelect: (id: number, shiftKey?: boolean) => void;
  onToggleExpand: (id: number) => void;
  onDragMove?: (id: number, x: number, y: number, prevX: number, prevY: number) => void;
  onDragEnd: (id: number, x: number, y: number, prevX: number, prevY: number) => void;
  onResize?: (id: number, width: number, height: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function GroupBox({
  group,
  documents,
  childGroups,
  allDocuments,
  docPositions = {},
  groupPositions = {},
  x,
  y,
  zoom = 1,
  isSelected,
  isExpanded,
  isTopLevel = true,
  isSpacePressed = false,
  onSelect,
  onToggleExpand,
  onDragMove,
  onDragEnd,
  onResize,
  onEdit,
  onDelete,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const originalPosRef = useRef({ x, y });
  const [currentPos, setCurrentPos] = useState({ x, y });
  const boxRef = useRef<HTMLDivElement>(null);
  const hasDraggedRef = useRef(false);
  const currentPosRef = useRef({ x, y });

  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState<"r" | "b" | "rb" | null>(null);
  const resizeStartRef = useRef({
    mouseX: 0,
    mouseY: 0,
    width: 0,
    height: 0,
    centerX: 0,
    centerY: 0,
  });
  const [resizeSize, setResizeSize] = useState<{ w: number; h: number } | null>(null);
  const resizeSizeRef = useRef<{ w: number; h: number } | null>(null);
  const [resizeCenter, setResizeCenter] = useState<{ x: number; y: number } | null>(null);
  const resizeCenterRef = useRef<{ x: number; y: number } | null>(null);
  const hasLayoutContentRef = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    setCurrentPos({ x, y });
  }, [x, y]);

  const childGroupIds = useMemo(
    () => new Set((childGroups || []).map((child) => child.id)),
    [childGroups]
  );
  const reportCount = isTopLevel
    ? (allDocuments || []).filter((doc) => doc.groupId === group.id || (doc.groupId != null && childGroupIds.has(doc.groupId))).length
    : documents.length;

  const getDocPos = useCallback((doc: Document) => {
    const live = docPositions[doc.id];
    if (live) return live;
    return { x: doc.x ?? 0, y: doc.y ?? 0 };
  }, [docPositions]);

  const calculateChildGroupBounds = useCallback((childGroup: DocumentGroup) => {
    const childDocs = (allDocuments || []).filter(d => d.groupId === childGroup.id);
    const childLivePos = groupPositions[childGroup.id];
    const childBaseX = childLivePos?.x ?? childGroup.x ?? 0;
    const childBaseY = (childLivePos?.y ?? childGroup.y ?? 0) + GROUP_RENDER_Y_OFFSET;
    
    if (childDocs.length === 0) {
      const autoWidth = DOC_WIDTH + GROUP_PADDING * 2;
      const autoHeight = DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
      return { 
        centerX: childBaseX,
        centerY: childBaseY,
        width: autoWidth,
        height: autoHeight,
      };
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const doc of childDocs) {
      const pos = getDocPos(doc);
      minX = Math.min(minX, pos.x - DOC_WIDTH / 2);
      maxX = Math.max(maxX, pos.x + DOC_WIDTH / 2);
      minY = Math.min(minY, pos.y - DOC_HEIGHT / 2);
      maxY = Math.max(maxY, pos.y + DOC_HEIGHT / 2);
    }
    
    if (minX === Infinity) {
      const autoWidth = DOC_WIDTH + GROUP_PADDING * 2;
      const autoHeight = DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
      return {
        centerX: childBaseX,
        centerY: childBaseY,
        width: autoWidth,
        height: autoHeight,
      };
    }
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const width = Math.max(DOC_WIDTH + GROUP_PADDING * 2, contentWidth + GROUP_PADDING * 2);
    const height = Math.max(
      DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
      contentHeight + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
    );
    
    const topLeftX = minX - GROUP_PADDING;
    const topLeftY = minY - GROUP_HEADER - GROUP_CONTENT_GAP;
    const centerX = topLeftX + width / 2;
    const centerY = topLeftY + height / 2;
    
    return {
      centerX,
      centerY,
      width,
      height,
    };
  }, [allDocuments, getDocPos, groupPositions]);

  const { width: autoWidth, height: autoHeight, centerX: computedCenterX, centerY: computedCenterY } = useMemo(() => {
    const allItems: { x: number; y: number; w: number; h: number }[] = [];
    
    for (const doc of documents || []) {
      const pos = getDocPos(doc);
      allItems.push({ 
        x: pos.x, 
        y: pos.y, 
        w: DOC_WIDTH, 
        h: DOC_HEIGHT 
      });
    }
    
    for (const child of childGroups || []) {
      const childBounds = calculateChildGroupBounds(child);
      allItems.push({ 
        x: childBounds.centerX, 
        y: childBounds.centerY, 
        w: childBounds.width, 
        h: childBounds.height 
      });
    }
    
    if (allItems.length === 0) {
      return {
        width: DOC_WIDTH + GROUP_PADDING * 2,
        height: DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING,
        centerX: x,
        centerY: y,
      };
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of allItems) {
      minX = Math.min(minX, item.x - item.w / 2);
      maxX = Math.max(maxX, item.x + item.w / 2);
      minY = Math.min(minY, item.y - item.h / 2);
      maxY = Math.max(maxY, item.y + item.h / 2);
    }
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const width = contentWidth + GROUP_PADDING * 2;
    const height = contentHeight + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
    
    const topLeftX = minX - GROUP_PADDING;
    const topLeftY = minY - GROUP_HEADER - GROUP_CONTENT_GAP;
    const centerX = topLeftX + width / 2;
    const centerY = topLeftY + height / 2;
    
    const minWidth = DOC_WIDTH + GROUP_PADDING * 2;
    const minHeight = DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING;
    return { 
      width: Math.max(minWidth, width), 
      height: Math.max(minHeight, height),
      centerX,
      centerY
    };
  }, [documents, childGroups, calculateChildGroupBounds, getDocPos, x, y]);

  const groupWidth = resizeSize ? resizeSize.w : group.manualWidth ?? autoWidth;
  const groupHeight = resizeSize ? resizeSize.h : Math.max(group.manualHeight ?? autoHeight, autoHeight);

  useEffect(() => {
    if (isResizing || !resizeSize) return;

    const widthMatches = group.manualWidth === resizeSize.w || (group.manualWidth == null && resizeSize.w === autoWidth);
    const heightMatches = group.manualHeight === resizeSize.h || (group.manualHeight == null && resizeSize.h === autoHeight);

    if (widthMatches && heightMatches) {
      setResizeSize(null);
      resizeSizeRef.current = null;
      setResizeCenter(null);
      resizeCenterRef.current = null;
    }
  }, [autoHeight, autoWidth, group.manualHeight, group.manualWidth, isResizing, resizeSize]);
  
  const hasLayoutContent = (documents || []).length > 0 || (childGroups || []).length > 0;
  hasLayoutContentRef.current = hasLayoutContent;
  const baseCenterX = group.manualWidth != null ? x : hasLayoutContent ? computedCenterX : x;
  const baseCenterY = hasLayoutContent ? computedCenterY : y;
  const effectiveCenterX = group.manualWidth != null
    ? baseCenterX
    : hasLayoutContent
    ? baseCenterX + Math.max(0, groupWidth - autoWidth) / 2
    : baseCenterX;
  const effectiveCenterY = hasLayoutContent
    ? baseCenterY + Math.max(0, groupHeight - autoHeight) / 2
    : baseCenterY;

  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;
  const onDragMoveRef = useRef(onDragMove);
  onDragMoveRef.current = onDragMove;
  const groupIdRef = useRef(group.id);
  groupIdRef.current = group.id;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) return;
      if (e.button !== 0) return;
      if (isSpacePressed || isResizing) return;
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[role="menuitem"]') || target.closest('[data-radix-collection-item]') || target.closest('[data-resize-handle]')) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(group.id, e.shiftKey);
      setIsDragging(true);
      hasDraggedRef.current = false;
      setHasDragged(false);
      const startX = effectiveCenterX;
      const startY = effectiveCenterY;
      setCurrentPos({ x: startX, y: startY });
      currentPosRef.current = { x: startX, y: startY };
      originalPosRef.current = { x: startX, y: startY };
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [group.id, effectiveCenterX, effectiveCenterY, onSelect, isSpacePressed, isResizing]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const z = zoomRef.current;
      const dx = (e.clientX - dragStartRef.current.x) / z;
      const dy = (e.clientY - dragStartRef.current.y) / z;
      const newX = originalPosRef.current.x + dx;
      const newY = originalPosRef.current.y + dy;
      setCurrentPos({ x: newX, y: newY });
      currentPosRef.current = { x: newX, y: newY };
      hasDraggedRef.current = true;
      setHasDragged(true);
      onDragMoveRef.current?.(
        groupIdRef.current,
        newX,
        newY,
        originalPosRef.current.x,
        originalPosRef.current.y
      );
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (hasDraggedRef.current) {
        onDragEndRef.current(
          groupIdRef.current,
          currentPosRef.current.x,
          currentPosRef.current.y,
          originalPosRef.current.x,
          originalPosRef.current.y
        );
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const minW = Math.max(DOC_WIDTH + GROUP_PADDING * 2, autoWidth);
  const minH = Math.max(DOC_HEIGHT + GROUP_HEADER + GROUP_CONTENT_GAP + GROUP_PADDING, autoHeight);

  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const resizeDirRef = useRef<"r" | "b" | "rb" | null>(null);
  const minWRef = useRef(minW);
  minWRef.current = minW;
  const minHRef = useRef(minH);
  minHRef.current = minH;

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, dir: "r" | "b" | "rb") => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeDir(dir);
    resizeDirRef.current = dir;
    resizeStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: groupWidth,
      height: groupHeight,
      centerX: effectiveCenterX,
      centerY: effectiveCenterY,
    };
  }, [effectiveCenterX, effectiveCenterY, groupWidth, groupHeight]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const z = zoomRef.current;
      const dx = (e.clientX - resizeStartRef.current.mouseX) / z;
      const dy = (e.clientY - resizeStartRef.current.mouseY) / z;
      const dir = resizeDirRef.current;
      let newW = resizeStartRef.current.width;
      let newH = resizeStartRef.current.height;

      if (dir === "r" || dir === "rb") {
        newW = Math.max(minWRef.current, resizeStartRef.current.width + dx);
      }
      if (dir === "b" || dir === "rb") {
        newH = Math.max(minHRef.current, resizeStartRef.current.height + dy);
      }
      const rounded = { w: Math.round(newW), h: Math.round(newH) };
      const nextCenter = {
        x: resizeStartRef.current.centerX + (dir === "r" || dir === "rb" ? (rounded.w - resizeStartRef.current.width) / 2 : 0),
        y: resizeStartRef.current.centerY + (dir === "b" || dir === "rb" ? (rounded.h - resizeStartRef.current.height) / 2 : 0),
      };
      setResizeSize(rounded);
      resizeSizeRef.current = rounded;
      setResizeCenter(nextCenter);
      resizeCenterRef.current = nextCenter;
    };

    const handleMouseUp = () => {
      const dir = resizeDirRef.current;
      setIsResizing(false);
      setResizeDir(null);
      resizeDirRef.current = null;
      const size = resizeSizeRef.current;
      if (size && onResizeRef.current) {
        onResizeRef.current(groupIdRef.current, size.w, size.h);
        const dx = (dir === "r" || dir === "rb")
          ? (size.w - resizeStartRef.current.width) / 2
          : 0;
        const dy = (dir === "b" || dir === "rb")
          ? (size.h - resizeStartRef.current.height) / 2
          : 0;
        if (!hasLayoutContentRef.current) {
          onDragEndRef.current(
            groupIdRef.current,
            resizeStartRef.current.centerX + dx,
            resizeStartRef.current.centerY + dy,
            resizeStartRef.current.centerX,
            resizeStartRef.current.centerY,
          );
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const handleResetSize = useCallback(() => {
    if (onResize) {
      onResize(group.id, 0, 0);
    }
  }, [group.id, onResize]);

  const groupColor = group.color || "#6366f1";
  const hasManualSize = group.manualWidth != null || group.manualHeight != null;

  const isMidZoom = zoom >= 0.15 && zoom < 0.3;
  const isDocZoom = zoom >= 0.3 && zoom < 0.6;
  const isMajorOnlyView = isTopLevel && zoom < 0.1;
  const isChildOverview = !isTopLevel && zoom < 0.3;
  const isCenteredTitle = isMajorOnlyView || isChildOverview;

  const normalizedMajorZoom = Math.min(1, Math.max(0, (zoom - 0.03) / 0.12));
  const normalizedChildZoom = Math.min(1, Math.max(0, (zoom - 0.15) / 0.15));
  const centeredScreenTitleSize = isTopLevel
    ? 30 - normalizedMajorZoom * 10
    : 24 - normalizedChildZoom * 8;
  const centeredTitleLayout = getStableTitleLayout(group.name, isTopLevel ? 4 : 3);
  const centeredMaxWidth = Math.max(1, groupWidth - (isTopLevel ? 64 : 40));
  const centeredMaxHeight = Math.max(1, groupHeight - (isTopLevel ? 64 : 32));
  const centeredFitFontSize = estimateFittingFontSize(
      centeredTitleLayout.charsPerLine,
      centeredTitleLayout.lines,
      centeredMaxWidth,
      centeredMaxHeight
    );
  const centeredTitleFontSize = Math.max(
    10,
    Math.min(
      centeredScreenTitleSize / Math.max(zoom, 0.03),
      centeredFitFontSize,
      isTopLevel ? 360 : 160
    )
  );

  const titleFontSize = isTopLevel
    ? (isCenteredTitle ? centeredTitleFontSize : isMidZoom ? 48 : 44)
    : (isCenteredTitle ? centeredTitleFontSize : isDocZoom ? 40 : 36);

  const headerPadding = isCenteredTitle ? "p-0" : isTopLevel ? "px-6 py-4" : "px-4 py-3";
  const layerZIndex = isTopLevel ? 1 : 2;
  const headerMinHeight = isCenteredTitle ? undefined : isTopLevel ? 104 : 84;
  const countBadgeSize = isTopLevel ? 50 : 42;

  return (
    <div
      ref={boxRef}
      className={cn(
        "absolute rounded-lg cursor-pointer group/groupbox",
        isTopLevel ? "border-[5px]" : "border-[4px]",
        "backdrop-blur-sm",
        isSelected
          ? "shadow-2xl ring-4 ring-primary/25"
          : "shadow-md hover:shadow-xl",
        isDragging && "shadow-xl cursor-grabbing",
        isResizing && "cursor-nwse-resize"
      )}
      style={{
        left: isDragging ? currentPos.x : resizeCenter?.x ?? effectiveCenterX,
        top: isDragging ? currentPos.y : resizeCenter?.y ?? effectiveCenterY,
        transform: "translate(-50%, -50%)",
        transition: isDragging || isResizing ? 'box-shadow 0.2s' : 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), top 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), height 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), box-shadow 0.2s',
        zIndex: isDragging ? 20 : layerZIndex,
        borderColor: isSelected ? groupColor : `${groupColor}${isTopLevel ? 'B8' : 'D8'}`,
        backgroundColor: isTopLevel ? `${groupColor}0D` : `${groupColor}18`,
        boxShadow: isSelected
          ? `0 0 0 3px ${groupColor}30, 0 18px 45px hsl(var(--foreground) / 0.16)`
          : `0 0 0 1px ${groupColor}28, 0 12px 32px hsl(var(--foreground) / 0.10)`,
        width: groupWidth,
        height: groupHeight,
      }}
      onMouseDown={handleMouseDown}
      data-testid={`group-box-${group.id}`}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-1 rounded-t-md relative transition-all duration-200",
          isCenteredTitle ? "absolute inset-0" : "",
          headerPadding
        )}
        style={{
          backgroundColor: isCenteredTitle ? "transparent" : `${groupColor}${isTopLevel ? '20' : '25'}`,
          zIndex: 10,
          minHeight: headerMinHeight,
        }}
      >
        <div
          className={cn(
            "min-w-0",
            isCenteredTitle
              ? "absolute inset-0 flex items-center justify-center px-8 text-center"
              : "flex flex-1 items-center gap-3 overflow-hidden"
          )}
        >
          {!isCenteredTitle && (
            <span
              className="inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold leading-none"
              style={{
                width: countBadgeSize,
                height: countBadgeSize,
                backgroundColor: "hsl(var(--background) / 0.92)",
                border: `2px solid ${groupColor}70`,
                color: "hsl(var(--foreground) / 0.86)",
                fontSize: isTopLevel ? 24 : 19,
              }}
            >
              {reportCount}
            </span>
          )}
          <h3
            className={cn(
              "font-semibold leading-tight",
              isCenteredTitle ? "" : "min-w-0 flex-1"
            )}
            style={{
              wordBreak: "keep-all",
              overflowWrap: "normal",
              fontSize: titleFontSize,
              width: isCenteredTitle ? "auto" : undefined,
              maxWidth: isCenteredTitle ? centeredMaxWidth : undefined,
              minWidth: 0,
              whiteSpace: "normal",
              overflow: "hidden",
              textWrap: isCenteredTitle ? "balance" : undefined,
              transition: "font-size 0.2s ease",
              color: "hsl(var(--foreground) / 0.9)",
              textShadow: isCenteredTitle ? "0 1px 0 hsl(var(--background)), 0 8px 28px hsl(var(--background) / 0.65)" : undefined,
            }}
          >
            {group.name}
          </h3>
        </div>

        {!isCenteredTitle && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(group.id)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                수정
              </DropdownMenuItem>
              {hasManualSize && (
                <DropdownMenuItem onClick={handleResetSize}>
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  크기 자동으로
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => onDelete(group.id)}
                className="text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!isCenteredTitle && (
        <>
          <div
            data-resize-handle
            className="absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover/groupbox:opacity-100 transition-opacity"
            style={{ zIndex: 20 }}
            onMouseDown={(e) => handleResizeMouseDown(e, "r")}
            data-testid={`resize-right-${group.id}`}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full" style={{ backgroundColor: `${groupColor}60` }} />
          </div>

          <div
            data-resize-handle
            className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover/groupbox:opacity-100 transition-opacity"
            style={{ zIndex: 20 }}
            onMouseDown={(e) => handleResizeMouseDown(e, "b")}
            data-testid={`resize-bottom-${group.id}`}
          >
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full" style={{ backgroundColor: `${groupColor}60` }} />
          </div>

          <div
            data-resize-handle
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover/groupbox:opacity-100 transition-opacity"
            style={{ zIndex: 21 }}
            onMouseDown={(e) => handleResizeMouseDown(e, "rb")}
            data-testid={`resize-corner-${group.id}`}
          >
            <div className="absolute bottom-1 right-1 w-2 h-2 rounded-sm" style={{ backgroundColor: `${groupColor}80` }} />
          </div>
        </>
      )}
    </div>
  );
}
