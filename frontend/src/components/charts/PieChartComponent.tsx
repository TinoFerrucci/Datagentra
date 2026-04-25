import { ThemeProvider } from '@mui/material/styles'
import { PieChart } from '@mui/x-charts/PieChart'
import { CHART_COLORS } from '@/lib/utils'
import { useChartTheme } from './useChartTheme'
import type { ChartConfig } from '@/hooks/useDatagentra'

interface PieChartProps {
  columns: string[]
  rows: (string | number | null)[][]
  chartConfig: ChartConfig
}

const MAX_SLICES = 7
const OTHERS_LABEL = 'Otros'

function groupOthers(
  data: { id: number; value: number; label: string }[],
  max: number
): { id: number; value: number; label: string }[] {
  if (data.length <= max) return data
  const top = data.slice(0, max - 1)
  const restVal = data.slice(max - 1).reduce((s, d) => s + d.value, 0)
  return [...top, { id: max - 1, value: restVal, label: OTHERS_LABEL }]
}

export function PieChartComponent({ columns, rows, chartConfig }: PieChartProps) {
  const theme = useChartTheme()

  const nameKey = chartConfig.x_key || columns[0]
  const valueKey = chartConfig.y_keys?.[0] || columns[1] || columns[0]

  const raw = rows.map((row, i) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, ci) => { obj[col] = row[ci] })
    return {
      id: i,
      value: Number(obj[valueKey] ?? 0),
      label: String(obj[nameKey] ?? ''),
    }
  })

  const data = groupOthers(raw, MAX_SLICES)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <ThemeProvider theme={theme}>
      <div className="w-full flex flex-col items-center gap-2">
        <div className="w-full flex justify-center">
          <PieChart
            colors={CHART_COLORS}
            series={[{
              data,
              innerRadius: 48,
              outerRadius: 100,
              paddingAngle: 2,
              cornerRadius: 4,
              highlightScope: { highlight: 'item', fade: 'global' },
              valueFormatter: (item) => {
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
                return `${item.value.toLocaleString()} (${pct}%)`
              },
            }]}
            width={320}
            height={260}
            margin={{ top: 8, bottom: 8, left: 8, right: 8 }}
            hideLegend
          />
        </div>
        {/* Custom legend */}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 px-2 pb-1">
          {data.map((entry, i) => (
            <div key={entry.id} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-muted-foreground">{entry.label}</span>
              <span className="font-medium text-foreground">
                {total > 0 ? ((entry.value / total) * 100).toFixed(0) : '0'}%
              </span>
            </div>
          ))}
          {raw.length > MAX_SLICES && (
            <span className="text-xs text-muted-foreground italic">
              ({raw.length - (MAX_SLICES - 1)} categorías agrupadas en "{OTHERS_LABEL}")
            </span>
          )}
        </div>
      </div>
    </ThemeProvider>
  )
}
