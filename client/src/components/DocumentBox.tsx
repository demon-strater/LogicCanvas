import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Document } from "@shared/schema";

type Props = {
  document: Document;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onClick: (id: number) => void;
  onDragEnd: (id: number, x: number, y: number, prevX: number, prevY: number) => void;
};

export function DocumentBox({
  document,
  x,
  y,
  isSelected,
  onSelect,
  onClick,
  onDragEnd,
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
      e.preventDefault();
      onSelect(document.id);
      setIsDragging(true);
      setHasDragged(false);
      originalPosRef.current = { x: currentPos.x, y: currentPos.y };
      dragStartRef.current = { x: e.clientX - currentPos.x, y: e.clientY - currentPos.y };
    },
    [document.id, currentPos, onSelect]
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

  return (
    <div
      ref={boxRef}
      className={cn(
        "absolute w-[280px] p-3 rounded-lg border-2 cursor-pointer transition-shadow",
        "bg-card hover:shadow-lg",
        isSelected
          ? "border-primary shadow-md"
          : "border-border hover:border-primary/50",
        isDragging && "shadow-xl cursor-grabbing"
      )}
      style={{
        left: currentPos.x,
        top: currentPos.y,
        transform: "translate(-50%, -50%)",
        zIndex: isSelected || isDragging ? 10 : 5,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      data-testid={`document-box-${document.id}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{document.title}</h3>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(document.createdAt)}</span>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
        {getSummary()}
      </p>

      <div className="mt-3 pt-3 border-t border-border">
        <span className="text-[10px] text-muted-foreground/70">
          클릭하여 전문 보기
        </span>
      </div>
    </div>
  );
}
