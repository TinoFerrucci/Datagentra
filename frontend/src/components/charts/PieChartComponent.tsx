import { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Sector,
} from 'recharts'
import { CHART_COLORS, formatNumber } from '@/lib/utils'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface PieChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="rounded-xl border bg-card shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{p.name}</p>
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.payload.fill }} />
        <span className="text-muted-foreground text-xs">Value:</span>
        <span className="font-medium ml-auto pl-3">{formatNumber(p.value)}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {(p.payload.percent * 100).toFixed(1)}% of total
      </p>
    </div>
  )
}

function ActiveShape(props: any) {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value,
  } = props

  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" dominantBaseline="central" className="fill-foreground" style={{ fontSize: 15, fontWeight: 700 }}>
        {formatNumber(value)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}>
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx} cy={cy}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 15}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  )
}

export function PieChartComponent({ columns, rows, chartConfig }: PieChartProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const nameKey = chartConfig.x_key || columns[0]
  const valueKey = chartConfig.y_keys?.[0] || columns[1] || columns[0]

  const data = rows.slice(0, 8).map((row, i) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, ci) => { obj[col] = row[ci] })
    return {
      name: String(obj[nameKey] ?? ''),
      value: Number(obj[valueKey] ?? 0),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }
  })

  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="flex flex-col items-center gap-4">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={72}
            outerRadius={108}
            dataKey="value"
            activeIndex={activeIndex}
            activeShape={<ActiveShape />}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            animationDuration={600}
            animationEasing="ease-out"
            paddingAngle={2}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-2">
        {data.map((entry, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className="flex items-center gap-1.5 text-xs transition-opacity"
            style={{ opacity: activeIndex === i ? 1 : 0.55 }}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: entry.fill }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="font-medium text-foreground">
              {((entry.value / total) * 100).toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
