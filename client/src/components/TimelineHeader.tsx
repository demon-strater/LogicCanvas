import { useMemo } from "react";

type Props = {
  startMonth: number;
  endMonth: number;
  year: number;
  canvasWidth: number;
  canvasHeight: number;
  monthWidth: number;
  offsetX: number;
  contentOffsetY?: number;
};

export function TimelineHeader({
  startMonth,
  endMonth,
  year,
  canvasWidth,
  canvasHeight,
  monthWidth,
  offsetX,
  contentOffsetY = 0,
}: Props) {
  const gridStartY = 0;
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

  const weekWidth = monthWidth / 4; // 4 weeks per month

  return (
    <>
      {/* Timeline header bar */}
      <div
        className="absolute left-0 flex border-b border-border bg-background/95 backdrop-blur-sm"
        style={{
          top: -50,
          width: canvasWidth,
          height: 50,
          zIndex: 100,
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

      {/* Vertical grid lines - SVG overlay */}
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: canvasWidth, height: canvasHeight, zIndex: 1 }}
      >
        {months.map((m, monthIndex) => {
          const monthX = offsetX + monthIndex * monthWidth;
          return (
            <g key={`grid-${m.year}-${m.month}`}>
              {/* Month start line - solid, more visible */}
              <line
                x1={monthX}
                y1={gridStartY}
                x2={monthX}
                y2={canvasHeight}
                stroke="hsl(var(--border))"
                strokeWidth="2"
                strokeOpacity="0.6"
              />
              {/* Week lines - dashed, more transparent */}
              {[1, 2, 3].map((week) => (
                <line
                  key={`week-${week}`}
                  x1={monthX + week * weekWidth}
                  y1={gridStartY}
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
        {/* Final month end line */}
        <line
          x1={offsetX + months.length * monthWidth}
          y1={gridStartY}
          x2={offsetX + months.length * monthWidth}
          y2={canvasHeight}
          stroke="hsl(var(--border))"
          strokeWidth="2"
          strokeOpacity="0.6"
        />
      </svg>
    </>
  );
}
