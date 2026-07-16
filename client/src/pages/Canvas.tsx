import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { cn } from "@/lib/utils";
import { Header } from "@/components/Header";
import { DocumentCanvas } from "@/components/DocumentCanvas";
import { DocumentInputModal } from "@/components/DocumentInputModal";
import { DocumentViewModal } from "@/components/DocumentViewModal";
import { GroupInputModal } from "@/components/GroupInputModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Wand2, FolderPlus, FileText, LayoutGrid, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const autoWorkflowAnalysisKeyRef = useRef<string>("");

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

  const requestAutoRelayout = useCallback(() => {
    window.setTimeout(async () => {
      try {
        await apiRequest("POST", "/api/relayout");
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      } catch (error) {
        console.error("Auto relayout failed:", error);
      }
    }, 300);
  }, []);

  const requestAIWorkflowGrouping = useCallback(() => {
    window.setTimeout(async () => {
      try {
        await apiRequest("POST", "/api/analyze-workflow");
        queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
        queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
        queryClient.invalidateQueries({ queryKey: ["/api/group-edges"] });
      } catch (error) {
        console.error("Auto workflow analysis failed:", error);
        requestAutoRelayout();
      }
    }, 300);
  }, [requestAutoRelayout]);

  useEffect(() => {
    if (documents.length < 2) return;

    const onlyFallbackGrouping = groups.length <= 1;

    if (!onlyFallbackGrouping) return;

    const analysisKey = documents.map((doc) => doc.id).sort((a, b) => a - b).join(",");
    if (autoWorkflowAnalysisKeyRef.current === analysisKey) return;

    autoWorkflowAnalysisKeyRef.current = analysisKey;
    requestAIWorkflowGrouping();
  }, [documents, groups, requestAIWorkflowGrouping]);

  const createDocumentMutation = useMutation({
    mutationFn: async ({ title, content, createdAt }: { title: string; content: string; createdAt?: string }) => {
      const summary = content.split("\n").filter((line) => line.trim()).slice(0, 3).join(" ").slice(0, 200);
      const response = await apiRequest("POST", "/api/documents/parse", { title, content, summary, createdAt });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      setIsDocumentModalOpen(false);
      requestAIWorkflowGrouping();
      toast({ title: "문서가 추가되었습니다" });
    },
    onError: () => {
      toast({ title: "오류", description: "문서 추가에 실패했습니다.", variant: "destructive" });
    },
  });

  const importNotionMutation = useMutation({
    mutationFn: async (pageIds: string[]) => {
      const response = await apiRequest("POST", "/api/notion/import", { pageIds });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-edges"] });
      setIsDocumentModalOpen(false);
      if (data.imported > 0) {
        requestAIWorkflowGrouping();
      } else {
        requestAutoRelayout();
      }
      toast({ title: `${data.imported}개의 노션 페이지를 가져왔습니다` });
    },
    onError: () => {
      toast({ title: "오류", description: "노션에서 가져오기에 실패했습니다.", variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-edges"] });
      const groupCount = data.groups?.length || 0;
      toast({ 
        title: "워크플로우 분석 완료", 
        description: `${data.summary || "문서들이 자동으로 정렬되었습니다"} (${groupCount}개 그룹 생성)` 
      });
    },
    onError: () => {
      toast({ title: "오류", description: "워크플로우 분석에 실패했습니다.", variant: "destructive" });
    },
  });

  const relayoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/relayout");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      toast({ 
        title: "재정렬 완료", 
        description: data.message || "그룹과 문서가 컴팩트하게 재정렬되었습니다" 
      });
    },
    onError: () => {
      toast({ title: "오류", description: "재정렬에 실패했습니다.", variant: "destructive" });
    },
  });

  const { data: syncStatus = {
    enabled: false,
    lastSyncTime: null,
    isSyncing: false,
    lastSyncResult: null,
  } } = useQuery<{
    enabled: boolean;
    lastSyncTime: string | null;
    isSyncing: boolean;
    lastSyncResult: { imported: number; skipped: number; errors: number } | null;
  }>({
    queryKey: ["/api/notion/sync-status"],
    refetchInterval: 30000,
  });

  const syncNotionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notion/sync");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-edges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notion/sync-status"] });
      if (data.imported > 0) requestAIWorkflowGrouping();
      else requestAutoRelayout();
      if (data.imported > 0) {
        toast({ title: `노션 동기화 완료: ${data.imported}개 새 문서 가져옴` });
      } else {
        toast({ title: "노션 동기화 완료: 새 문서 없음" });
      }
    },
    onError: () => {
      toast({ title: "오류", description: "노션 동기화에 실패했습니다.", variant: "destructive" });
    },
  });

  const deduplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/documents/deduplicate");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      if (data.deletedCount > 0) {
        toast({ title: `중복 문서 ${data.deletedCount}개를 정리했습니다` });
      } else {
        toast({ title: "중복 문서가 없습니다" });
      }
    },
    onError: () => {
      toast({ title: "오류", description: "중복 제거에 실패했습니다.", variant: "destructive" });
    },
  });

  const clearCanvasMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/canvas");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/document-edges"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/group-edges"] });
      setSelectedDocumentId(null);
      setSelectedGroupId(null);
      setViewingDocumentId(null);
      setExpandedGroups(new Set());
      positionHistoryRef.current = [];
      autoWorkflowAnalysisKeyRef.current = "";
      toast({
        title: "?? ???? ????? ??????",
        description: `??? ${data.deletedDocuments || 0}?, ???? ${data.deletedGroups || 0}?? ???????.`,
      });
    },
    onError: () => {
      toast({ title: "?? ??", description: "?? ?? ? ??? ??????.", variant: "destructive" });
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
      requestAutoRelayout();
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
      updateDocumentMutation.mutate({ id, updates: { x: Math.round(x), y: Math.round(y) } });
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
      updateGroupMutation.mutate({ id, updates: { x: Math.round(x), y: Math.round(y) } });
    },
    [updateGroupMutation]
  );

  const handleResizeGroup = useCallback(
    (id: number, width: number, height: number) => {
      if (width === 0 && height === 0) {
        updateGroupMutation.mutate({ id, updates: { manualWidth: null, manualHeight: null } });
      } else {
        updateGroupMutation.mutate({ id, updates: { manualWidth: Math.round(width), manualHeight: Math.round(height) } });
      }
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

  const handleClearCanvas = useCallback(() => {
    if (documents.length === 0 && groups.length === 0) return;
    const confirmed = window.confirm("?? ???? ????? ????????? ? ??? ??? ? ????.");
    if (!confirmed) return;
    clearCanvasMutation.mutate();
  }, [clearCanvasMutation, documents.length, groups.length]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header
        documentCount={documents.length}
        groupCount={groups.length}
        onClearCanvas={handleClearCanvas}
        isClearingCanvas={clearCanvasMutation.isPending}
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
            onResizeGroup={handleResizeGroup}
            onEditGroup={handleEditGroup}
            onDeleteGroup={handleDeleteGroup}
            viewingDocumentId={viewingDocumentId}
          />
        )}

        <div className="fixed bottom-4 right-4 flex items-center gap-2 z-30">
          {(documents.length >= 1 || (groups || []).length >= 1) && (
            <Button
              variant="outline"
              size="sm"
              className="shadow-lg bg-card/90 backdrop-blur-sm"
              onClick={() => relayoutMutation.mutate()}
              disabled={relayoutMutation.isPending}
              data-testid="button-relayout"
            >
              <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />
              {relayoutMutation.isPending ? "정렬 중..." : "재정렬"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="icon"
                className="h-12 w-12 rounded-full shadow-lg"
                data-testid="button-add-menu"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setEditingGroup(null);
                  setIsGroupModalOpen(true);
                }}
                data-testid="menu-add-group"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                그룹 추가
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsDocumentModalOpen(true)}
                data-testid="menu-add-document"
              >
                <FileText className="h-4 w-4 mr-2" />
                보고서 추가
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <DocumentInputModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        onSubmit={(title, content, createdAt) => createDocumentMutation.mutate({ title, content, createdAt })}
        onNotionImport={(pageIds) => importNotionMutation.mutate(pageIds)}
        isLoading={createDocumentMutation.isPending}
        isNotionImporting={importNotionMutation.isPending}
      />

      <DocumentViewModal
        document={viewingDocument}
        isOpen={viewingDocumentId !== null}
        onClose={() => setViewingDocumentId(null)}
        onDelete={handleDeleteDocument}
        onUpdateDate={(id, date) => {
          updateDocumentMutation.mutate({ id, updates: { createdAt: date } as any });
        }}
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
