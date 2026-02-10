import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, FileText, Trash2, X, Pencil, Check, ImageIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { Document } from "@shared/schema";

type Props = {
  document: Document | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdateDate?: (id: number, date: string) => void;
};

export function DocumentViewModal({ document, isOpen, onClose, onDelete, onUpdateDate }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [editDate, setEditDate] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (isEditingDate) {
          setIsEditingDate(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, isEditingDate]);

  useEffect(() => {
    if (!isOpen) setIsEditingDate(false);
  }, [isOpen]);

  if (!document || !isOpen) return null;

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const toInputDate = (date: Date | string) => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const handleStartEditDate = () => {
    setEditDate(toInputDate(document.createdAt));
    setIsEditingDate(true);
  };

  const handleSaveDate = () => {
    if (editDate && onUpdateDate) {
      const newDate = new Date(editDate + "T12:00:00");
      onUpdateDate(document.id, newDate.toISOString());
    }
    setIsEditingDate(false);
  };

  const handleDelete = () => {
    if (confirm("이 문서를 삭제하시겠습니까?")) {
      onDelete(document.id);
      onClose();
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px]"
        style={{ top: "calc(3.5rem + 48px)", zIndex: 150 }}
        onClick={onClose}
        data-testid="document-view-backdrop"
      />

      <div
        ref={panelRef}
        className={cn(
          "fixed right-4 flex flex-col",
          "bg-card border rounded-lg shadow-2xl",
          "w-[520px] max-w-[calc(100vw-2rem)]",
          "animate-in slide-in-from-right-4 fade-in duration-200"
        )}
        style={{
          top: "calc(3.5rem + 48px + 12px)",
          bottom: 16,
          zIndex: 200,
        }}
        data-testid="document-view-panel"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b flex-shrink-0">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base leading-tight line-clamp-2">
                {document.title}
              </h2>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                <Calendar className="h-3 w-3" />
                {isEditingDate ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="bg-background border rounded px-1.5 py-0.5 text-xs text-foreground"
                      data-testid="input-edit-date"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveDate();
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={handleSaveDate}
                      data-testid="button-save-date"
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <span
                    className="flex items-center gap-1 cursor-pointer hover-elevate rounded px-1 -mx-1"
                    onClick={handleStartEditDate}
                    data-testid="button-edit-date"
                  >
                    {formatDate(document.createdAt)}
                    <Pencil className="h-2.5 w-2.5 opacity-50" />
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              data-testid="button-delete-document"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-document-view"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {document.summary && (
          <div className="mx-4 mt-3 bg-muted/50 rounded-md p-3 flex-shrink-0">
            <p className="text-xs font-medium mb-1 text-muted-foreground">요약</p>
            <p className="text-sm">{document.summary}</p>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-4">
          {document.images && document.images.length > 0 && (
            <div className="flex-shrink-0 mb-3">
              <p className="text-xs font-medium mb-2 text-muted-foreground flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                이미지 ({document.images.length})
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {document.images.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 rounded-md overflow-hidden border hover-elevate"
                    data-testid={`image-thumbnail-${idx}`}
                  >
                    <img
                      src={url}
                      alt={`이미지 ${idx + 1}`}
                      className="h-24 w-auto max-w-[200px] object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs font-medium mb-2 text-muted-foreground flex-shrink-0">원문</p>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90 pr-2 pb-4">
              {document.content}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
