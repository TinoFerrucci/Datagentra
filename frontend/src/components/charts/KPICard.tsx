import { TrendingUp } from 'lucide-react'
import { formatNumber } from '@/lib/utils'

interface KPICardProps {
  label: string
  value: string | number | null
}

export function KPICard({ label, value }: KPICardProps) {
  const formatted = value !== null && value !== undefined ? formatNumber(String(value)) : '—'
  const isLarge = formatted.length > 8

  return (
    <div className="relative flex flex-col items-center justify-center rounded-2xl overflow-hidden min-h-[160px] p-8 gap-3">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-cyan-500/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.08)_0%,transparent_70%)]" />

      {/* Icon */}
      <div className="relative w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
        <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>

      {/* Value */}
      <div className={`relative font-bold tracking-tight text-foreground ${isLarge ? 'text-4xl' : 'text-5xl'}`}>
        {formatted}
      </div>

      {/* Label */}
      <div className="relative text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center">
        {label}
      </div>
    </div>
  )
}
