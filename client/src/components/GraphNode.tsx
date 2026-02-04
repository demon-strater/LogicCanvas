import { memo, useCallback, useState, useRef } from "react";
import { Flag, Lightbulb, HelpCircle, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Node } from "@shared/schema";

type Props = {
  node: Node;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDragStart: (id: number) => void;
  onDrag: (id: number, x: number, y: number) => void;
  onDragEnd: (id: number) => void;
  onDoubleClick: (id: number) => void;
};

const nodeTypeConfig = {
  concept: {
    icon: Lightbulb,
    bgClass: "bg-primary/10 dark:bg-primary/20",
    borderClass: "border-primary/40",
    iconClass: "text-primary",
  },
  claim: {
    icon: FileText,
    bgClass: "bg-accent/10 dark:bg-accent/20",
    borderClass: "border-accent/40",
    iconClass: "text-accent",
  },
  evidence: {
    icon: FileText,
    bgClass: "bg-chart-3/10 dark:bg-chart-3/20",
    borderClass: "border-chart-3/40",
    iconClass: "text-chart-3",
  },
  question: {
    icon: HelpCircle,
    bgClass: "bg-chart-5/10 dark:bg-chart-5/20",
    borderClass: "border-chart-5/40",
    iconClass: "text-chart-5",
  },
};

function GraphNodeComponent({
  node,
  x,
  y,
  isSelected,
  onSelect,
  onDragStart,
  onDrag,
  onDragEnd,
  onDoubleClick,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const config = nodeTypeConfig[node.nodeType as keyof typeof nodeTypeConfig] || nodeTypeConfig.concept;
  const Icon = config.icon;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      onSelect(node.id);
      onDragStart(node.id);

      const rect = (e.target as HTMLElement).closest(".graph-node")?.getBoundingClientRect();
      if (rect) {
        dragOffset.current = {
          x: e.clientX - rect.left - rect.width / 2,
          y: e.clientY - rect.top - rect.height / 2,
        };
      }

      const handleMouseMove = (e: MouseEvent) => {
        const canvas = document.getElementById("graph-canvas");
        if (!canvas) return;
        const canvasRect = canvas.getBoundingClientRect();
        const newX = e.clientX - canvasRect.left - dragOffset.current.x;
        const newY = e.clientY - canvasRect.top - dragOffset.current.y;
        onDrag(node.id, newX, newY);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        onDragEnd(node.id);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [node.id, onSelect, onDragStart, onDrag, onDragEnd]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDoubleClick(node.id);
    },
    [node.id, onDoubleClick]
  );

  return (
    <div
      className={cn(
        "graph-node absolute transform -translate-x-1/2 -translate-y-1/2",
        "rounded-lg border-2 shadow-sm transition-all duration-150",
        "cursor-grab active:cursor-grabbing",
        "min-w-[140px] max-w-[200px] p-3",
        config.bgClass,
        config.borderClass,
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isDragging && "opacity-90 scale-105"
      )}
      style={{
        left: x,
        top: y,
        zIndex: isDragging ? 1000 : isSelected ? 100 : 1,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      data-testid={`node-${node.id}`}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", config.iconClass)} />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm leading-tight truncate">
            {node.label}
          </div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {node.content}
          </div>
        </div>
        {node.isTagged && (
          <Flag className="h-3.5 w-3.5 text-chart-5 flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

export const GraphNode = memo(GraphNodeComponent);
