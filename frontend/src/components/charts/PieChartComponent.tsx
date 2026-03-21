import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS, formatNumber } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface PieChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

export function PieChartComponent({ columns, rows, chartConfig }: PieChartProps) {
  const nameKey = chartConfig.x_key || columns[0]
  const valueKey = chartConfig.y_keys?.[0] || columns[1] || columns[0]

  const data = rows.slice(0, 8).map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return { name: String(obj[nameKey] ?? ''), value: Number(obj[valueKey] ?? 0) }
  })

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={110}
          dataKey="value"
          animationDuration={600}
          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => [formatNumber(String(v)), valueKey]}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
