import { CheckCircle2, Circle, Clock, Flag, Plus, ArrowUpRight } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Task, Node } from "@shared/schema";

type Props = {
  tasks: Task[];
  nodes: Node[];
  onAddTask: () => void;
  onUpdateTask: (id: number, status: string) => void;
  onGoToNode: (nodeId: number) => void;
};

const statusConfig = {
  pending: { icon: Circle, label: "할 일", color: "text-muted-foreground" },
  in_progress: { icon: Clock, label: "진행 중", color: "text-chart-5" },
  completed: { icon: CheckCircle2, label: "완료", color: "text-chart-3" },
};

const priorityConfig = {
  low: { color: "bg-muted text-muted-foreground", label: "낮음" },
  medium: { color: "bg-primary/10 text-primary", label: "보통" },
  high: { color: "bg-destructive/10 text-destructive", label: "높음" },
};

export function TaskPanel({ tasks, nodes, onAddTask, onUpdateTask, onGoToNode }: Props) {
  const pendingTasks = tasks.filter((t) => t.status === "pending");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  const taggedNodes = nodes.filter((n) => n.isTagged);

  const cycleStatus = (task: Task) => {
    const order = ["pending", "in_progress", "completed"];
    const currentIndex = order.indexOf(task.status);
    const nextIndex = (currentIndex + 1) % order.length;
    onUpdateTask(task.id, order[nextIndex]);
  };

  const TaskItem = ({ task }: { task: Task }) => {
    const status = statusConfig[task.status as keyof typeof statusConfig] || statusConfig.pending;
    const priority = priorityConfig[task.priority as keyof typeof priorityConfig] || priorityConfig.medium;
    const StatusIcon = status.icon;

    return (
      <div
        className={cn(
          "group p-3 rounded-md border bg-card hover-elevate cursor-pointer transition-all",
          task.status === "completed" && "opacity-60"
        )}
        onClick={() => cycleStatus(task)}
        data-testid={`task-${task.id}`}
      >
        <div className="flex items-start gap-3">
          <StatusIcon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", status.color)} />
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "text-sm font-medium",
                task.status === "completed" && "line-through"
              )}
            >
              {task.title}
            </div>
            {task.description && (
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className={cn("text-[10px] h-5", priority.color)}>
                {priority.label}
              </Badge>
              {task.nodeId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGoToNode(task.nodeId!);
                  }}
                  data-testid={`button-goto-node-${task.nodeId}`}
                >
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  노드로 이동
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-sidebar">
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">할 일</h2>
          <Button size="sm" onClick={onAddTask} data-testid="button-add-task">
            <Plus className="h-4 w-4 mr-1" />
            추가
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {taggedNodes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Flag className="h-3 w-3" />
                검토 대상 ({taggedNodes.length})
              </h3>
              <div className="space-y-2">
                {taggedNodes.map((node) => (
                  <div
                    key={node.id}
                    className="p-3 rounded-md border border-chart-5/30 bg-chart-5/5 hover-elevate cursor-pointer"
                    onClick={() => onGoToNode(node.id)}
                    data-testid={`tagged-node-${node.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <Flag className="h-3.5 w-3.5 mt-0.5 text-chart-5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{node.label}</div>
                        {node.tagNote && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {node.tagNote}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inProgressTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                진행 중 ({inProgressTasks.length})
              </h3>
              <div className="space-y-2">
                {inProgressTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {pendingTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                할 일 ({pendingTasks.length})
              </h3>
              <div className="space-y-2">
                {pendingTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {completedTasks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                완료됨 ({completedTasks.length})
              </h3>
              <div className="space-y-2">
                {completedTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          )}

          {tasks.length === 0 && taggedNodes.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-muted/50 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm">할 일이 없습니다</p>
              <p className="text-xs mt-1">노드에 태그를 달거나 할 일을 추가하세요</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
