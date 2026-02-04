import { Menu, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  documentTitle?: string;
  onMenuClick: () => void;
  nodeCount: number;
  edgeCount: number;
};

export function Header({ documentTitle, onMenuClick, nodeCount, edgeCount }: Props) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden"
          data-testid="button-menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="font-medium text-sm">
            {documentTitle || "No document selected"}
          </h2>
          {documentTitle && (
            <p className="text-xs text-muted-foreground">
              {nodeCount} nodes, {edgeCount} connections
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <div className="hidden sm:flex items-center gap-1 mr-2">
          <Button variant="ghost" size="icon" data-testid="button-zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-fit">
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
