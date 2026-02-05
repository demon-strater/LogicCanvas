import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Header } from "@/components/Header";
import { DocumentCanvas } from "@/components/DocumentCanvas";
import { DocumentInputModal } from "@/components/DocumentInputModal";
import { DocumentViewModal } from "@/components/DocumentViewModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wand2 } from "lucide-react";

import type { Document, DocumentEdge } from "@shared/schema";

export default function Canvas() {
  const { toast } = useToast();
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [viewingDocumentId, setViewingDocumentId] = useState<number | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);

  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: documentEdges = [] } = useQuery<DocumentEdge[]>({
    queryKey: ["/api/document-edges"],
  });

  const viewingDocument = documents.find((d) => d.id === viewingDocumentId) || null;

  const createDocumentMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const summary = content.split("\n").filter((line) => line.trim()).slice(0, 3).join(" ").slice(0, 200);
      const response = await apiRequest("POST", "/api/documents/parse", { title, content, summary });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setIsDocumentModalOpen(false);
      toast({ title: "문서가 추가되었습니다" });
    },
    onError: () => {
      toast({ title: "오류", description: "문서 추가에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
      setViewingDocumentId(null);
      toast({ title: "문서가 삭제되었습니다" });
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Document> }) => {
      await apiRequest("PATCH", `/api/documents/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
  });

  const analyzeWorkflowMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/analyze-workflow");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
      toast({ 
        title: "워크플로우 분석 완료", 
        description: data.summary || "문서들이 자동으로 정렬되었습니다" 
      });
    },
    onError: () => {
      toast({ title: "오류", description: "워크플로우 분석에 실패했습니다.", variant: "destructive" });
    },
  });

  const handleSelectDocument = useCallback((id: number | null) => {
    setSelectedDocumentId(id);
  }, []);

  const handleClickDocument = useCallback((id: number) => {
    setViewingDocumentId(id);
  }, []);

  const handleUpdateDocumentPosition = useCallback(
    (id: number, x: number, y: number) => {
      updateDocumentMutation.mutate({ id, updates: { x, y } });
    },
    [updateDocumentMutation]
  );

  const handleDeleteDocument = useCallback(
    (id: number) => {
      deleteDocumentMutation.mutate(id);
    },
    [deleteDocumentMutation]
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        documentCount={documents.length}
        onNewDocument={() => setIsDocumentModalOpen(true)}
      />

      <div className="flex-1 relative">
        {isLoadingDocuments ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Skeleton className="w-20 h-20 rounded-full mx-auto mb-4" />
              <Skeleton className="w-32 h-4 mx-auto mb-2" />
              <Skeleton className="w-48 h-3 mx-auto" />
            </div>
          </div>
        ) : (
          <DocumentCanvas
            documents={documents}
            edges={documentEdges}
            selectedDocumentId={selectedDocumentId}
            onSelectDocument={handleSelectDocument}
            onClickDocument={handleClickDocument}
            onUpdateDocumentPosition={handleUpdateDocumentPosition}
          />
        )}

        <div className="fixed bottom-6 right-6 flex flex-col gap-3">
          {documents.length >= 2 && (
            <Button
              variant="outline"
              size="lg"
              className="shadow-lg bg-card"
              onClick={() => analyzeWorkflowMutation.mutate()}
              disabled={analyzeWorkflowMutation.isPending}
              data-testid="button-analyze-workflow"
            >
              <Wand2 className="h-5 w-5 mr-2" />
              {analyzeWorkflowMutation.isPending ? "분석 중..." : "자동 정렬"}
            </Button>
          )}
          <Button
            size="lg"
            className="shadow-lg"
            onClick={() => setIsDocumentModalOpen(true)}
            data-testid="button-add-document"
          >
            <Plus className="h-5 w-5 mr-2" />
            새 문서
          </Button>
        </div>
      </div>

      <DocumentInputModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        onSubmit={(title, content) => createDocumentMutation.mutate({ title, content })}
        isLoading={createDocumentMutation.isPending}
      />

      <DocumentViewModal
        document={viewingDocument}
        isOpen={viewingDocumentId !== null}
        onClose={() => setViewingDocumentId(null)}
        onDelete={handleDeleteDocument}
      />
    </div>
  );
}
