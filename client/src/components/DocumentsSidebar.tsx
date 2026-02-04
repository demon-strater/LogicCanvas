import { Plus, FileText, Trash2, MoreVertical, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Document } from "@shared/schema";

type Props = {
  documents: Document[];
  selectedDocumentId: number | null;
  onSelectDocument: (id: number) => void;
  onNewDocument: () => void;
  onDeleteDocument: (id: number) => void;
};

export function DocumentsSidebar({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onNewDocument,
  onDeleteDocument,
}: Props) {
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Network className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">LogicCanvas</h1>
            <p className="text-[10px] text-muted-foreground">Cognitive Mapping</p>
          </div>
        </div>
        <Button
          className="w-full"
          onClick={onNewDocument}
          data-testid="button-new-document"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Document
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {documents.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No documents yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Create your first logic map
              </p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className={cn(
                  "group flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors",
                  "hover-elevate",
                  selectedDocumentId === doc.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground"
                )}
                onClick={() => onSelectDocument(doc.id)}
                data-testid={`document-${doc.id}`}
              >
                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{doc.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDate(doc.createdAt)}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`button-document-menu-${doc.id}`}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocument(doc.id);
                      }}
                      data-testid={`button-delete-document-${doc.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
