import { ThemeProvider } from '@mui/material/styles'
import { BarChart } from '@mui/x-charts/BarChart'
import { CHART_COLORS } from '@/lib/utils'
import { useChartTheme } from './useChartTheme'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface BarChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

function fmtVal(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  if (Number.isInteger(v)) return v.toLocaleString()
  return v.toFixed(2)
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function BarChartComponent({ columns, rows, chartConfig }: BarChartProps) {
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

  const avgLabelLen =
    dataset.reduce((acc, d) => acc + String(d[xKey] ?? '').length, 0) / (dataset.length || 1)
  const isHorizontal = dataset.length > 7 || avgLabelLen > 9

  if (isHorizontal) {
    const sorted = yKeys.length === 1
      ? [...dataset].sort((a, b) => Number(a[yKeys[0]] ?? 0) - Number(b[yKeys[0]] ?? 0))
      : dataset

    const longestLabel = sorted.reduce((m, d) => Math.max(m, String(d[xKey] ?? '').length), 0)
    const yAxisWidth = Math.min(Math.max(longestLabel * 7, 80), 200)
    const barH = 36
    const chartHeight = Math.max(280, sorted.length * barH + 60)

    return (
      <ThemeProvider theme={theme}>
        <div className="w-full">
          <BarChart
            dataset={sorted}
            layout="horizontal"
            yAxis={[{
              dataKey: xKey,
              scaleType: 'band',
              width: yAxisWidth,
              valueFormatter: (v: string) => truncate(String(v ?? ''), Math.floor(yAxisWidth / 7)),
            }]}
            xAxis={[{ valueFormatter: fmtVal }]}
            series={yKeys.map((key, i) => ({
              dataKey: key,
              label: key,
              color: CHART_COLORS[i % CHART_COLORS.length],
            }))}
            height={chartHeight}
            margin={{ top: 8, right: yKeys.length === 1 ? 80 : 16, bottom: 8, left: 8 }}
            grid={{ vertical: true }}
            hideLegend={yKeys.length === 1}
          />
        </div>
      </ThemeProvider>
    )
  }

  const rotateLabels = dataset.length > 5
  return (
    <ThemeProvider theme={theme}>
      <div className="w-full">
        <BarChart
          dataset={dataset}
          xAxis={[{
            dataKey: xKey,
            scaleType: 'band',
            valueFormatter: (v: string) => truncate(String(v ?? ''), 16),
          }]}
          yAxis={[{ valueFormatter: fmtVal, width: 52 }]}
          series={yKeys.map((key, i) => ({
            dataKey: key,
            label: key,
            color: CHART_COLORS[i % CHART_COLORS.length],
          }))}
          height={300}
          margin={{ top: 20, right: 16, bottom: rotateLabels ? 60 : 32, left: 8 }}
          grid={{ horizontal: true }}
          hideLegend={yKeys.length === 1}
        />
      </div>
    </ThemeProvider>
  )
}
