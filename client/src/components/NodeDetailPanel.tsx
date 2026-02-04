import { useState, useEffect } from "react";
import { X, Flag, FlagOff, Save, Trash2, Lightbulb, FileText, HelpCircle } from "lucide-react";
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
  { value: "concept", label: "Concept", icon: Lightbulb },
  { value: "claim", label: "Claim", icon: FileText },
  { value: "evidence", label: "Evidence", icon: FileText },
  { value: "question", label: "Question", icon: HelpCircle },
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
        <h3 className="font-semibold text-sm">Node Details</h3>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-panel">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Label</label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Node label..."
            data-testid="input-node-label"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Type</label>
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
          <label className="text-xs font-medium text-muted-foreground">Content</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Node content..."
            rows={4}
            className="resize-none"
            data-testid="textarea-node-content"
          />
        </div>

        <div className="pt-2 border-t space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Tagged for Investigation</span>
            <Badge
              variant={node.isTagged ? "default" : "secondary"}
              className="cursor-pointer"
              onClick={handleToggleTag}
              data-testid="badge-tagged"
            >
              {node.isTagged ? (
                <>
                  <Flag className="h-3 w-3 mr-1" /> Tagged
                </>
              ) : (
                <>
                  <FlagOff className="h-3 w-3 mr-1" /> Not Tagged
                </>
              )}
            </Badge>
          </div>

          {(node.isTagged || tagNote) && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Tag Note</label>
              <Textarea
                value={tagNote}
                onChange={(e) => setTagNote(e.target.value)}
                placeholder="Add a note for this tag..."
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
          Save Changes
        </Button>
        <Button
          variant="ghost"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => onDelete(node.id)}
          data-testid="button-delete-node"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Node
        </Button>
      </div>
    </Card>
  );
}
