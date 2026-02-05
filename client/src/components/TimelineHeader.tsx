import { useMemo } from "react";

type Props = {
  startMonth: number;
  endMonth: number;
  year: number;
  canvasWidth: number;
  canvasHeight: number;
  monthWidth: number;
  offsetX: number;
  zoom: number;
  panX: number;
};

export function TimelineHeader({
  startMonth,
  endMonth,
  year,
  canvasWidth,
  canvasHeight,
  monthWidth,
  offsetX,
  zoom,
  panX,
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

  const scaledMonthWidth = monthWidth * zoom;
  const scaledOffsetX = offsetX * zoom + panX;

  return (
    <div
      className="absolute top-0 left-0 right-0 h-12 border-b border-border bg-background/95 backdrop-blur-sm overflow-hidden"
      style={{ zIndex: 100 }}
    >
      <div
        className="flex h-full"
        style={{
          transform: `translateX(${scaledOffsetX}px)`,
        }}
      >
        {months.map((m, index) => (
          <div
            key={`${m.year}-${m.month}`}
            className="flex items-center justify-center border-r border-border/50 text-sm font-medium text-muted-foreground flex-shrink-0"
            style={{
              width: scaledMonthWidth,
              minWidth: scaledMonthWidth,
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
    </div>
  );
}

type GridLinesProps = {
  startMonth: number;
  endMonth: number;
  year: number;
  canvasWidth: number;
  canvasHeight: number;
  monthWidth: number;
  offsetX: number;
};

export function TimelineGridLines({
  startMonth,
  endMonth,
  year,
  canvasWidth,
  canvasHeight,
  monthWidth,
  offsetX,
}: GridLinesProps) {
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

  const weekWidth = monthWidth / 4;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: canvasWidth, height: canvasHeight, zIndex: 1 }}
    >
      {months.map((m, monthIndex) => {
        const monthX = offsetX + monthIndex * monthWidth;
        return (
          <g key={`grid-${m.year}-${m.month}`}>
            <line
              x1={monthX}
              y1={0}
              x2={monthX}
              y2={canvasHeight}
              stroke="hsl(var(--border))"
              strokeWidth="2"
              strokeOpacity="0.6"
            />
            {[1, 2, 3].map((week) => (
              <line
                key={`week-${week}`}
                x1={monthX + week * weekWidth}
                y1={0}
                x2={monthX + week * weekWidth}
                y2={canvasHeight}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                strokeOpacity="0.2"
                strokeDasharray="4,4"
              />
            ))}
          </g>
        );
      })}
      <line
        x1={offsetX + months.length * monthWidth}
        y1={0}
        x2={offsetX + months.length * monthWidth}
        y2={canvasHeight}
        stroke="hsl(var(--border))"
        strokeWidth="2"
        strokeOpacity="0.6"
      />
    </svg>
  );
}
