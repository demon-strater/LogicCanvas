import { ThemeToggle } from "./ThemeToggle";

type Props = {
  documentCount: number;
  groupCount?: number;
  userId?: string;
};

export function Header({ userId = "user" }: Props) {
  const initials = userId.slice(0, 2).toUpperCase();

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center">
        <img
          src="/logo.png"
          alt="Logicmap"
          className="h-9 w-auto max-w-[180px] object-contain"
          data-testid="app-logo"
        />
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
