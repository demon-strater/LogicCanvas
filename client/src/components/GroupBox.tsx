import { useCallback, useEffect, useRef, useState } from "react";
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

type Props = {
  group: DocumentGroup;
  documents: Document[];
  childGroups: DocumentGroup[];
  x: number;
  y: number;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onDragEnd: (id: number, x: number, y: number, prevX: number, prevY: number) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export function GroupBox({
  group,
  documents,
  childGroups,
  x,
  y,
  isSelected,
  isExpanded,
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(group.id);
      setIsDragging(true);
      setHasDragged(false);
      originalPosRef.current = { x: currentPos.x, y: currentPos.y };
      dragStartRef.current = { x: e.clientX - currentPos.x, y: e.clientY - currentPos.y };
    },
    [group.id, currentPos, onSelect]
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
        left: currentPos.x,
        top: currentPos.y,
        transform: "translate(-50%, -50%)",
        zIndex: isSelected || isDragging ? 2 : 0,
        borderColor: isSelected ? groupColor : `${groupColor}60`,
        // Match server layout EXACTLY: DOC_WIDTH=280, DOC_GAP_X=80, GROUP_PADDING=50, GROUP_HEADER=70
        width: (() => {
          const DOC_WIDTH = 280;
          const DOC_GAP_X = 80;
          const GROUP_PADDING = 50;
          // Grid layout for docs - must match server's getDocGridLayout
          const docCount = documents.length;
          const cols = docCount <= 1 ? 1 : docCount <= 2 ? 2 : docCount <= 4 ? 2 : docCount <= 6 ? 3 : Math.ceil(Math.sqrt(docCount));
          const docWidth = docCount > 0 ? cols * (DOC_WIDTH + DOC_GAP_X) - DOC_GAP_X : 0;
          // Child groups width calculation matching server
          let maxChildWidth = 0;
          const childCount = childGroups.length;
          if (childCount > 0) {
            const childCols = childCount <= 1 ? 1 : childCount <= 2 ? 2 : childCount <= 4 ? 2 : childCount <= 6 ? 3 : Math.ceil(Math.sqrt(childCount));
            maxChildWidth = childCols * (380 + DOC_GAP_X);
          }
          // Server uses: contentWidth = Math.max(docWidth, maxChildWidth, 300); groupWidth = contentWidth + GROUP_PADDING * 2
          const contentWidth = Math.max(docWidth, maxChildWidth, 300);
          return contentWidth + GROUP_PADDING * 2;
        })(),
        height: (() => {
          const DOC_HEIGHT = 140;
          const DOC_GAP_Y = 60;
          const GROUP_HEADER = 70;
          const GROUP_PADDING = 50;
          // Grid layout for docs
          const docCount = documents.length;
          const cols = docCount <= 1 ? 1 : docCount <= 2 ? 2 : docCount <= 4 ? 2 : docCount <= 6 ? 3 : Math.ceil(Math.sqrt(docCount));
          const rows = docCount > 0 ? Math.ceil(docCount / cols) : 0;
          const docHeight = rows > 0 ? rows * (DOC_HEIGHT + DOC_GAP_Y) - DOC_GAP_Y : 0;
          // Child groups height - matching server: childRows * (300 + DOC_GAP_Y)
          const childCount = childGroups.length;
          let totalChildHeight = 0;
          if (childCount > 0) {
            const childCols = childCount <= 1 ? 1 : childCount <= 2 ? 2 : childCount <= 4 ? 2 : childCount <= 6 ? 3 : Math.ceil(Math.sqrt(childCount));
            const childRows = Math.ceil(childCount / childCols);
            totalChildHeight = 30 + childRows * (300 + DOC_GAP_Y);
          }
          // Server uses: contentHeight = docHeight + (children.length > 0 ? 30 + totalChildHeight : 0)
          // groupHeight = contentSize.height + GROUP_HEADER + GROUP_PADDING with Math.max(150, contentHeight)
          const contentHeight = Math.max(150, docHeight + totalChildHeight);
          return GROUP_HEADER + contentHeight + GROUP_PADDING;
        })(),
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
