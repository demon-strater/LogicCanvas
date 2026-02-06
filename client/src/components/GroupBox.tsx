import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Folder, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentGroup, Document } from "@shared/schema";

// Layout constants
const DOC_WIDTH = 260;
const DOC_HEIGHT = 130;
const GROUP_PADDING = 30;
const GROUP_HEADER = 100;

type Props = {
  group: DocumentGroup;
  documents: Document[];
  childGroups: DocumentGroup[];
  allDocuments: Document[];
  docPositions?: Record<number, { x: number; y: number }>;
  x: number;
  y: number;
  isSelected: boolean;
  isExpanded: boolean;
  isTopLevel?: boolean;
  isSpacePressed?: boolean;
  onSelect: (id: number, shiftKey?: boolean) => void;
  onToggleExpand: (id: number) => void;
  onDragEnd: (id: number, x: number, y: number, prevX: number, prevY: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function GroupBox({
  group,
  documents,
  childGroups,
  allDocuments,
  docPositions = {},
  x,
  y,
  isSelected,
  isExpanded,
  isTopLevel = true,
  isSpacePressed = false,
  onSelect,
  onToggleExpand,
  onDragEnd,
  onEdit,
  onDelete,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const originalPosRef = useRef({ x, y });
  const [currentPos, setCurrentPos] = useState({ x, y });
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentPos({ x, y });
  }, [x, y]);

  const totalItems = documents.length + childGroups.length;

  const getDocPos = useCallback((doc: Document) => {
    const live = docPositions[doc.id];
    if (live) return live;
    return { x: doc.x ?? 0, y: doc.y ?? 0 };
  }, [docPositions]);

  const calculateChildGroupBounds = useCallback((childGroup: DocumentGroup) => {
    const childDocs = (allDocuments || []).filter(d => d.groupId === childGroup.id);
    
    if (childDocs.length === 0) {
      return { 
        centerX: childGroup.x, 
        centerY: childGroup.y, 
        width: DOC_WIDTH + GROUP_PADDING * 2, 
        height: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING 
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
      return { centerX: childGroup.x, centerY: childGroup.y, width: DOC_WIDTH + GROUP_PADDING * 2, height: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING };
    }
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const width = Math.max(DOC_WIDTH + GROUP_PADDING * 2, contentWidth + GROUP_PADDING * 2);
    const height = Math.max(DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING, contentHeight + GROUP_HEADER + GROUP_PADDING);
    
    const topLeftX = minX - GROUP_PADDING;
    const topLeftY = minY - GROUP_HEADER;
    const centerX = topLeftX + width / 2;
    const centerY = topLeftY + height / 2;
    
    return { centerX, centerY, width, height };
  }, [allDocuments, getDocPos]);

  // Calculate bounding box and correct center from actual document and child group positions
  const { width: groupWidth, height: groupHeight, centerX: computedCenterX, centerY: computedCenterY } = useMemo(() => {
    // Get all items that should be contained in this group
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
    
    // Add child groups - calculate their bounds from their actual documents
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
      return { width: DOC_WIDTH + GROUP_PADDING * 2, height: DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING, centerX: x, centerY: y };
    }
    
    // Calculate bounding box of all items (items are positioned at CENTER)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of allItems) {
      minX = Math.min(minX, item.x - item.w / 2);
      maxX = Math.max(maxX, item.x + item.w / 2);
      minY = Math.min(minY, item.y - item.h / 2);
      maxY = Math.max(maxY, item.y + item.h / 2);
    }
    
    // Calculate content dimensions and derive group box
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const width = contentWidth + GROUP_PADDING * 2;
    const height = contentHeight + GROUP_HEADER + GROUP_PADDING;
    
    // Calculate center position: the group box should encompass all content
    // Top-left of content area is (minX - GROUP_PADDING, minY - GROUP_HEADER)
    const topLeftX = minX - GROUP_PADDING;
    const topLeftY = minY - GROUP_HEADER;
    const centerX = topLeftX + width / 2;
    const centerY = topLeftY + height / 2;
    
    const minWidth = DOC_WIDTH + GROUP_PADDING * 2;
    const minHeight = DOC_HEIGHT + GROUP_HEADER + GROUP_PADDING;
    return { 
      width: Math.max(minWidth, width), 
      height: Math.max(minHeight, height),
      centerX,
      centerY
    };
  }, [documents, childGroups, calculateChildGroupBounds, getDocPos, x, y]);
  
  // Use computed center if we have documents, otherwise use stored position
  const effectiveCenterX = (documents || []).length > 0 || (childGroups || []).length > 0 ? computedCenterX : x;
  const effectiveCenterY = (documents || []).length > 0 || (childGroups || []).length > 0 ? computedCenterY : y;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't start drag if spacebar is pressed (canvas is panning)
      if (isSpacePressed) return;
      // Don't start drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[role="menuitem"]') || target.closest('[data-radix-collection-item]')) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(group.id, e.shiftKey);
      setIsDragging(true);
      setHasDragged(false);
      // Use effective center (the actual displayed position) for drag start
      const startX = effectiveCenterX;
      const startY = effectiveCenterY;
      setCurrentPos({ x: startX, y: startY });
      originalPosRef.current = { x: startX, y: startY };
      dragStartRef.current = { x: e.clientX - startX, y: e.clientY - startY };
    },
    [group.id, effectiveCenterX, effectiveCenterY, onSelect, isSpacePressed]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newX = e.clientX - dragStartRef.current.x;
      const newY = e.clientY - dragStartRef.current.y;
      setCurrentPos({ x: newX, y: newY });
      setHasDragged(true);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (hasDragged) {
        onDragEnd(
          group.id,
          currentPos.x,
          currentPos.y,
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
  }, [isDragging, hasDragged, group.id, currentPos, onDragEnd]);

  const groupColor = group.color || "#6366f1";

  return (
    <div
      ref={boxRef}
      className={cn(
        "absolute rounded-lg border-2 cursor-pointer",
        "bg-card/80 backdrop-blur-sm hover:shadow-lg",
        isSelected
          ? "shadow-md"
          : "hover:border-primary/50",
        isDragging && "shadow-xl cursor-grabbing"
      )}
      style={{
        left: isDragging ? currentPos.x : effectiveCenterX,
        top: isDragging ? currentPos.y : effectiveCenterY,
        transform: "translate(-50%, -50%)",
        transition: isDragging ? 'box-shadow 0.2s' : 'left 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), top 0.3s cubic-bezier(0.25, 0.1, 0.25, 1), width 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), height 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), box-shadow 0.2s',
        zIndex: isSelected || isDragging ? 4 : (isTopLevel ? 1 : 2),
        // Top-level groups have more transparent borders (30%), child groups are more opaque (80%)
        borderColor: isSelected ? groupColor : `${groupColor}${isTopLevel ? '30' : '80'}`,
        backgroundColor: isTopLevel ? 'transparent' : undefined,
        width: groupWidth,
        height: groupHeight,
      }}
      onMouseDown={handleMouseDown}
      data-testid={`group-box-${group.id}`}
    >
      <div
        className="flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-t-md relative"
        style={{ backgroundColor: `${groupColor}${isTopLevel ? '20' : '25'}`, zIndex: 10 }}
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Folder className="h-3.5 w-3.5 flex-shrink-0" style={{ color: groupColor }} />
          <h3 className={cn(
            "font-semibold truncate",
            isTopLevel ? "text-sm" : "text-xs"
          )}>{group.name}</h3>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {totalItems}
          </span>
        </div>

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
            <DropdownMenuItem
              onClick={() => onDelete(group.id)}
              className="text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
