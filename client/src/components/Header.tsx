import { ThemeToggle } from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type Props = {
  documentCount: number;
  groupCount?: number;
  userId?: string;
  onClearCanvas?: () => void;
  isClearingCanvas?: boolean;
};

export function Header({
  documentCount,
  groupCount = 0,
  userId = "user",
  onClearCanvas,
  isClearingCanvas = false,
}: Props) {
  const initials = userId.slice(0, 2).toUpperCase();
  const hasCanvasContent = documentCount > 0 || groupCount > 0;

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center">
        <img
          src="/logo.png"
          alt="Logicmap"
          className="h-9 w-auto max-w-[180px] object-contain"
          data-testid="app-logo"
        />
      </div>

      <div className="flex items-center gap-3">
        {onClearCanvas && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClearCanvas}
            disabled={isClearingCanvas || !hasCanvasContent}
            data-testid="button-clear-canvas"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {isClearingCanvas ? "삭제 중..." : "전체삭제"}
          </Button>
        )}
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-md border bg-background/70 px-2.5 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initials}
          </div>
          <span className="max-w-32 truncate text-sm font-medium" data-testid="text-current-user-id">
            {userId}
          </span>
        </div>
      </div>
    </header>
  );
}
