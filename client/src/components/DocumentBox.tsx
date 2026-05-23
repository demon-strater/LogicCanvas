import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Calendar } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Document } from "@shared/schema";

type Props = {
  document: Document;
  x: number;
  y: number;
  zoom?: number;
  isSelected: boolean;
  isSpacePressed?: boolean;
  onSelect: (id: number, shiftKey?: boolean) => void;
  onClick: (id: number) => void;
  onDragMove?: (id: number, x: number, y: number) => void;
  onDragEnd: (id: number, x: number, y: number, prevX: number, prevY: number) => void;
};

export function DocumentBox({
  document,
  x,
  y,
  zoom = 1,
  isSelected,
  isSpacePressed = false,
  onSelect,
  onClick,
  onDragMove,
  onDragEnd,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const originalPosRef = useRef({ x, y });
  const [currentPos, setCurrentPos] = useState({ x, y });
  const boxRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    setCurrentPos({ x, y });
  }, [x, y]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getSummary = () => {
    if (document.summary) {
      return document.summary;
    }
    const content = document.content || "";
    const lines = content.split("\n").filter((line) => line.trim());
    return lines.slice(0, 3).join(" ").slice(0, 150) + (content.length > 150 ? "..." : "");
  };

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) return;
      if (e.button !== 0) return;
      if (isSpacePressed) return;
      
      e.preventDefault();
      e.stopPropagation();
      onSelect(document.id, e.shiftKey);
      setIsDragging(true);
      setHasDragged(false);
      originalPosRef.current = { x: currentPos.x, y: currentPos.y };
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    },
    [document.id, currentPos, onSelect, isSpacePressed]
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
      setHasDragged(true);
      onDragMove?.(document.id, newX, newY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (hasDragged) {
        onDragEnd(
          document.id, 
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
  }, [isDragging, hasDragged, document.id, currentPos, onDragEnd]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!hasDragged) {
        onClick(document.id);
      }
    },
    [hasDragged, document.id, onClick]
  );

  const isCompactZoom = zoom < 0.6;

  return (
    <div
      ref={boxRef}
      className={cn(
        "absolute w-[260px] h-auto p-3 rounded-md border-2 cursor-pointer transition-shadow",
        "bg-card hover:shadow-lg",
        isSelected
          ? "border-primary shadow-md"
          : "border-border/60 hover:border-primary/50",
        isDragging && "shadow-xl cursor-grabbing"
      )}
      style={{
        left: currentPos.x,
        top: currentPos.y,
        transform: "translate(-50%, -50%)",
        zIndex: isSelected || isDragging ? 10 : 3,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      data-testid={`document-box-${document.id}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
          <FileText className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-xs leading-tight" style={{ wordBreak: "keep-all", overflowWrap: "break-word", maxWidth: "50ch" }}>{document.title}</h3>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
            <Calendar className="h-2.5 w-2.5" />
            <span>{formatDate(document.createdAt)}</span>
          </div>
        </div>
      </div>

      {!isCompactZoom && (
        <p className="text-[10px] text-muted-foreground leading-relaxed overflow-hidden" style={{ wordBreak: "keep-all", overflowWrap: "break-word" }}>
          {getSummary()}
        </p>
      )}
    </div>
  );
}
