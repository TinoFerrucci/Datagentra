import { useState } from 'react'
import { ChevronDown, ChevronRight, Table2, Rows3 } from 'lucide-react'
import type { SchemaTable } from '@/hooks/useDatagentra'
import { cn } from '@/lib/utils'

interface SchemaExplorerProps {
  schema: Record<string, SchemaTable>
  onColumnClick?: (text: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  INT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  INTEGER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  BIGINT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  FLOAT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  REAL: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  NUMERIC: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  TEXT: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  VARCHAR: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  DATE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  TIMESTAMP: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  BOOLEAN: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
}

function getTypeColor(type: string): string {
  const upper = type.toUpperCase()
  for (const key of Object.keys(TYPE_COLORS)) {
    if (upper.includes(key)) return TYPE_COLORS[key]
  }
  return 'bg-secondary text-secondary-foreground'
}

function normalizeType(type: string): string {
  const u = type.toUpperCase()
  if (u.includes('INT')) return 'INT'
  if (u.includes('FLOAT') || u.includes('REAL') || u.includes('NUMERIC') || u.includes('DECIMAL')) return 'FLOAT'
  if (u.includes('VARCHAR') || u.includes('TEXT') || u.includes('CHAR')) return 'VARCHAR'
  if (u.includes('TIMESTAMP')) return 'TIMESTAMP'
  if (u.includes('DATE')) return 'DATE'
  if (u.includes('BOOL')) return 'BOOL'
  return u.split('(')[0]
}

export function SchemaExplorer({ schema, onColumnClick }: SchemaExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (table: string) => {
    setExpanded((prev) => ({ ...prev, [table]: !prev[table] }))
  }

  const tables = Object.entries(schema)

  if (tables.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
        No schema available
      </div>
    )
  }

  return (
    <div className="space-y-1 py-2">
      {tables.map(([tableName, tableInfo]) => {
        const isOpen = !!expanded[tableName]
        return (
          <div key={tableName}>
            <button
              onClick={() => toggle(tableName)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors group"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              )}
              <Table2 className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
              <span className="font-medium flex-1 text-left truncate">{tableName}</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Rows3 className="w-3 h-3" />
                {tableInfo.row_count?.toLocaleString() ?? '?'}
              </span>
            </button>

            {isOpen && (
              <div className="ml-5 space-y-0.5 mb-1">
                {tableInfo.columns.map((col) => (
                  <button
                    key={col.name}
                    onClick={() => onColumnClick?.(col.name)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md hover:bg-muted transition-colors group text-left"
                    title={`Click to insert "${col.name}"`}
                  >
                    <span className="flex-1 text-muted-foreground group-hover:text-foreground truncate font-mono">
                      {col.name}
                    </span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
                      getTypeColor(col.type)
                    )}>
                      {normalizeType(col.type)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
