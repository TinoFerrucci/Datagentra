import { useState } from 'react'
import { ChevronDown, ChevronRight, Table2, Rows3, Key, Link, GitFork } from 'lucide-react'
import type { SchemaTable, SchemaColumn } from '@/hooks/useDatagentra'
import { cn } from '@/lib/utils'

interface SchemaExplorerProps {
  schema: Record<string, SchemaTable>
  onColumnClick?: (text: string) => void
}

// ── Type color helpers ────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  INT:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  FLOAT:     'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  TEXT:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  VARCHAR:   'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  DATE:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  TIMESTAMP: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  BOOLEAN:   'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
}

function getTypeColor(type: string): string {
  const u = type.toUpperCase()
  for (const key of Object.keys(TYPE_COLORS)) {
    if (u.includes(key)) return TYPE_COLORS[key]
  }
  return 'bg-secondary text-secondary-foreground'
}

function normalizeType(type: string): string {
  const u = type.toUpperCase()
  if (u.includes('INT'))                                              return 'INT'
  if (u.includes('FLOAT') || u.includes('REAL') || u.includes('NUMERIC') || u.includes('DECIMAL')) return 'FLOAT'
  if (u.includes('VARCHAR') || u.includes('TEXT') || u.includes('CHAR')) return 'TEXT'
  if (u.includes('TIMESTAMP'))                                        return 'TIMESTAMP'
  if (u.includes('DATE'))                                             return 'DATE'
  if (u.includes('BOOL'))                                             return 'BOOL'
  return u.split('(')[0]
}

// ── Column row ────────────────────────────────────────────────────────────────

function ColumnRow({ col, onColumnClick }: { col: SchemaColumn; onColumnClick?: (t: string) => void }) {
  return (
    <button
      onClick={() => onColumnClick?.(col.name)}
      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md hover:bg-muted transition-colors group text-left"
      title={col.fk ? `FK → ${col.fk.ref_table}.${col.fk.ref_column}` : `Click to insert "${col.name}"`}
    >
      {/* PK / FK icon */}
      {col.is_pk ? (
        <Key className="w-3 h-3 text-amber-500 flex-shrink-0" />
      ) : col.fk ? (
        <Link className="w-3 h-3 text-teal-400 flex-shrink-0" />
      ) : (
        <span className="w-3 flex-shrink-0" />
      )}

      <span className="flex-1 text-muted-foreground group-hover:text-foreground truncate font-mono">
        {col.name}
      </span>

      {/* FK badge */}
      {col.fk && (
        <span className="text-[9px] text-teal-500 dark:text-teal-400 font-medium flex-shrink-0 truncate max-w-[60px]">
          →{col.fk.ref_table}
        </span>
      )}

      {/* Type badge */}
      <span className={cn(
        'px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0',
        getTypeColor(col.type)
      )}>
        {normalizeType(col.type)}
      </span>
    </button>
  )
}

// ── Relations panel ───────────────────────────────────────────────────────────

interface Relation {
  from_table: string
  from_col: string
  to_table: string
  to_col: string
}

function RelationsPanel({ relations }: { relations: Relation[] }) {
  const [open, setOpen] = useState(false)
  if (relations.length === 0) return null
  return (
    <div className="border-t mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <GitFork className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">Relationships ({relations.length})</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {relations.map((r, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
              <span className="text-foreground font-medium">{r.from_table}</span>
              <span>.{r.from_col}</span>
              <span className="text-teal-500 mx-0.5">→</span>
              <span className="text-foreground font-medium">{r.to_table}</span>
              <span>.{r.to_col}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SchemaExplorer({ schema, onColumnClick }: SchemaExplorerProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (table: string) => setExpanded(prev => ({ ...prev, [table]: !prev[table] }))

  const tables = Object.entries(schema)

  if (tables.length === 0) {
    return <div className="px-4 py-6 text-center text-sm text-muted-foreground">No schema available</div>
  }

  // Collect all FK relations for the panel
  const relations: Relation[] = []
  for (const [tableName, tableInfo] of tables) {
    for (const col of tableInfo.columns) {
      if (col.fk) {
        relations.push({ from_table: tableName, from_col: col.name, to_table: col.fk.ref_table, to_col: col.fk.ref_column })
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-0.5 py-2">
        {tables.map(([tableName, tableInfo]) => {
          const isOpen = !!expanded[tableName]
          const pkCount = tableInfo.columns.filter(c => c.is_pk).length
          const fkCount = tableInfo.columns.filter(c => c.fk).length
          return (
            <div key={tableName}>
              <button
                onClick={() => toggle(tableName)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors group"
              >
                {isOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                <Table2 className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                <span className="font-medium flex-1 text-left truncate text-sm">{tableName}</span>
                {/* FK/PK indicators on hover */}
                <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {fkCount > 0 && (
                    <span className="text-[9px] text-teal-400 flex items-center gap-0.5">
                      <Link className="w-2.5 h-2.5" />{fkCount}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Rows3 className="w-3 h-3" />
                    {tableInfo.row_count?.toLocaleString() ?? '?'}
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="ml-4 mb-1 border-l border-border/50 pl-1">
                  {tableInfo.columns.map(col => (
                    <ColumnRow key={col.name} col={col} onColumnClick={onColumnClick} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <RelationsPanel relations={relations} />
    </div>
  )
}
