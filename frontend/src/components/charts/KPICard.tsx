import { TrendingUp } from 'lucide-react'
import { formatNumber } from '@/lib/utils'

interface KPICardProps {
  label: string
  value: string | number | null
}

export function KPICard({ label, value }: KPICardProps) {
  const formatted = value !== null && value !== undefined ? formatNumber(String(value)) : '—'

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 p-8 min-h-[160px] gap-2">
      <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium uppercase tracking-wide">
        <TrendingUp className="w-4 h-4" />
        {label}
      </div>
      <div className="text-5xl font-bold text-primary tracking-tight">{formatted}</div>
    </div>
  )
}
