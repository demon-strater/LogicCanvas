import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { Header } from "@/components/Header";
import { DocumentCanvas } from "@/components/DocumentCanvas";
import { DocumentInputModal } from "@/components/DocumentInputModal";
import { DocumentViewModal } from "@/components/DocumentViewModal";
import { GroupInputModal } from "@/components/GroupInputModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wand2, FolderPlus } from "lucide-react";

import type { Document, DocumentEdge, DocumentGroup, GroupEdge } from "@shared/schema";

type PositionHistoryItem = {
  id: number;
  type: "document" | "group";
  prevX: number;
  prevY: number;
};

export default function Canvas() {
  const { toast } = useToast();
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [viewingDocumentId, setViewingDocumentId] = useState<number | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<DocumentGroup | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const positionHistoryRef = useRef<PositionHistoryItem[]>([]);

  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: documentEdges = [] } = useQuery<DocumentEdge[]>({
    queryKey: ["/api/document-edges"],
  });

  const { data: groups = [] } = useQuery<DocumentGroup[]>({
    queryKey: ["/api/groups"],
  });

  const { data: groupEdges = [] } = useQuery<GroupEdge[]>({
    queryKey: ["/api/group-edges"],
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

  const createGroupMutation = useMutation({
    mutationFn: async ({ name, description, parentId, color }: { name: string; description: string; parentId: number | null; color: string }) => {
      const response = await apiRequest("POST", "/api/groups", { name, description, parentId, color });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setIsGroupModalOpen(false);
      setEditingGroup(null);
      toast({ title: "그룹이 생성되었습니다" });
    },
    onError: () => {
      toast({ title: "오류", description: "그룹 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<DocumentGroup> }) => {
      await apiRequest("PATCH", `/api/groups/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setIsGroupModalOpen(false);
      setEditingGroup(null);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "그룹이 삭제되었습니다" });
    },
  });

  const handleSelectDocument = useCallback((id: number | null) => {
    setSelectedDocumentId(id);
    if (id !== null) setSelectedGroupId(null);
  }, []);

  const handleSelectGroup = useCallback((id: number | null) => {
    setSelectedGroupId(id);
    if (id !== null) setSelectedDocumentId(null);
  }, []);

  const handleClickDocument = useCallback((id: number) => {
    setViewingDocumentId(id);
  }, []);

  const handleUpdateDocumentPosition = useCallback(
    (id: number, x: number, y: number, prevX?: number, prevY?: number) => {
      if (prevX !== undefined && prevY !== undefined) {
        positionHistoryRef.current.push({ id, type: "document", prevX, prevY });
        if (positionHistoryRef.current.length > 50) {
          positionHistoryRef.current.shift();
        }
      }
      updateDocumentMutation.mutate({ id, updates: { x, y } });
    },
    [updateDocumentMutation]
  );

  const handleUpdateGroupPosition = useCallback(
    (id: number, x: number, y: number, prevX?: number, prevY?: number) => {
      if (prevX !== undefined && prevY !== undefined) {
        positionHistoryRef.current.push({ id, type: "group", prevX, prevY });
        if (positionHistoryRef.current.length > 50) {
          positionHistoryRef.current.shift();
        }
      }
      updateGroupMutation.mutate({ id, updates: { x, y } });
    },
    [updateGroupMutation]
  );

  const handleToggleGroupExpand = useCallback((id: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleEditGroup = useCallback((id: number) => {
    const group = groups.find(g => g.id === id);
    if (group) {
      setEditingGroup(group);
      setIsGroupModalOpen(true);
    }
  }, [groups]);

  const handleDeleteGroup = useCallback((id: number) => {
    deleteGroupMutation.mutate(id);
  }, [deleteGroupMutation]);

  const handleGroupSubmit = useCallback((name: string, description: string, parentId: number | null, color: string) => {
    if (editingGroup) {
      updateGroupMutation.mutate({ id: editingGroup.id, updates: { name, description, parentId, color } });
    } else {
      createGroupMutation.mutate({ name, description, parentId, color });
    }
  }, [editingGroup, createGroupMutation, updateGroupMutation]);

  const handleUndo = useCallback(() => {
    const lastAction = positionHistoryRef.current.pop();
    if (lastAction) {
      if (lastAction.type === "document") {
        updateDocumentMutation.mutate({ 
          id: lastAction.id, 
          updates: { x: lastAction.prevX, y: lastAction.prevY } 
        });
      } else {
        updateGroupMutation.mutate({ 
          id: lastAction.id, 
          updates: { x: lastAction.prevX, y: lastAction.prevY } 
        });
      }
      toast({ title: "실행 취소됨" });
    }
  }, [updateDocumentMutation, updateGroupMutation, toast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo]);

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
            groups={groups}
            groupEdges={groupEdges}
            selectedDocumentId={selectedDocumentId}
            selectedGroupId={selectedGroupId}
            expandedGroups={expandedGroups}
            onSelectDocument={handleSelectDocument}
            onSelectGroup={handleSelectGroup}
            onToggleGroupExpand={handleToggleGroupExpand}
            onClickDocument={handleClickDocument}
            onUpdateDocumentPosition={handleUpdateDocumentPosition}
            onUpdateGroupPosition={handleUpdateGroupPosition}
            onEditGroup={handleEditGroup}
            onDeleteGroup={handleDeleteGroup}
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
            variant="outline"
            size="lg"
            className="shadow-lg bg-card"
            onClick={() => {
              setEditingGroup(null);
              setIsGroupModalOpen(true);
            }}
            data-testid="button-add-group"
          >
            <FolderPlus className="h-5 w-5 mr-2" />
            새 그룹
          </Button>
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

      <GroupInputModal
        isOpen={isGroupModalOpen}
        onClose={() => {
          setIsGroupModalOpen(false);
          setEditingGroup(null);
        }}
        onSubmit={handleGroupSubmit}
        isLoading={createGroupMutation.isPending || updateGroupMutation.isPending}
        groups={groups}
        editingGroup={editingGroup}
      />
    </div>
  );
}
