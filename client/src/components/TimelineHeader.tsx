import { useMemo } from "react";
import { FileText } from "lucide-react";

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
  activeDate?: Date | string | null;
  activeDocTitle?: string | null;
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
  activeDate,
  activeDocTitle,
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

  const activeDateMarker = useMemo(() => {
    if (!activeDate) return null;
    const d = new Date(activeDate);
    const docMonth = d.getMonth() + 1;
    const docYear = d.getFullYear();
    const docDay = d.getDate();
    const daysInMonth = new Date(docYear, docMonth, 0).getDate();
    const dayFraction = (docDay - 1) / daysInMonth;

    const monthIndex = months.findIndex(
      (m) => m.month === docMonth && m.year === docYear
    );
    if (monthIndex === -1) return null;

    const x = scaledOffsetX + monthIndex * scaledMonthWidth + dayFraction * scaledMonthWidth;
    const dateLabel = `${docMonth}월 ${docDay}일`;

    return { x, dateLabel };
  }, [activeDate, months, scaledMonthWidth, scaledOffsetX]);

  return (
    <div
      className="absolute top-0 left-0 right-0 h-12 border-b border-border bg-background/95 backdrop-blur-sm overflow-hidden"
      style={{ zIndex: 20 }}
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

      {activeDateMarker && (
        <div
          className="absolute top-0 h-full flex flex-col items-center pointer-events-none"
          style={{ left: activeDateMarker.x, zIndex: 10 }}
        >
          <div className="absolute -top-0.5 -translate-x-1/2 flex flex-col items-center">
            <div className="flex items-center gap-1 bg-primary text-primary-foreground px-2.5 py-1 rounded-b-md text-[11px] font-medium shadow-lg whitespace-nowrap">
              <FileText className="h-3 w-3" />
              <span>{activeDateMarker.dateLabel}</span>
              {activeDocTitle && (
                <>
                  <span className="opacity-50">|</span>
                  <span className="max-w-[150px] truncate opacity-80">{activeDocTitle}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type GridLinesProps = {
  startMonth: number;
  endMonth: number;
  year: number;
  monthWidth: number;
  offsetX: number;
  zoom: number;
  panX: number;
  viewportHeight: number;
  activeDate?: Date | string | null;
};

export function TimelineGridLines({
  startMonth,
  endMonth,
  year,
  monthWidth,
  offsetX,
  zoom,
  panX,
  viewportHeight,
  activeDate,
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

  const scaledMonthWidth = monthWidth * zoom;
  const scaledOffsetX = offsetX * zoom + panX;
  const weekWidth = scaledMonthWidth / 4;

  const activeDateX = useMemo(() => {
    if (!activeDate) return null;
    const d = new Date(activeDate);
    const docMonth = d.getMonth() + 1;
    const docYear = d.getFullYear();
    const docDay = d.getDate();
    const daysInMonth = new Date(docYear, docMonth, 0).getDate();
    const dayFraction = (docDay - 1) / daysInMonth;
    const monthIndex = months.findIndex(
      (m) => m.month === docMonth && m.year === docYear
    );
    if (monthIndex === -1) return null;
    return scaledOffsetX + monthIndex * scaledMonthWidth + dayFraction * scaledMonthWidth;
  }, [activeDate, months, scaledMonthWidth, scaledOffsetX]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ 
        top: 48,
        left: 0,
        width: "100%", 
        height: viewportHeight - 48,
        zIndex: 0 
      }}
    >
      {months.map((m, monthIndex) => {
        const monthX = scaledOffsetX + monthIndex * scaledMonthWidth;
        return (
          <g key={`grid-${m.year}-${m.month}`}>
            <line
              x1={monthX}
              y1={0}
              x2={monthX}
              y2={viewportHeight}
              stroke="hsl(var(--border))"
              strokeWidth="2"
              strokeOpacity="0.5"
            />
            {[1, 2, 3].map((week) => (
              <line
                key={`week-${week}`}
                x1={monthX + week * weekWidth}
                y1={0}
                x2={monthX + week * weekWidth}
                y2={viewportHeight}
                stroke="hsl(var(--border))"
                strokeWidth="1"
                strokeOpacity="0.15"
                strokeDasharray="6,6"
              />
            ))}
          </g>
        );
      })}
      <line
        x1={scaledOffsetX + months.length * scaledMonthWidth}
        y1={0}
        x2={scaledOffsetX + months.length * scaledMonthWidth}
        y2={viewportHeight}
        stroke="hsl(var(--border))"
        strokeWidth="2"
        strokeOpacity="0.5"
      />
      {activeDateX !== null && (
        <g>
          <line
            x1={activeDateX}
            y1={0}
            x2={activeDateX}
            y2={viewportHeight}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeOpacity="0.4"
            strokeDasharray="8,4"
          />
          <circle
            cx={activeDateX}
            cy={0}
            r={5}
            fill="hsl(var(--primary))"
            fillOpacity="0.8"
          />
        </g>
      )}
    </svg>
  );
}
