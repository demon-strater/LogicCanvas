import { useState, useRef } from "react";
import { FileText, Upload, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const ACCEPTED_EXTENSIONS = ".pdf,.docx,.xlsx,.xls,.csv,.pptx,.txt,.md,.text,.json,.html,.htm,.hwp,.hwpx";

const FORMAT_LABELS: Record<string, string> = {
  ".pdf": "PDF",
  ".docx": "Word",
  ".xlsx": "Excel",
  ".xls": "Excel",
  ".csv": "CSV",
  ".pptx": "PowerPoint",
  ".txt": "텍스트",
  ".md": "Markdown",
  ".json": "JSON",
  ".html": "HTML",
  ".hwp": "한글",
  ".hwpx": "한글",
};

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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    onSubmit(title.trim(), content.trim());
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const isTextFile = [".txt", ".md", ".text", ".csv"].includes(ext);

    if (isTextFile) {
      const text = await file.text();
      setContent(text);
      setUploadedFileName(file.name);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
      return;
    }

    setIsUploading(true);
    setUploadedFileName("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-file", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "파일 업로드 실패";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `서버 오류 (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setContent(data.text);
      setUploadedFileName(file.name);
      if (!title) {
        setTitle(data.suggestedTitle || file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (error) {
      toast({
        title: "파일 처리 실패",
        description: error instanceof Error ? error.message : "파일을 처리할 수 없습니다",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (!isLoading && !isUploading) {
      setTitle("");
      setContent("");
      setUploadedFileName("");
      onClose();
    }
  };

  const getFileFormatLabel = (fileName: string) => {
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    return FORMAT_LABELS[ext] || ext.toUpperCase().replace(".", "");
  };

  const busy = isLoading || isUploading;

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
              disabled={busy}
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
                disabled={busy}
                data-testid="textarea-document-content"
              />
            </TabsContent>

            <TabsContent value="upload" className="mt-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                  disabled={busy}
                  data-testid="input-file-upload"
                />
                {isUploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="h-10 w-10 text-primary mb-3 animate-spin" />
                    <p className="text-sm font-medium">파일 처리 중...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      텍스트를 추출하고 있습니다
                    </p>
                  </div>
                ) : (
                  <label
                    htmlFor="file-upload"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm font-medium">클릭하여 파일 업로드</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF, Word, Excel, PowerPoint, CSV, 텍스트 등 지원
                    </p>
                    <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                      {[".pdf", ".docx", ".xlsx", ".pptx", ".csv", ".txt", ".md", ".json", ".html"].map(ext => (
                        <span key={ext} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {ext}
                        </span>
                      ))}
                    </div>
                  </label>
                )}
                {content && tab === "upload" && uploadedFileName && !isUploading && (
                  <div className="mt-4 text-sm text-primary flex items-center justify-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>
                      {uploadedFileName} ({getFileFormatLabel(uploadedFileName)}) - {content.length.toLocaleString()}자 추출됨
                    </span>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={busy}
              data-testid="button-cancel"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !content.trim() || busy}
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
