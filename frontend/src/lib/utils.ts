import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const CHART_COLORS = [
  '#00768C', // brand teal
  '#00FF8C', // brand green
  '#0A436D', // brand navy
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#8b5cf6', // violet-500
]

// Muted fills for gradients (20% opacity approximation in hex)
export const CHART_COLORS_MUTED = [
  '#ccebf0',
  '#ccffe8',
  '#b3d0e4',
  '#cffafe',
  '#d1fae5',
  '#fef3c7',
  '#ffe4e6',
  '#ede9fe',
]

export function formatNumber(n: number | string): string {
  const num = typeof n === 'string' ? parseFloat(n) : n
  if (isNaN(num)) return String(n)
  if (Math.abs(num) >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (Math.abs(num) >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  if (Number.isInteger(num)) return num.toLocaleString()
  return num.toFixed(2)
}

export function isNumeric(val: unknown): boolean {
  return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)))
}
