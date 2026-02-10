import { useState, useEffect } from "react";
import { X, Flag, FlagOff, Save, Trash2, Lightbulb, FileText, HelpCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import type { Node } from "@shared/schema";

type Props = {
  node: Node;
  onClose: () => void;
  onUpdate: (id: number, updates: Partial<Node>) => void;
  onDelete: (id: number) => void;
  onToggleTag: (id: number, tagNote?: string) => void;
};

const nodeTypeOptions = [
  { value: "concept", label: "개념", icon: Lightbulb },
  { value: "claim", label: "주장", icon: FileText },
  { value: "evidence", label: "근거", icon: FileText },
  { value: "question", label: "질문", icon: HelpCircle },
];

export function NodeDetailPanel({ node, onClose, onUpdate, onDelete, onToggleTag }: Props) {
  const [label, setLabel] = useState(node.label);
  const [content, setContent] = useState(node.content);
  const [nodeType, setNodeType] = useState(node.nodeType);
  const [tagNote, setTagNote] = useState(node.tagNote || "");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setLabel(node.label);
    setContent(node.content);
    setNodeType(node.nodeType);
    setTagNote(node.tagNote || "");
    setHasChanges(false);
  }, [node]);

  useEffect(() => {
    const changed =
      label !== node.label ||
      content !== node.content ||
      nodeType !== node.nodeType ||
      tagNote !== (node.tagNote || "");
    setHasChanges(changed);
  }, [label, content, nodeType, tagNote, node]);

  const handleSave = () => {
    onUpdate(node.id, { label, content, nodeType, tagNote: tagNote || null });
    setHasChanges(false);
  };

  const handleToggleTag = () => {
    onToggleTag(node.id, node.isTagged ? undefined : tagNote);
  };

  return (
    <Card className="h-full flex flex-col border-0 rounded-none">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-sm">노드 상세</h3>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">라벨</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="노드 라벨..."
            data-testid="input-node-label"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">유형</label>
          <Select value={nodeType} onValueChange={setNodeType}>
            <SelectTrigger data-testid="select-node-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {nodeTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    <opt.icon className="h-3.5 w-3.5" />
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">내용</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="노드 내용..."
            rows={4}
            className="resize-none"
            data-testid="textarea-node-content"
          />
        </div>

        <div className="pt-2 border-t space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">검토 태그</span>
            <Badge
              variant={node.isTagged ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={handleToggleTag}
              data-testid="badge-tagged"
            >
              {node.isTagged ? (
                <>
                  <Flag className="h-3 w-3 mr-1" /> 태그됨
                </>
              ) : (
                <>
                  <FlagOff className="h-3 w-3 mr-1" /> 태그 없음
                </>
              )}
            </Badge>
          </div>

          {(node.isTagged || tagNote) && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">태그 메모</label>
              <Textarea
                value={tagNote}
                onChange={(e) => setTagNote(e.target.value)}
                placeholder="이 태그에 대한 메모 추가..."
                rows={2}
                className="resize-none text-sm"
                data-testid="textarea-tag-note"
              />
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t space-y-2">
        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!hasChanges}
          data-testid="button-save-node"
        >
          <Save className="h-4 w-4 mr-2" />
          변경사항 저장
        </Button>
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => onDelete(node.id)}
          data-testid="button-delete-node"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          노드 삭제
        </Button>
      </div>
    </Card>
  );
}
