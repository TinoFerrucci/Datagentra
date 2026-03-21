import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS, formatNumber } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface BarChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

export function BarChartComponent({ columns, rows, chartConfig }: BarChartProps) {
  const data = rows.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })

  const xKey = chartConfig.x_key || columns[0]
  const yKeys = chartConfig.y_keys?.length ? chartConfig.y_keys : columns.slice(1)

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={formatNumber}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value) => [formatNumber(String(value)), '']}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid hsl(var(--border))',
            background: 'hsl(var(--card))',
            color: 'hsl(var(--card-foreground))',
          }}
        />
        {yKeys.length > 1 && <Legend />}
        {yKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={CHART_COLORS[i % CHART_COLORS.length]}
            radius={[4, 4, 0, 0]}
            animationDuration={600}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
