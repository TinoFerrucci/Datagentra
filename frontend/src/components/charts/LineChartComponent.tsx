import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CHART_COLORS, formatNumber } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface LineChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
  variant?: 'line' | 'area'
}

export function LineChartComponent({ columns, rows, chartConfig, variant = 'line' }: LineChartProps) {
  const data = rows.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })

  const xKey = chartConfig.x_key || columns[0]
  const yKeys = chartConfig.y_keys?.length ? chartConfig.y_keys : columns.slice(1)

  const tooltipStyle = {
    borderRadius: '8px',
    border: '1px solid hsl(var(--border))',
    background: 'hsl(var(--card))',
    color: 'hsl(var(--card-foreground))',
  }

  if (variant === 'area') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <defs>
            {yKeys.map((key, i) => (
              <linearGradient key={key} id={`grad_${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey={xKey} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v) => [formatNumber(String(v)), '']} contentStyle={tooltipStyle} />
          {yKeys.length > 1 && <Legend />}
          {yKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              fill={`url(#grad_${i})`}
              strokeWidth={2}
              dot={false}
              animationDuration={600}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={formatNumber} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(v) => [formatNumber(String(v)), '']} contentStyle={tooltipStyle} />
        {yKeys.length > 1 && <Legend />}
        {yKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            animationDuration={600}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
