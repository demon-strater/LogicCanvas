import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentGroup } from "@shared/schema";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string, parentId: number | null, color: string) => void;
  isLoading: boolean;
  groups: DocumentGroup[];
  editingGroup?: DocumentGroup | null;
};

const PRESET_COLORS = [
  "#6366f1", // Indigo
  "#8b5cf6", // Violet
  "#ec4899", // Pink
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#14b8a6", // Teal
  "#0ea5e9", // Sky
  "#6b7280", // Gray
];

export function GroupInputModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  groups,
  editingGroup,
}: Props) {
  const [name, setName] = useState(editingGroup?.name || "");
  const [description, setDescription] = useState(editingGroup?.description || "");
  const [parentId, setParentId] = useState<string>(
    editingGroup?.parentId?.toString() || ""
  );
  const [color, setColor] = useState(editingGroup?.color || PRESET_COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(
        name.trim(),
        description.trim(),
        parentId ? parseInt(parentId) : null,
        color
      );
      setName("");
      setDescription("");
      setParentId("");
      setColor(PRESET_COLORS[0]);
    }
  };

  const availableParents = groups.filter((g) => g.id !== editingGroup?.id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editingGroup ? "그룹 수정" : "새 그룹 만들기"}
          </DialogTitle>
          <DialogDescription>
            문서들을 묶을 그룹을 만듭니다. 그룹은 다른 그룹 안에 포함될 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">그룹 이름</Label>
            <Input
              id="group-name"
              placeholder="예: 연락망, 사업 초반"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-group-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-description">설명 (선택)</Label>
            <Textarea
              id="group-description"
              placeholder="이 그룹에 대한 간단한 설명"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              data-testid="input-group-description"
            />
          </div>

          <div className="space-y-2">
            <Label>상위 그룹 (선택)</Label>
            <Select value={parentId || "none"} onValueChange={(val) => setParentId(val === "none" ? "" : val)}>
              <SelectTrigger data-testid="select-parent-group">
                <SelectValue placeholder="상위 그룹 없음" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">없음 (최상위)</SelectItem>
                {availableParents.map((group) => (
                  <SelectItem key={group.id} value={group.id.toString()}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>그룹 색상</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    color === presetColor
                      ? "scale-110 border-foreground"
                      : "border-transparent hover:scale-105"
                  }`}
                  style={{ backgroundColor: presetColor }}
                  onClick={() => setColor(presetColor)}
                  data-testid={`color-${presetColor}`}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isLoading}
              data-testid="button-submit-group"
            >
              {isLoading ? "저장 중..." : editingGroup ? "수정" : "만들기"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
