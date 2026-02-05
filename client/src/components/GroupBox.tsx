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

// Layout constants - must match server exactly
const DOC_WIDTH = 280;
const DOC_HEIGHT = 140;
const GROUP_PADDING = 50;
const GROUP_HEADER = 70;

type Props = {
  group: DocumentGroup;
  documents: Document[];
  childGroups: DocumentGroup[];
  allDocuments: Document[]; // All documents to find child group docs
  x: number;
  y: number;
  isSelected: boolean;
  isExpanded: boolean;
  isTopLevel?: boolean; // true for parent groups, false for child groups
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

  // Helper function to calculate child group bounds from its actual documents
  const calculateChildGroupBounds = useCallback((childGroup: DocumentGroup) => {
    const childDocs = (allDocuments || []).filter(d => d.groupId === childGroup.id);
    
    if (childDocs.length === 0) {
      // Empty child group - use stored position with default size
      return { 
        centerX: childGroup.x, 
        centerY: childGroup.y, 
        width: 350, 
        height: 200 
      };
    }
    
    // Calculate bounds from actual document positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const doc of childDocs) {
      if (doc.x !== null && doc.y !== null) {
        minX = Math.min(minX, doc.x - DOC_WIDTH / 2);
        maxX = Math.max(maxX, doc.x + DOC_WIDTH / 2);
        minY = Math.min(minY, doc.y - DOC_HEIGHT / 2);
        maxY = Math.max(maxY, doc.y + DOC_HEIGHT / 2);
      }
    }
    
    if (minX === Infinity) {
      return { centerX: childGroup.x, centerY: childGroup.y, width: 350, height: 200 };
    }
    
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const width = Math.max(350, contentWidth + GROUP_PADDING * 2);
    const height = Math.max(200, contentHeight + GROUP_HEADER + GROUP_PADDING);
    
    // Calculate center from content bounds
    const topLeftX = minX - GROUP_PADDING;
    const topLeftY = minY - GROUP_HEADER;
    const centerX = topLeftX + width / 2;
    const centerY = topLeftY + height / 2;
    
    return { centerX, centerY, width, height };
  }, [allDocuments]);

  // Calculate bounding box and correct center from actual document and child group positions
  const { width: groupWidth, height: groupHeight, centerX: computedCenterX, centerY: computedCenterY } = useMemo(() => {
    // Get all items that should be contained in this group
    const allItems: { x: number; y: number; w: number; h: number }[] = [];
    
    // Add direct documents
    for (const doc of documents || []) {
      if (doc.x !== null && doc.y !== null) {
        allItems.push({ 
          x: doc.x, 
          y: doc.y, 
          w: DOC_WIDTH, 
          h: DOC_HEIGHT 
        });
      }
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
      // Empty group - use stored position
      return { width: 400, height: 220, centerX: x, centerY: y };
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
    
    return { 
      width: Math.max(400, width), 
      height: Math.max(220, height),
      centerX,
      centerY
    };
  }, [documents, childGroups, calculateChildGroupBounds, x, y]);
  
  // Use computed center if we have documents, otherwise use stored position
  const effectiveCenterX = (documents || []).length > 0 || (childGroups || []).length > 0 ? computedCenterX : x;
  const effectiveCenterY = (documents || []).length > 0 || (childGroups || []).length > 0 ? computedCenterY : y;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Don't start drag if spacebar is pressed (canvas is panning)
      if (isSpacePressed) return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(group.id, e.shiftKey);
      setIsDragging(true);
      setHasDragged(false);
      originalPosRef.current = { x: currentPos.x, y: currentPos.y };
      dragStartRef.current = { x: e.clientX - currentPos.x, y: e.clientY - currentPos.y };
    },
    [group.id, currentPos, onSelect, isSpacePressed]
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
        "absolute rounded-lg border-2 cursor-pointer transition-shadow",
        "bg-card/80 backdrop-blur-sm hover:shadow-lg",
        isSelected
          ? "shadow-md"
          : "hover:border-primary/50",
        isDragging && "shadow-xl cursor-grabbing"
      )}
      style={{
        // Use computed center from documents when not dragging, otherwise use drag position
        left: isDragging ? currentPos.x : effectiveCenterX,
        top: isDragging ? currentPos.y : effectiveCenterY,
        transform: "translate(-50%, -50%)",
        zIndex: isSelected || isDragging ? 2 : 0,
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
        className="flex items-center justify-between gap-2 p-3 rounded-t-md"
        style={{ backgroundColor: `${groupColor}20` }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${groupColor}30` }}
          >
            <Folder className="h-4 w-4" style={{ color: groupColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{group.name}</h3>
            <span className="text-xs text-muted-foreground">
              {totalItems}개 항목
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(group.id)}>
              <Pencil className="h-4 w-4 mr-2" />
              수정
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(group.id)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {group.description && (
        <p className="text-xs text-muted-foreground px-3 py-2 border-t">
          {group.description}
        </p>
      )}
    </div>
  );
}
