import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  documentCount: number;
  onNewDocument: () => void;
};

export function Header({ documentCount, onNewDocument }: Props) {
  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
          <FileText className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-sm">LogicCanvas</h1>
          <p className="text-xs text-muted-foreground">
            문서 {documentCount}개
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewDocument}
          className="hidden sm:flex"
          data-testid="button-header-new-document"
        >
          <Plus className="h-4 w-4 mr-1" />
          새 문서
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
