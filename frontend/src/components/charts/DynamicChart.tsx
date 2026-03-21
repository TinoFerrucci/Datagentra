import type { AgentResponse } from '@/hooks/useDatagentra'
import { BarChartComponent } from './BarChartComponent'
import { LineChartComponent } from './LineChartComponent'
import { PieChartComponent } from './PieChartComponent'
import { KPICard } from './KPICard'

interface DynamicChartProps {
  response: AgentResponse
}

export function DynamicChart({ response }: DynamicChartProps) {
  const { chart_type, chart_config, columns, rows } = response

  if (!rows.length || !columns.length) {
    return <p className="text-muted-foreground text-sm italic">No data to visualize.</p>
  }

  if (chart_type === 'metric') {
    return (
      <KPICard
        label={columns[0]}
        value={rows[0]?.[0] ?? null}
      />
    )
  }

  if (chart_type === 'pie') {
    return (
      <PieChartComponent
        columns={columns}
        rows={rows}
        chartConfig={chart_config}
      />
    )
  }

  if (chart_type === 'line') {
    return (
      <LineChartComponent
        columns={columns}
        rows={rows}
        chartConfig={chart_config}
        variant="line"
      />
    )
  }

  if (chart_type === 'area') {
    return (
      <LineChartComponent
        columns={columns}
        rows={rows}
        chartConfig={chart_config}
        variant="area"
      />
    )
  }

  // default: bar
  return (
    <BarChartComponent
      columns={columns}
      rows={rows}
      chartConfig={chart_config}
    />
  )
}
