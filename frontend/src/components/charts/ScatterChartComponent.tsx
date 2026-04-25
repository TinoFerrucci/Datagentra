import { ThemeProvider } from '@mui/material/styles'
import { ScatterChart } from '@mui/x-charts/ScatterChart'
import { CHART_COLORS } from '@/lib/utils'
import { useChartTheme } from './useChartTheme'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface ScatterChartProps {
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

export function ScatterChartComponent({ columns, rows, chartConfig }: ScatterChartProps) {
  const theme = useChartTheme()

  const xKey = chartConfig.x_key || columns[0]
  const yKey = chartConfig.y_keys?.[0] || columns[1] || columns[0]

  const xi = columns.indexOf(xKey)
  const yi = columns.indexOf(yKey)

  const data = rows
    .filter((row) =>
      row[xi] !== null && row[yi] !== null &&
      !isNaN(Number(row[xi])) && !isNaN(Number(row[yi]))
    )
    .map((row, i) => ({ id: String(i), x: Number(row[xi]), y: Number(row[yi]) }))

  return (
    <ThemeProvider theme={theme}>
      <div className="w-full">
        <ScatterChart
          series={[{
            data,
            label: `${xKey} vs ${yKey}`,
            color: CHART_COLORS[0],
          }]}
          xAxis={[{
            label: xKey,
            valueFormatter: fmtVal,
          }]}
          yAxis={[{
            label: yKey,
            valueFormatter: fmtVal,
            width: 60,
          }]}
          height={300}
          margin={{ top: 16, right: 16, bottom: 48, left: 16 }}
          grid={{ horizontal: true, vertical: true }}
        />
      </div>
    </ThemeProvider>
  )
}
