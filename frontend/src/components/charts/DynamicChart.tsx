import type { AgentResponse } from '@/hooks/useDatagentra'
import { BarChartComponent } from './BarChartComponent'
import { LineChartComponent } from './LineChartComponent'
import { PieChartComponent } from './PieChartComponent'
import { KPICard } from './KPICard'

interface DynamicChartProps {
  response: AgentResponse
}

export function DynamicChart({ response }: DynamicChartProps) {
  const { chart_type, chart_config, chart_title, columns, rows } = response

  if (!rows.length || !columns.length) {
    return <p className="text-muted-foreground text-sm italic">No data to visualize.</p>
  }

  if (chart_type === 'metric') {
    return <KPICard label={chart_title || columns[0]} value={rows[0]?.[0] ?? null} />
  }

  return (
    <div className="space-y-3">
      {chart_title && (
        <p className="text-sm font-semibold text-foreground/80 tracking-tight">{chart_title}</p>
      )}

      {chart_type === 'pie' && (
        <PieChartComponent columns={columns} rows={rows} chartConfig={chart_config} />
      )}

      {(chart_type === 'line' || chart_type === 'area') && (
        <LineChartComponent
          columns={columns}
          rows={rows}
          chartConfig={chart_config}
          variant={chart_type}
        />
      )}

      {(chart_type === 'bar' || !['pie', 'line', 'area', 'metric'].includes(chart_type)) && (
        <BarChartComponent columns={columns} rows={rows} chartConfig={chart_config} />
      )}
    </div>
  )
}
