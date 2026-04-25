import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  X, Database, Loader2, CheckCircle2, AlertCircle,
  Upload, FileSpreadsheet, Trash2, Pencil, Check,
  ChevronDown, ChevronUp, HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExternalConnection, UploadResult } from '@/hooks/useDatagentra'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface AddDataSourceModalProps {
  onClose: () => void
  onConnect: (params: {
    db_type: string
    host: string
    port: number
    database: string
    user: string
    password: string
    name?: string
  }) => Promise<ExternalConnection>
  onSwitchSource: (sourceId: string) => Promise<void>
  onUpload: (file: File) => Promise<UploadResult>
  onConfirm: (sessionId: string) => Promise<void>
  onRenameColumn: (sessionId: string, oldName: string, newName: string) => Promise<UploadResult>
  onDropColumn: (sessionId: string, columnName: string) => Promise<UploadResult>
}

type Tab = 'local' | 'postgres' | 'mysql'

const TYPE_BADGE: Record<string, string> = {
  INT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  FLOAT: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  VARCHAR: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  DATE: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  BOOLEAN: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
}

function getDtypeBadge(dtype: string): string {
  return TYPE_BADGE[dtype] ?? 'bg-secondary text-secondary-foreground'
}

type ColInfo = { dtype: string; null_pct: number; min?: number; max?: number; mean?: number; top_values?: string[] }

export function AddDataSourceModal({
  onClose,
  onConnect,
  onSwitchSource,
  onUpload,
  onConfirm,
  onRenameColumn,
  onDropColumn,
}: AddDataSourceModalProps) {
  const [tab, setTab] = useState<Tab>('local')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">Add Data Source</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab selector */}
        <div className="flex border-b px-5 pt-3 gap-1">
          {([
            { id: 'local' as const, icon: <HardDrive className="w-4 h-4" />, label: 'Local' },
            { id: 'postgres' as const, icon: <Database className="w-4 h-4" />, label: 'PostgreSQL' },
            { id: 'mysql' as const, icon: <Database className="w-4 h-4" />, label: 'MySQL' },
          ]).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors',
                tab === id
                  ? 'border-teal-500 text-teal-700 dark:text-teal-300'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {tab === 'local' && <LocalTab onUpload={onUpload} onConfirm={onConfirm} onSwitchSource={onSwitchSource} onRenameColumn={onRenameColumn} onDropColumn={onDropColumn} />}
          {(tab === 'postgres' || tab === 'mysql') && <RemoteTab dbType={tab} onConnect={onConnect} onSwitchSource={onSwitchSource} />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LOCAL TAB
// ---------------------------------------------------------------------------

type LocalStep = 'drop' | 'uploading' | 'editing' | 'confirming' | 'done'

function LocalTab({
  onUpload,
  onConfirm,
  onSwitchSource,
  onRenameColumn,
  onDropColumn,
}: {
  onUpload: (file: File) => Promise<UploadResult>
  onConfirm: (sessionId: string) => Promise<void>
  onSwitchSource: (sourceId: string) => Promise<void>
  onRenameColumn: (sessionId: string, oldName: string, newName: string) => Promise<UploadResult>
  onDropColumn: (sessionId: string, columnName: string) => Promise<UploadResult>
}) {
  const [step, setStep] = useState<LocalStep>('drop')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isEditable = result?.source_type === 'csv' || result?.source_type === 'xlsx'

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setStep('uploading')
    setError(null)
    setProgress(20)
    try {
      const fakeProgress = setInterval(() => setProgress((p) => Math.min(p + 15, 85)), 300)
      const data = await onUpload(file)
      clearInterval(fakeProgress)
      setProgress(100)
      setResult(data)

      if (data.source_type === 'sqlite') {
        await onConfirm(data.session_id)
        setStep('done')
      } else {
        setStep('editing')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStep('drop')
    }
  }, [onUpload, onConfirm])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/x-sqlite3': ['.db'],
      'application/octet-stream': ['.db'],
    },
    multiple: false,
    disabled: step !== 'drop',
  })

  const handleConfirm = async () => {
    if (!result) return
    setStep('confirming')
    try {
      await onConfirm(result.session_id)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate source')
      setStep('editing')
    }
  }

  const getColumnsInfo = (): Record<string, ColInfo> => {
    if (!result) return {}
    const ci = result.columns_info as Record<string, unknown>
    if (ci && typeof Object.values(ci)[0] === 'object' && 'dtype' in ((Object.values(ci)[0] as Record<string, unknown>) ?? {})) {
      return ci as Record<string, ColInfo>
    }
    const firstTable = Object.values(ci)[0]
    if (firstTable && typeof firstTable === 'object') {
      return firstTable as Record<string, ColInfo>
    }
    return {}
  }

  if (step === 'drop') {
    return (
      <div className="p-5 space-y-4">
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/20'
              : 'border-border hover:border-teal-300 hover:bg-muted/50'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium">Drop your file here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">.csv · .xlsx · .db (SQLite)</p>
          <p className="text-[11px] text-muted-foreground mt-1">Max 50 MB</p>
        </div>
        {error && (
          <div className="flex gap-2 items-start p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    )
  }

  if (step === 'uploading') {
    return (
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Uploading and analyzing...
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="h-2 rounded-full bg-teal-500 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="p-5 flex flex-col items-center gap-3 py-10">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
        <p className="text-sm font-medium text-green-700 dark:text-green-400">Source activated!</p>
      </div>
    )
  }

  // step === 'editing' | 'confirming'
  const cols = getColumnsInfo()
  const colEntries = Object.entries(cols)

  return (
    <div className="p-5 space-y-4">
      {/* File info */}
      <div className="flex items-center gap-2 text-sm">
        {result?.source_type === 'csv' || result?.source_type === 'xlsx' ? (
          <FileSpreadsheet className="w-4 h-4 text-green-500" />
        ) : (
          <Database className="w-4 h-4 text-blue-500" />
        )}
        <span className="font-medium truncate">{result?.filename}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {colEntries.length} columns
        </span>
      </div>

      {error && (
        <div className="flex gap-2 items-start p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Column editor */}
      {isEditable && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Columns ({colEntries.length})
          </p>
          <div className="divide-y rounded-lg border overflow-hidden">
            {colEntries.map(([colName, info]) => (
              <ColumnRow
                key={colName}
                name={colName}
                info={info}
                sessionId={result!.session_id}
                onRename={async (oldName, newName) => {
                  const updated = await onRenameColumn(result!.session_id, oldName, newName)
                  setResult(updated)
                }}
                onDrop={async (col) => {
                  const updated = await onDropColumn(result!.session_id, col)
                  setResult(updated)
                }}
                onError={(msg) => setError(msg)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Preview */}
      {result && result.preview_rows.length > 0 && (
        <PreviewRows rows={result.preview_rows} />
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => { setStep('drop'); setResult(null); setError(null) }}
          className="flex-1 px-4 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={step === 'confirming'}
          className="flex-1 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {step === 'confirming' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {step === 'confirming' ? 'Activating...' : 'Use this source'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// COLUMN ROW (editable rename + delete)
// ---------------------------------------------------------------------------

function ColumnRow({
  name,
  info,
  sessionId,
  onRename,
  onDrop,
  onError,
}: {
  name: string
  info: ColInfo
  sessionId: string
  onRename: (oldName: string, newName: string) => Promise<void>
  onDrop: (col: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [loading, setLoading] = useState(false)

  const commitRename = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) { setEditing(false); setDraft(name); return }
    setLoading(true)
    try {
      await onRename(name, trimmed)
      setEditing(false)
    } catch {
      onError(`Failed to rename "${name}"`)
      setDraft(name)
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = async () => {
    setLoading(true)
    try {
      await onDrop(name)
    } catch {
      onError(`Failed to drop "${name}"`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs group bg-background">
      {editing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setEditing(false); setDraft(name) } }}
            className="flex-1 min-w-0 bg-transparent border-b border-teal-400 outline-none font-mono text-sm"
            autoFocus
            disabled={loading}
          />
          <button onClick={commitRename} disabled={loading} className="text-green-600 hover:text-green-700 flex-shrink-0">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setEditing(false); setDraft(name) }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span className="font-mono text-foreground font-medium flex-1 truncate">{name}</span>
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0', getDtypeBadge(info.dtype))}>
            {info.dtype}
          </span>
          {info.null_pct > 0 && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0">{info.null_pct}% null</span>
          )}
          <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => { setEditing(true); setDraft(name) }}
              title="Rename column"
              className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={handleDrop}
              title="Delete column"
              disabled={loading}
              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PREVIEW ROWS
// ---------------------------------------------------------------------------

function PreviewRows({ rows }: { rows: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted text-xs font-medium"
      >
        Preview (first {rows.length} rows)
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="overflow-auto max-h-40">
          <table className="w-full text-[11px]">
            <thead className="bg-muted sticky top-0">
              <tr>
                {Object.keys(rows[0]).map((col) => (
                  <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t">
                  {Object.values(row).map((v, j) => (
                    <td key={j} className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                      {v === null || v === '' ? <span className="italic opacity-40">—</span> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// REMOTE TAB (PostgreSQL / MySQL)
// ---------------------------------------------------------------------------

const DEFAULT_PORTS: Record<string, number> = { postgres: 5432, mysql: 3306 }

function RemoteTab({
  dbType,
  onConnect,
  onSwitchSource,
}: {
  dbType: 'postgres' | 'mysql'
  onConnect: AddDataSourceModalProps['onConnect']
  onSwitchSource: AddDataSourceModalProps['onSwitchSource']
}) {
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(DEFAULT_PORTS[dbType])
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const canConnect = host.trim() && database.trim() && user.trim()

  const handleConnect = async () => {
    if (!canConnect) return
    setConnecting(true)
    setError(null)
    try {
      const conn = await onConnect({
        db_type: dbType,
        host: host.trim(),
        port,
        database: database.trim(),
        user: user.trim(),
        password,
        name: name.trim() || undefined,
      })
      setSuccess(true)
      setTimeout(async () => {
        await onSwitchSource(conn.id)
      }, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setConnecting(false)
    }
  }

  if (success) {
    return (
      <div className="p-5 flex flex-col items-center gap-3 py-10">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
        <p className="text-sm font-medium text-green-700 dark:text-green-400">Connected successfully!</p>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-2">
          <label className="text-sm font-medium">Host</label>
          <input
            type="text" value={host} onChange={(e) => setHost(e.target.value)}
            placeholder="localhost"
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Port</label>
          <input
            type="number" value={port} onChange={(e) => setPort(Number(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Database</label>
        <input
          type="text" value={database} onChange={(e) => setDatabase(e.target.value)}
          placeholder="my_database"
          className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">User</label>
          <input
            type="text" value={user} onChange={(e) => setUser(e.target.value)}
            placeholder="root"
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Password</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">
          Display name <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Production DB"
          className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={!canConnect || connecting}
        className={cn(
          'w-full px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2',
          canConnect && !connecting
            ? 'bg-teal-600 hover:bg-teal-700 text-white'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
      >
        {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</> : 'Connect'}
      </button>
    </div>
  )
}
