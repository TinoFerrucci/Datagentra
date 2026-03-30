import { formatNumber, isNumeric } from '@/lib/utils'

interface TableComponentProps {
  columns: string[]
  rows: (string | number | null)[][]
}

function fmtCell(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—'
  if (isNumeric(v) && v !== '') return formatNumber(v)
  return String(v)
}

export function TableComponent({ columns, rows }: TableComponentProps) {
  return (
    <div className="rounded-xl border">
      <div className="overflow-auto max-h-96">
        <table className="text-sm border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
          <thead className="sticky top-0 bg-muted z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap text-[11px] uppercase tracking-wide border-b"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-3 py-2 text-sm whitespace-nowrap ${
                      isNumeric(cell) && cell !== ''
                        ? 'text-right font-mono tabular-nums text-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {fmtCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 bg-muted/50 border-t text-[11px] text-muted-foreground">
        {rows.length} row{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
