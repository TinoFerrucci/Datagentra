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
  ReferenceDot,
} from 'recharts'
import { CHART_COLORS } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface LineChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
  variant?: 'line' | 'area'
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border bg-card shadow-lg px-4 py-3 text-sm min-w-[140px]">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.stroke ?? p.color }} />
          <span className="text-muted-foreground text-xs">{p.name}:</span>
          <span className="font-medium ml-auto pl-3">
            {typeof p.value === 'number'
              ? p.value >= 1_000_000 ? `${(p.value / 1_000_000).toFixed(2)}M`
              : p.value >= 1_000 ? `${(p.value / 1_000).toFixed(1)}K`
              : Number.isInteger(p.value) ? p.value.toLocaleString()
              : p.value.toFixed(2)
              : p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export function LineChartComponent({ columns, rows, chartConfig, variant = 'line' }: LineChartProps) {
  const data = rows.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })

  const xKey = chartConfig.x_key || columns[0]
  const rawYKeys = chartConfig.y_keys?.length ? chartConfig.y_keys : columns.slice(1)
  const yKeys = rawYKeys.filter((key) =>
    data.some((d) => d[key] !== null && d[key] !== undefined && !isNaN(Number(d[key])))
  )

  const axisProps = {
    tickLine: false,
    axisLine: false,
    tick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } as any,
  }

  const yAxisFormatter = (v: number): string =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K`
    : String(v)

  if (variant === 'area') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <defs>
            {yKeys.map((key, i) => (
              <linearGradient key={key} id={`areaGrad_${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.35} />
                <stop offset="60%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.08} />
                <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} tickFormatter={yAxisFormatter} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1.5 }} />
          {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {yKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2.5}
              fill={`url(#areaGrad_${i})`}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0 }}
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
        <XAxis dataKey={xKey} {...axisProps} />
        <YAxis {...axisProps} tickFormatter={yAxisFormatter} />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1.5 }} />
        {yKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {yKeys.map((key, i) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[i % CHART_COLORS.length]}
            strokeWidth={2.5}
            dot={{ r: 3, fill: CHART_COLORS[i % CHART_COLORS.length], strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
