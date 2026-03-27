import { useMemo, useState, type ReactNode } from 'react';

type SortDirection = 'asc' | 'desc';

export interface TemplateDataTableColumn<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  sortValue?: (row: Row) => string | number;
  sticky?: 'left' | 'right';
  widthClassName?: string;
  align?: 'left' | 'center' | 'right';
}

interface TemplateDataTableProps<Row extends { id: string }> {
  title: string;
  subtitle?: string;
  rows: Row[];
  columns: Array<TemplateDataTableColumn<Row>>;
  initialSort?: {
    key: string;
    direction: SortDirection;
  };
  maxHeightClassName?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  selectedRowId?: string;
  onRowClick?: (row: Row) => void;
}

function compareValue(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function alignClassName(align: 'left' | 'center' | 'right' | undefined): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function sortIndicator(isActive: boolean, direction: SortDirection | null): string {
  if (!isActive) return '↕';
  return direction === 'asc' ? '↑' : '↓';
}

export function TemplateDataTable<Row extends { id: string }>({
  title,
  subtitle,
  rows,
  columns,
  initialSort,
  maxHeightClassName = 'max-h-[320px]',
  emptyTitle = 'No rows',
  emptyMessage = 'No rows match this filter.',
  selectedRowId,
  onRowClick,
}: TemplateDataTableProps<Row>) {
  const firstSortableColumn = columns.find((column) => typeof column.sortValue === 'function');
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? firstSortableColumn?.key ?? null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialSort?.direction ?? 'asc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const target = columns.find((column) => column.key === sortKey);
    if (!target?.sortValue) return rows;

    const next = [...rows];
    next.sort((a, b) => {
      const valueA = target.sortValue?.(a);
      const valueB = target.sortValue?.(b);
      const result = compareValue(valueA ?? '', valueB ?? '');
      return sortDirection === 'asc' ? result : -result;
    });
    return next;
  }, [columns, rows, sortDirection, sortKey]);

  const leftStickyColumnIndex = columns.findIndex((column) => column.sticky === 'left');
  const rightStickyColumnIndex = columns.findIndex((column) => column.sticky === 'right');

  function handleSort(column: TemplateDataTableColumn<Row>) {
    if (!column.sortValue) return;
    if (column.key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(column.key);
    setSortDirection('asc');
  }

  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/40">
      <div className="border-b border-slate-700/70 px-3 py-2">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>

      {sortedRows.length === 0 ? (
        <div className="px-3 py-8 text-center">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-300">{emptyTitle}</p>
          <p className="mt-1 text-xs text-slate-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className={`overflow-auto ${maxHeightClassName}`}>
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-950/95 text-slate-400">
                {columns.map((column, index) => {
                  const isActiveSort = column.key === sortKey;
                  const isSortable = typeof column.sortValue === 'function';
                  const isLeftSticky = index === leftStickyColumnIndex;
                  const isRightSticky = index === rightStickyColumnIndex;
                  const stickyClass = isLeftSticky ? 'sticky left-0 z-30 bg-slate-950/95' : isRightSticky ? 'sticky right-0 z-30 bg-slate-950/95' : '';
                  return (
                    <th
                      key={column.key}
                      className={`border-b border-slate-700/70 px-3 py-2 font-medium uppercase tracking-[0.12em] ${alignClassName(column.align)} ${column.widthClassName ?? ''} ${stickyClass}`.trim()}
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column)}
                          className={`inline-flex items-center gap-1 transition ${alignClassName(column.align)} ${isActiveSort ? 'text-cyan-200' : 'hover:text-cyan-100'}`}
                        >
                          <span>{column.header}</span>
                          <span className="text-[10px]">{sortIndicator(isActiveSort, isActiveSort ? sortDirection : null)}</span>
                        </button>
                      ) : (
                        <span>{column.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {sortedRows.map((row) => {
                const isSelected = selectedRowId === row.id;
                return (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    className={`border-b border-slate-800/70 text-slate-200 ${onRowClick ? 'cursor-pointer hover:bg-slate-800/35' : ''} ${isSelected ? 'bg-cyan-500/10' : 'bg-transparent'}`}
                  >
                    {columns.map((column, index) => {
                      const isLeftSticky = index === leftStickyColumnIndex;
                      const isRightSticky = index === rightStickyColumnIndex;
                      const stickyClass = isLeftSticky ? 'sticky left-0 z-10' : isRightSticky ? 'sticky right-0 z-10' : '';
                      const stickyBgClass = isSelected ? 'bg-cyan-500/10' : 'bg-slate-900/40';
                      return (
                        <td
                          key={`${row.id}:${column.key}`}
                          className={`border-b border-slate-800/70 px-3 py-2 ${alignClassName(column.align)} ${column.widthClassName ?? ''} ${stickyClass} ${isLeftSticky || isRightSticky ? stickyBgClass : ''}`.trim()}
                        >
                          {column.render(row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
