import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
} from 'recharts'
import { CHART_COLORS } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface BarChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtVal(v: unknown): string {
  const n = Number(v)
  if (isNaN(n)) return String(v ?? '')
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(2)
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// ─── tooltip ────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-2xl border bg-card/95 backdrop-blur-sm shadow-xl px-4 py-3 text-sm min-w-[160px] max-w-[280px]">
      <p className="font-semibold text-foreground mb-2.5 leading-tight">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: p.fill ?? p.color }}
          />
          <span className="text-muted-foreground text-xs truncate">{p.name}</span>
          <span className="font-semibold ml-auto pl-4 tabular-nums">{fmtVal(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

export function BarChartComponent({ columns, rows, chartConfig }: BarChartProps) {
  // Build data objects
  const rawData = rows.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })

  const xKey = chartConfig.x_key || columns[0]
  const rawYKeys = chartConfig.y_keys?.length ? chartConfig.y_keys : columns.slice(1)

  // Keep only y_keys with actual numeric values
  const yKeys = rawYKeys.filter((key) =>
    rawData.some((d) => d[key] !== null && d[key] !== undefined && !isNaN(Number(d[key])))
  )

  // Decide orientation:
  // horizontal when many items OR long average label length
  const avgLabelLen =
    rawData.reduce((acc, d) => acc + String(d[xKey] ?? '').length, 0) / (rawData.length || 1)
  const isHorizontal = rawData.length > 7 || avgLabelLen > 9

  // Sort descending by first y_key (ranking queries look much better sorted)
  const isSingleSeries = yKeys.length === 1
  const data = isSingleSeries && isHorizontal
    ? [...rawData].sort((a, b) => Number(a[yKeys[0]] ?? 0) - Number(b[yKeys[0]] ?? 0))  // asc for horizontal (best at top)
    : rawData

  // Average reference line for vertical single-series
  const avg =
    isSingleSeries && !isHorizontal
      ? data.reduce((s, d) => s + Number(d[yKeys[0]] ?? 0), 0) / (data.length || 1)
      : null

  // Dynamic Y-axis width based on longest label
  const longestLabel = data.reduce(
    (max, d) => Math.max(max, String(d[xKey] ?? '').length),
    0
  )
  const yAxisWidth = Math.min(Math.max(longestLabel * 7.5, 80), 180)

  const color = CHART_COLORS[0]

  // ── HORIZONTAL ────────────────────────────────────────────────────────────
  if (isHorizontal) {
    const barHeight = 36
    const chartHeight = Math.max(260, data.length * barHeight + 40)

    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: isSingleSeries ? 72 : 16, left: 8, bottom: 4 }}
          barCategoryGap="25%"
        >
          <defs>
            {yKeys.map((_, i) => (
              <linearGradient key={i} id={`hbar_${i}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={1} />
                <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.72} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            horizontal={false}
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
          />

          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v: number) => fmtVal(v)}
          />

          <YAxis
            type="category"
            dataKey={xKey}
            width={yAxisWidth}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
            tickFormatter={(v: string) => truncate(String(v), Math.floor(yAxisWidth / 7.5))}
          />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4, radius: 4 }}
          />
          {!isSingleSeries && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}

          {yKeys.map((key, i) => (
            <Bar
              key={key}
              dataKey={key}
              fill={`url(#hbar_${i})`}
              radius={[0, 6, 6, 0]}
              animationDuration={500}
              animationEasing="ease-out"
              maxBarSize={28}
            >
              {isSingleSeries && (
                <LabelList
                  dataKey={key}
                  position="right"
                  formatter={(v: unknown) => fmtVal(v)}
                  style={{ fontSize: 11, fontWeight: 600, fill: 'hsl(var(--muted-foreground))' }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // ── VERTICAL ──────────────────────────────────────────────────────────────
  const rotateLabels = data.length > 5
  const xAxisHeight = rotateLabels ? 56 : 28

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: isSingleSeries ? 20 : 8, right: 16, left: 0, bottom: xAxisHeight - 8 }}
        barCategoryGap="30%"
      >
        <defs>
          {yKeys.map((_, i) => (
            <linearGradient key={i} id={`vbar_${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={1} />
              <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.7} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="hsl(var(--border))"
          strokeOpacity={0.5}
        />

        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          angle={rotateLabels ? -35 : 0}
          textAnchor={rotateLabels ? 'end' : 'middle'}
          height={xAxisHeight}
          tickFormatter={(v: string) => truncate(String(v), 16)}
          interval={0}
        />

        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          tickFormatter={(v: number) => fmtVal(v)}
          width={50}
        />

        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4, radius: 4 }}
        />
        {!isSingleSeries && <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}

        {avg !== null && (
          <ReferenceLine
            y={avg}
            stroke={color}
            strokeDasharray="5 4"
            strokeWidth={1.5}
            strokeOpacity={0.5}
            label={{
              value: `avg ${fmtVal(avg)}`,
              position: 'insideTopRight',
              fontSize: 10,
              fill: 'hsl(var(--muted-foreground))',
            }}
          />
        )}

        {yKeys.map((key, i) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`url(#vbar_${i})`}
            radius={[6, 6, 0, 0]}
            animationDuration={500}
            animationEasing="ease-out"
            maxBarSize={52}
          >
            {isSingleSeries && data.length <= 12 && (
              <LabelList
                dataKey={key}
                position="top"
                formatter={(v: unknown) => fmtVal(v)}
                style={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--muted-foreground))' }}
              />
            )}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
