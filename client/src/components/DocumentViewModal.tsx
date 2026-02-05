import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, FileText, Trash2, X } from "lucide-react";
import type { Document } from "@shared/schema";

type Props = {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
};

export function DocumentViewModal({ document, isOpen, onClose, onDelete }: Props) {
  if (!document) return null;

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleDelete = () => {
    if (confirm("이 문서를 삭제하시겠습니까?")) {
      onDelete(document.id);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-semibold truncate">
                  {document.title}
                </DialogTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(document.createdAt)}</span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              data-testid="button-delete-document"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {document.summary && (
          <div className="bg-muted/50 rounded-md p-3 flex-shrink-0">
            <p className="text-sm font-medium mb-1">요약</p>
            <p className="text-sm text-muted-foreground">{document.summary}</p>
          </div>
        )}

        <ScrollArea className="flex-1 mt-4">
          <div className="pr-4">
            <p className="text-sm font-medium mb-2">전문</p>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {document.content}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
