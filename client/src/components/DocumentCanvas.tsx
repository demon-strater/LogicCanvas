import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentBox } from "./DocumentBox";
import type { Document } from "@shared/schema";

type Props = {
  documents: Document[];
  selectedDocumentId: number | null;
  onSelectDocument: (id: number | null) => void;
  onClickDocument: (id: number) => void;
  onUpdateDocumentPosition: (id: number, x: number, y: number) => void;
};

export function DocumentCanvas({
  documents,
  selectedDocumentId,
  onSelectDocument,
  onClickDocument,
  onUpdateDocumentPosition,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateDimensions);
      observer.disconnect();
    };
  }, []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onSelectDocument(null);
      }
    },
    [onSelectDocument]
  );

  const getDocumentPosition = (doc: Document, index: number) => {
    if (doc.x && doc.y && (doc.x !== 100 || doc.y !== 100)) {
      return { x: doc.x, y: doc.y };
    }
    const cols = Math.max(1, Math.floor((dimensions.width - 100) / 320));
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      x: 180 + col * 320,
      y: 120 + row * 200,
    };
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-background overflow-auto"
      onClick={handleCanvasClick}
      data-testid="document-canvas"
    >
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {documents.map((doc, index) => {
        const pos = getDocumentPosition(doc, index);
        return (
          <DocumentBox
            key={doc.id}
            document={doc}
            x={pos.x}
            y={pos.y}
            isSelected={selectedDocumentId === doc.id}
            onSelect={onSelectDocument}
            onClick={onClickDocument}
            onDragEnd={onUpdateDocumentPosition}
          />
        );
      })}

      {documents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-muted-foreground max-w-md px-6">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-muted-foreground/60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">문서가 없습니다</h3>
            <p className="text-sm">
              새 문서 버튼을 클릭하여 첫 번째 문서를 추가하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
