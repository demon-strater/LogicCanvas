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
        "absolute w-[380px] h-auto p-5 rounded-md border-[3px] cursor-pointer transition-shadow",
        "text-foreground hover:shadow-xl",
        isSelected
          ? "border-primary shadow-xl ring-4 ring-primary/20"
          : "border-foreground/35 hover:border-primary/80 shadow-md",
        isDragging && "shadow-xl cursor-grabbing"
      )}
      style={{
        left: currentPos.x,
        top: currentPos.y,
        transform: "translate(-50%, -50%)",
        zIndex: isSelected || isDragging ? 10 : 3,
        backgroundColor: "hsl(var(--card))",
        color: "hsl(var(--card-foreground) / 0.92)",
        boxShadow: isSelected
          ? "0 0 0 2px hsl(var(--primary) / 0.22), 0 16px 34px hsl(var(--foreground) / 0.16)"
          : "0 0 0 1px hsl(var(--border) / 0.75), 0 10px 24px hsl(var(--foreground) / 0.12)",
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      data-testid={`document-box-${document.id}`}
    >
      <div className="flex items-start gap-3.5 mb-4">
        <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className="font-medium text-base leading-tight"
            style={{
              wordBreak: "keep-all",
              overflowWrap: "normal",
              maxWidth: "100%",
              minWidth: 0,
              whiteSpace: "normal",
              color: "hsl(var(--card-foreground) / 0.92)",
            }}
          >
            {document.title}
          </h3>
          <div className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
            <Calendar className="h-3 w-3" />
            <span>{formatDate(document.createdAt)}</span>
          </div>
        </div>
      </div>

      {!isCompactZoom && (
        <p
          className="text-sm leading-relaxed overflow-hidden"
          style={{
            wordBreak: "keep-all",
            overflowWrap: "normal",
            maxWidth: "100%",
            minWidth: 0,
            color: "hsl(var(--card-foreground) / 0.72)",
          }}
        >
          {getSummary()}
        </p>
      )}
    </div>
  );
}
