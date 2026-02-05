import { useState } from "react";
import { FileText, Upload, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string) => void;
  isLoading: boolean;
};

export function DocumentInputModal({ isOpen, onClose, onSubmit, isLoading }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tab, setTab] = useState("paste");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSubmit(title.trim(), content.trim());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    setContent(text);
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setTitle("");
      setContent("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            문서를 로직 맵으로 변환
          </DialogTitle>
          <DialogDescription>
            텍스트를 붙여넣거나 문서를 업로드하세요. AI가 분석하여 개념과 관계의 인터랙티브 로직 맵을 만들어 드립니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">문서 제목</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="문서 제목을 입력하세요..."
              disabled={isLoading}
              data-testid="input-document-title"
            />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="paste" className="flex-1" data-testid="tab-paste">
                <FileText className="h-4 w-4 mr-2" />
                텍스트 붙여넣기
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex-1" data-testid="tab-upload">
                <Upload className="h-4 w-4 mr-2" />
                파일 업로드
              </TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-4">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="분석하고 싶은 연구 논문, 보고서 또는 텍스트를 붙여넣으세요...&#10;&#10;AI가 핵심 개념, 주장, 근거, 질문을 추출하고 이들의 관계를 시각화합니다."
                rows={10}
                className="resize-none"
                disabled={isLoading}
                data-testid="textarea-document-content"
              />
            </TabsContent>

            <TabsContent value="upload" className="mt-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept=".txt,.md,.text"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                  disabled={isLoading}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">클릭하여 텍스트 파일 업로드</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    .txt 및 .md 파일 지원
                  </p>
                </label>
                {content && tab === "upload" && (
                  <p className="text-sm text-primary mt-4">
                    파일 로드됨: {content.length.toLocaleString()}자
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
              data-testid="button-cancel"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !content.trim() || isLoading}
              data-testid="button-analyze"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  문서 분석
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
