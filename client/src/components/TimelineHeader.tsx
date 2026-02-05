import { useMemo } from "react";

type Props = {
  startMonth: number;
  endMonth: number;
  year: number;
  canvasWidth: number;
  monthWidth: number;
  offsetX: number;
};

export function TimelineHeader({
  startMonth,
  endMonth,
  year,
  canvasWidth,
  monthWidth,
  offsetX,
}: Props) {
  const months = useMemo(() => {
    const result = [];
    for (let m = startMonth; m <= endMonth; m++) {
      const monthNum = ((m - 1) % 12) + 1;
      const yearOffset = Math.floor((m - 1) / 12);
      result.push({
        month: monthNum,
        year: year + yearOffset,
        label: `${monthNum}월`,
      });
    }
    return result;
  }, [startMonth, endMonth, year]);

  return (
    <div
      className="absolute top-0 left-0 flex border-b border-border bg-background/80 backdrop-blur-sm"
      style={{
        width: canvasWidth,
        height: 50,
        zIndex: 4,
        paddingLeft: offsetX,
      }}
    >
      {months.map((m, index) => (
        <div
          key={`${m.year}-${m.month}`}
          className="flex items-center justify-center border-r border-border/50 text-sm font-medium text-muted-foreground"
          style={{
            width: monthWidth,
            minWidth: monthWidth,
          }}
          data-testid={`timeline-month-${m.month}`}
        >
          <span className="px-2">
            {m.label}
            {index === 0 && (
              <span className="ml-1 text-xs text-muted-foreground/60">
                ({m.year})
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
