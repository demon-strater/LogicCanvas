import { useCallback, useEffect, useRef, useState } from "react";
import { Folder, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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

  const handleExpandClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(group.id);
    },
    [group.id, onToggleExpand]
  );

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
        zIndex: isSelected || isDragging ? 5 : 1,
        borderColor: isSelected ? groupColor : undefined,
        minWidth: isExpanded ? "360px" : "280px",
        minHeight: isExpanded ? "200px" : "auto",
      }}
      onMouseDown={handleMouseDown}
      data-testid={`group-box-${group.id}`}
    >
      <div
        className="flex items-center justify-between gap-2 p-3 rounded-t-md"
        style={{ backgroundColor: `${groupColor}20` }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            onClick={handleExpandClick}
            className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10"
            data-testid={`button-expand-group-${group.id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" style={{ color: groupColor }} />
            ) : (
              <ChevronRight className="h-4 w-4" style={{ color: groupColor }} />
            )}
          </button>
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

      {isExpanded && totalItems > 0 && (
        <div className="p-3 pt-2 border-t space-y-1">
          {childGroups.map((childGroup) => (
            <div
              key={`child-group-${childGroup.id}`}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs"
            >
              <Folder className="h-3 w-3" style={{ color: childGroup.color || groupColor }} />
              <span className="truncate">{childGroup.name}</span>
            </div>
          ))}
          {documents.map((doc) => (
            <div
              key={`doc-${doc.id}`}
              className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-xs"
            >
              <div className="w-2 h-2 rounded-full bg-primary/50" />
              <span className="truncate">{doc.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
