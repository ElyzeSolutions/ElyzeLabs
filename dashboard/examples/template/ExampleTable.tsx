interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => string;
}

interface ExampleTableProps<Row> {
  title: string;
  rows: Row[];
  columns: Column<Row>[];
}

export function ExampleTable<Row extends { id: string }>({ title, rows, columns }: ExampleTableProps<Row>) {
  return (
    <div className="rounded-lg border border-slate-700/70 bg-slate-900/35">
      <div className="border-b border-slate-700/70 px-3 py-2">
        <p className="text-xs uppercase tracking-[0.14em] text-slate-400">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-700/70 text-slate-400">
              {columns.map((column) => (
                <th key={column.key} className="px-3 py-2 font-medium uppercase tracking-[0.14em]">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-800/70 text-slate-200 last:border-b-0">
                {columns.map((column) => (
                  <td key={`${row.id}:${column.key}`} className="px-3 py-2">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
