import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string, priority: string) => void;
  isLoading: boolean;
};

export function AddTaskModal({ isOpen, onClose, onSubmit, isLoading }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit(title.trim(), description.trim(), priority);
    setTitle("");
    setDescription("");
    setPriority("medium");
  };

  const handleClose = () => {
    if (!isLoading) {
      setTitle("");
      setDescription("");
      setPriority("medium");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            새 할 일 추가
          </DialogTitle>
          <DialogDescription>
            문서 분석과 관련된 작업을 추적하기 위한 할 일을 만드세요.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">할 일 제목</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="무엇을 해야 하나요?"
              disabled={isLoading}
              data-testid="input-task-title"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">설명 (선택)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="자세한 내용 추가..."
              rows={3}
              className="resize-none"
              disabled={isLoading}
              data-testid="textarea-task-description"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">우선순위</label>
            <Select value={priority} onValueChange={setPriority} disabled={isLoading}>
              <SelectTrigger data-testid="select-task-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">낮음</SelectItem>
                <SelectItem value="medium">보통</SelectItem>
                <SelectItem value="high">높음</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              data-testid="button-cancel-task"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isLoading}
              data-testid="button-create-task"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  할 일 생성
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
