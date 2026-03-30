import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from 'recharts'
import { CHART_COLORS } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface ScatterChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

function fmtVal(v: unknown): string {
  const n = Number(v)
  if (isNaN(n)) return String(v ?? '')
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl border bg-card/95 backdrop-blur-sm shadow-xl px-4 py-3 text-sm min-w-[160px]">
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="text-muted-foreground text-xs">{p.name}</span>
          <span className="font-semibold ml-auto pl-4 tabular-nums">{fmtVal(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function ScatterChartComponent({ columns, rows, chartConfig }: ScatterChartProps) {
  const xKey = chartConfig.x_key || columns[0]
  const yKey = chartConfig.y_keys?.[0] || columns[1] || columns[0]

  const data = rows
    .map((row) => {
      const obj: Record<string, unknown> = {}
      columns.forEach((col, i) => { obj[col] = row[i] })
      return obj
    })
    .filter(
      (d) =>
        d[xKey] !== null &&
        d[yKey] !== null &&
        !isNaN(Number(d[xKey])) &&
        !isNaN(Number(d[yKey]))
    )

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 36, left: 16 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(var(--border))"
          strokeOpacity={0.5}
        />
        <XAxis
          type="number"
          dataKey={xKey}
          name={xKey}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v) => fmtVal(v)}
        >
          <Label
            value={xKey}
            position="insideBottom"
            offset={-20}
            style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          />
        </XAxis>
        <YAxis
          type="number"
          dataKey={yKey}
          name={yKey}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v) => fmtVal(v)}
          width={52}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
        <Scatter data={data} fill={CHART_COLORS[0]} fillOpacity={0.65} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
