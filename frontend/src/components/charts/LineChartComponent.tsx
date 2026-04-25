import { ThemeProvider } from '@mui/material/styles'
import { LineChart } from '@mui/x-charts/LineChart'
import { CHART_COLORS } from '@/lib/utils'
import { useChartTheme } from './useChartTheme'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface LineChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
  variant?: 'line' | 'area'
}

function fmtVal(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

export function LineChartComponent({ columns, rows, chartConfig, variant = 'line' }: LineChartProps) {
  const theme = useChartTheme()

  const xKey = chartConfig.x_key || columns[0]
  const rawYKeys = chartConfig.y_keys?.length ? chartConfig.y_keys : columns.slice(1)
  const yKeys = rawYKeys.filter((key) =>
    rows.some((row) => {
      const i = columns.indexOf(key)
      return i !== -1 && row[i] !== null && !isNaN(Number(row[i]))
    })
  )

  const dataset = rows.map((row) => {
    const obj: Record<string, string | number | null> = {}
    columns.forEach((col, i) => { obj[col] = row[i] })
    return obj
  })

  return (
    <ThemeProvider theme={theme}>
      <div className="w-full">
        <LineChart
          dataset={dataset}
          xAxis={[{ dataKey: xKey }]}
          yAxis={[{ valueFormatter: fmtVal, width: 52 }]}
          series={yKeys.map((key, i) => ({
            dataKey: key,
            label: key,
            color: CHART_COLORS[i % CHART_COLORS.length],
            area: variant === 'area',
            showMark: rows.length <= 30,
          }))}
          height={300}
          margin={{ top: 16, right: 16, bottom: 32, left: 8 }}
          grid={{ horizontal: true }}
          hideLegend={yKeys.length === 1}
        />
      </div>
    </ThemeProvider>
  )
}
