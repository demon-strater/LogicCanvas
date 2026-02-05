import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

import { DocumentsSidebar } from "@/components/DocumentsSidebar";
import { Header } from "@/components/Header";
import { GraphCanvas } from "@/components/GraphCanvas";
import { TaskPanel } from "@/components/TaskPanel";
import { NodeDetailPanel } from "@/components/NodeDetailPanel";
import { DocumentInputModal } from "@/components/DocumentInputModal";
import { AddTaskModal } from "@/components/AddTaskModal";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import type { Document, Node, Edge, Task } from "@shared/schema";

export default function Canvas() {
  const { toast } = useToast();
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const { data: documents = [], isLoading: isLoadingDocuments } = useQuery<Document[]>({
    queryKey: ["/api/documents"],
  });

  const { data: graphData, isLoading: isLoadingGraph } = useQuery<{ nodes: Node[]; edges: Edge[] }>({
    queryKey: ["/api/documents", selectedDocumentId, "graph"],
    enabled: selectedDocumentId !== null,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/documents", selectedDocumentId, "tasks"],
    enabled: selectedDocumentId !== null,
  });

  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  useEffect(() => {
    if (documents.length > 0 && !selectedDocumentId) {
      setSelectedDocumentId(documents[0].id);
    }
  }, [documents, selectedDocumentId]);

  const createDocumentMutation = useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const response = await apiRequest("POST", "/api/documents/parse", { title, content });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setSelectedDocumentId(data.id);
      setIsDocumentModalOpen(false);
      toast({ title: "문서 분석 완료", description: "로직 맵이 생성되었습니다." });
    },
    onError: () => {
      toast({ title: "오류", description: "문서 분석에 실패했습니다.", variant: "destructive" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      if (selectedDocumentId === deleteDocumentMutation.variables) {
        setSelectedDocumentId(null);
      }
      toast({ title: "문서가 삭제되었습니다" });
    },
  });

  const updateNodeMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Node> }) => {
      await apiRequest("PATCH", `/api/nodes/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocumentId, "graph"] });
    },
  });

  const deleteNodeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/nodes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocumentId, "graph"] });
      setSelectedNodeId(null);
      toast({ title: "노드가 삭제되었습니다" });
    },
  });

  const toggleNodeTagMutation = useMutation({
    mutationFn: async ({ id, tagNote }: { id: number; tagNote?: string }) => {
      await apiRequest("PATCH", `/api/nodes/${id}/toggle-tag`, { tagNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocumentId, "graph"] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async ({ title, description, priority }: { title: string; description: string; priority: string }) => {
      await apiRequest("POST", `/api/documents/${selectedDocumentId}/tasks`, {
        title,
        description,
        priority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocumentId, "tasks"] });
      setIsTaskModalOpen(false);
      toast({ title: "할 일이 생성되었습니다" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", selectedDocumentId, "tasks"] });
    },
  });

  const handleSelectNode = useCallback((id: number | null) => {
    setSelectedNodeId(id);
  }, []);

  const handleNodeDoubleClick = useCallback((id: number) => {
    setSelectedNodeId(id);
  }, []);

  const handleUpdateNodePosition = useCallback(
    (id: number, x: number, y: number) => {
      updateNodeMutation.mutate({ id, updates: { x, y } });
    },
    [updateNodeMutation]
  );

  const handleUpdateNode = useCallback(
    (id: number, updates: Partial<Node>) => {
      updateNodeMutation.mutate({ id, updates });
    },
    [updateNodeMutation]
  );

  const handleDeleteNode = useCallback(
    (id: number) => {
      deleteNodeMutation.mutate(id);
    },
    [deleteNodeMutation]
  );

  const handleToggleTag = useCallback(
    (id: number, tagNote?: string) => {
      toggleNodeTagMutation.mutate({ id, tagNote });
    },
    [toggleNodeTagMutation]
  );

  const handleGoToNode = useCallback((nodeId: number) => {
    setSelectedNodeId(nodeId);
  }, []);

  const selectedDocument = documents.find((d) => d.id === selectedDocumentId);

  return (
    <div className="h-screen flex overflow-hidden">
      <div className="hidden lg:block w-64 flex-shrink-0">
        <DocumentsSidebar
          documents={documents}
          selectedDocumentId={selectedDocumentId}
          onSelectDocument={setSelectedDocumentId}
          onNewDocument={() => setIsDocumentModalOpen(true)}
          onDeleteDocument={(id) => deleteDocumentMutation.mutate(id)}
        />
      </div>

      <Sheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <DocumentsSidebar
            documents={documents}
            selectedDocumentId={selectedDocumentId}
            onSelectDocument={(id) => {
              setSelectedDocumentId(id);
              setIsMobileSidebarOpen(false);
            }}
            onNewDocument={() => {
              setIsDocumentModalOpen(true);
              setIsMobileSidebarOpen(false);
            }}
            onDeleteDocument={(id) => {
              deleteDocumentMutation.mutate(id);
              setIsMobileSidebarOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          documentTitle={selectedDocument?.title}
          onMenuClick={() => setIsMobileSidebarOpen(true)}
          nodeCount={nodes.length}
          edgeCount={edges.length}
        />

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 relative">
            {isLoadingGraph && selectedDocumentId ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Skeleton className="w-20 h-20 rounded-full mx-auto mb-4" />
                  <Skeleton className="w-32 h-4 mx-auto mb-2" />
                  <Skeleton className="w-48 h-3 mx-auto" />
                </div>
              </div>
            ) : (
              <GraphCanvas
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={handleSelectNode}
                onNodeDoubleClick={handleNodeDoubleClick}
                onUpdateNodePosition={handleUpdateNodePosition}
              />
            )}
          </main>

          {selectedNode && (
            <aside className="w-80 border-l bg-card flex-shrink-0 hidden md:block">
              <NodeDetailPanel
                node={selectedNode}
                onClose={() => setSelectedNodeId(null)}
                onUpdate={handleUpdateNode}
                onDelete={handleDeleteNode}
                onToggleTag={handleToggleTag}
              />
            </aside>
          )}

          <aside className="w-72 border-l flex-shrink-0 hidden xl:block">
            <TaskPanel
              tasks={tasks}
              nodes={nodes}
              onAddTask={() => setIsTaskModalOpen(true)}
              onUpdateTask={(id, status) => updateTaskMutation.mutate({ id, status })}
              onGoToNode={handleGoToNode}
            />
          </aside>
        </div>
      </div>

      <DocumentInputModal
        isOpen={isDocumentModalOpen}
        onClose={() => setIsDocumentModalOpen(false)}
        onSubmit={(title, content) => createDocumentMutation.mutate({ title, content })}
        isLoading={createDocumentMutation.isPending}
      />

      <AddTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSubmit={(title, description, priority) =>
          createTaskMutation.mutate({ title, description, priority })
        }
        isLoading={createTaskMutation.isPending}
      />
    </div>
  );
}
