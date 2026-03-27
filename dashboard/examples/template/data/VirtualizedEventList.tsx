import { useMemo, useState, type ReactNode } from 'react';

interface VirtualizedEventListProps<Row> {
  rows: Row[];
  height?: number;
  rowHeight?: number;
  overscan?: number;
  className?: string;
  getRowKey: (row: Row, index: number) => string;
  renderRow: (row: Row, index: number) => ReactNode;
}

export function VirtualizedEventList<Row>({
  rows,
  height = 320,
  rowHeight = 54,
  overscan = 6,
  className = '',
  getRowKey,
  renderRow,
}: VirtualizedEventListProps<Row>) {
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = rows.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  const visibleRows = useMemo(
    () =>
      rows.slice(startIndex, endIndex).map((row, offset) => ({
        row,
        index: startIndex + offset,
      })),
    [endIndex, rows, startIndex],
  );

  return (
    <div
      className={`overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-950/50 ${className}`.trim()}
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleRows.map(({ row, index }) => (
          <div
            key={getRowKey(row, index)}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: index * rowHeight,
              minHeight: rowHeight,
            }}
          >
            {renderRow(row, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
