import { FileText } from "@/lib/icons";
import { ThemeToggle } from "./ThemeToggle";

type Props = {
  documentCount: number;
  groupCount?: number;
  userId?: string;
};

export function Header({ documentCount, groupCount = 0, userId = "user" }: Props) {
  const initials = userId.slice(0, 2).toUpperCase();

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
          <FileText className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold">LogicCanvas</h1>
          <p className="text-xs text-muted-foreground">
            {documentCount > 0 || groupCount > 0 ? (
              <>
                문서 {documentCount}개
                {groupCount > 0 && <> · 그룹 {groupCount}개</>}
              </>
            ) : (
              "인지 지도 작성 도구"
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 rounded-md border bg-background/70 px-2.5 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initials}
          </div>
          <span className="max-w-32 truncate text-sm font-medium" data-testid="text-current-user-id">
            {userId}
          </span>
        </div>
      </div>
    </header>
  );
}
