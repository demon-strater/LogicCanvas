import { useState, useRef, useEffect } from "react";
import { FileText, Upload, Loader2, Sparkles, Check, ExternalLink } from "@/lib/icons";
import { SiNotion } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

type NotionPage = {
  id: string;
  title: string;
  icon?: string;
  lastEditedTime: string;
};

type UploadedDocument = {
  title: string;
  content: string;
  createdAt?: string;
  fileName: string;
  fileKey: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, content: string, createdAt?: string) => void;
  onSubmitMany?: (documents: Array<{ title: string; content: string; createdAt?: string }>) => void;
  onNotionImport?: (pageIds: string[]) => void;
  isLoading: boolean;
  isNotionImporting?: boolean;
};

export function DocumentInputModal({ isOpen, onClose, onSubmit, onSubmitMany, onNotionImport, isLoading, isNotionImporting }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState("paste");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedDocuments, setUploadedDocuments] = useState<UploadedDocument[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [notionPages, setNotionPages] = useState<NotionPage[]>([]);
  const [selectedNotionPages, setSelectedNotionPages] = useState<Set<string>>(new Set());
  const [isLoadingNotionPages, setIsLoadingNotionPages] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "notion" && notionPages.length === 0 && !isLoadingNotionPages) {
      loadNotionPages();
    }
  }, [tab]);

  const loadNotionPages = async () => {
    setIsLoadingNotionPages(true);
    setNotionError(null);
    try {
      const response = await fetch("/api/notion/pages");
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "노션 페이지를 가져올 수 없습니다.");
      }
      const pages = await response.json();
      setNotionPages(pages);
    } catch (error: any) {
      setNotionError(error.message || "노션 연결에 실패했습니다.");
    } finally {
      setIsLoadingNotionPages(false);
    }
  };

  const toggleNotionPage = (pageId: string) => {
    setSelectedNotionPages(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }
      return next;
    });
  };

  const toggleAllNotionPages = () => {
    if (selectedNotionPages.size === notionPages.length) {
      setSelectedNotionPages(new Set());
    } else {
      setSelectedNotionPages(new Set(notionPages.map(p => p.id)));
    }
  };

  const handleNotionImport = () => {
    if (selectedNotionPages.size === 0 || !onNotionImport) return;
    onNotionImport(Array.from(selectedNotionPages));
  };

  const connectNotion = () => {
    window.location.href = "/api/notion/oauth/start";
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === "upload" && uploadedDocuments.length > 0) {
      const documents = uploadedDocuments.map(({ title, content, createdAt }) => ({ title, content, createdAt }));
      if (documents.length > 1 && onSubmitMany) {
        onSubmitMany(documents);
        return;
      }
      const document = documents[0];
      if (!document?.title.trim() || !document.content.trim()) return;
      onSubmit(document.title.trim(), document.content.trim(), document.createdAt);
      return;
    }
    if (!title.trim() || !content.trim()) return;
    onSubmit(title.trim(), content.trim(), reportDate ? new Date(reportDate).toISOString() : undefined);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    const existingDocuments = uploadedDocuments;
    try {
      const extractedDocuments: UploadedDocument[] = [];

      for (const file of files) {
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        const isTextFile = [".txt", ".md", ".text", ".csv"].includes(ext);
        const originalTitle = file.name.replace(/\.[^/.]+$/, "");
        const createdAt = new Date(file.lastModified).toISOString();

        if (isTextFile) {
          const text = await file.text();
          extractedDocuments.push({
            title: originalTitle,
            content: text,
            createdAt,
            fileName: file.name,
            fileKey: `${file.name}-${file.size}-${file.lastModified}`,
          });
          continue;
        }

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
          throw new Error(`${file.name}: ${errorMessage}`);
        }

        const data = await response.json();
        extractedDocuments.push({
          title: originalTitle,
          content: data.text,
          createdAt,
          fileName: file.name,
          fileKey: `${file.name}-${file.size}-${file.lastModified}`,
        });
      }

      const nextDocumentsByKey = new Map<string, UploadedDocument>();
      for (const document of existingDocuments) {
        nextDocumentsByKey.set(document.fileKey, document);
      }
      for (const document of extractedDocuments) {
        nextDocumentsByKey.set(document.fileKey, document);
      }
      const nextDocuments = Array.from(nextDocumentsByKey.values());
      const firstDocument = nextDocuments[0];
      setUploadedDocuments(nextDocuments);
      setUploadedFileName(nextDocuments.map((document) => document.fileName).join(", "));
      if (firstDocument && existingDocuments.length === 0) {
        setTitle(firstDocument.title);
        setContent(firstDocument.content);
        setReportDate(firstDocument.createdAt?.slice(0, 10) || new Date().toISOString().slice(0, 10));
      }
      const totalCharacters = nextDocuments.reduce((sum, document) => sum + document.content.length, 0);
      toast({
        title: "파일 업로드 완료",
        description: `${nextDocuments.length}개 문서에서 ${totalCharacters.toLocaleString()}자의 텍스트가 추출되었습니다.`,
      });
    } catch (error: any) {
      toast({
        title: "업로드 실패",
        description: error.message,
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
    if (!isLoading && !isUploading && !isNotionImporting) {
      setTitle("");
      setContent("");
      setReportDate(new Date().toISOString().slice(0, 10));
      setUploadedFileName("");
      setUploadedDocuments([]);
      setSelectedNotionPages(new Set());
      setNotionPages([]);
      setNotionError(null);
      onClose();
    }
  };

  const getFileFormatLabel = (fileName: string) => {
    const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    return FORMAT_LABELS[ext] || ext.toUpperCase().replace(".", "");
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
  };

  const busy = isLoading || isUploading || isNotionImporting;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-h-[85vh] flex flex-col ${content.length > 500 ? 'sm:max-w-4xl' : 'sm:max-w-2xl'}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            문서를 로직 맵으로 변환
          </DialogTitle>
          <DialogDescription>
            텍스트를 붙여넣거나, 파일을 업로드하거나, 노션에서 가져오세요. AI가 분석하여 개념과 관계의 인터랙티브 로직 맵을 만들어 드립니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab !== "notion" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">문서 제목</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문서 제목을 입력하세요..."
                  disabled={busy}
                  data-testid="input-document-title"
                />
                <label className="text-sm font-medium">작성일</label>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  disabled={busy}
                  data-testid="input-document-date"
                />
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="paste" className="flex-1" data-testid="tab-paste">
                  <FileText className="h-4 w-4 mr-2" />
                  텍스트
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex-1" data-testid="tab-upload">
                  <Upload className="h-4 w-4 mr-2" />
                  파일
                </TabsTrigger>
                <TabsTrigger value="notion" className="flex-1" data-testid="tab-notion">
                  <SiNotion className="h-4 w-4 mr-2" />
                  노션
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
                    multiple
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
                  {uploadedDocuments.length > 0 && tab === "upload" && uploadedFileName && !isUploading && (
                    <div className="mt-4 text-sm text-primary flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span>
                        {uploadedDocuments.length === 1
                          ? `${uploadedDocuments[0].fileName} (${getFileFormatLabel(uploadedDocuments[0].fileName)}) - ${uploadedDocuments[0].content.length.toLocaleString()}자 추출됨`
                          : `${uploadedDocuments.length}개 문서 선택됨 - ${uploadedDocuments.reduce((sum, document) => sum + document.content.length, 0).toLocaleString()}자 추출됨`}
                      </span>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="notion" className="mt-4">
                <div className="space-y-3">
                  {isLoadingNotionPages ? (
                    <div className="flex flex-col items-center py-8">
                      <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
                      <p className="text-sm text-muted-foreground">노션 페이지를 불러오는 중...</p>
                    </div>
                  ) : notionError ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-destructive mb-3">{notionError}</p>
                      <Button type="button" variant="default" size="sm" onClick={connectNotion} className="mr-2" data-testid="button-connect-notion">
                        Notion 연결하기
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={loadNotionPages} data-testid="button-retry-notion">
                        다시 시도
                      </Button>
                    </div>
                  ) : notionPages.length === 0 ? (
                    <div className="text-center py-8">
                      <SiNotion className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <Button type="button" variant="outline" size="sm" onClick={connectNotion} className="mb-3" data-testid="button-connect-notion-empty">
                        Notion 다시 연결하기
                      </Button>
                      <p className="text-sm text-muted-foreground">연결된 노션에 페이지가 없습니다.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="select-all-notion"
                            checked={notionPages.length > 0 && selectedNotionPages.size === notionPages.length}
                            onCheckedChange={toggleAllNotionPages}
                            disabled={busy}
                          />
                          <label
                            htmlFor="select-all-notion"
                            className="text-sm font-medium cursor-pointer select-none"
                          >
                            전체 선택 ({selectedNotionPages.size}/{notionPages.length})
                          </label>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={loadNotionPages}
                          disabled={busy}
                          data-testid="button-refresh-notion"
                        >
                          새로고침
                        </Button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
                        {notionPages.map((page) => (
                          <label
                            key={page.id}
                            className="flex items-center gap-3 p-3 hover-elevate cursor-pointer"
                            data-testid={`notion-page-${page.id}`}
                          >
                            <Checkbox
                              checked={selectedNotionPages.has(page.id)}
                              onCheckedChange={() => toggleNotionPage(page.id)}
                              disabled={busy}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {page.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                마지막 수정: {formatDate(page.lastEditedTime)}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
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
              {tab === "notion" ? (
                <Button
                  type="button"
                  onClick={handleNotionImport}
                  disabled={selectedNotionPages.size === 0 || busy}
                  data-testid="button-import-notion"
                >
                  {isNotionImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      가져오는 중...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {selectedNotionPages.size}개 가져오기
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={(tab === "upload" ? uploadedDocuments.length === 0 : !title.trim() || !content.trim()) || busy}
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
              )}
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
