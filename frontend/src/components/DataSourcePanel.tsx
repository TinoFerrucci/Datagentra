import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, CheckCircle, AlertCircle, Loader2, FileSpreadsheet, Database, Wand2, ChevronDown, ChevronUp } from 'lucide-react'
import type { UploadResult } from '@/hooks/useDatagentra'
import { cn } from '@/lib/utils'

interface DataSourcePanelProps {
  onUpload: (file: File) => Promise<UploadResult>
  onFix: (sessionId: string, prompt: string) => Promise<UploadResult>
  onConfirm: (sessionId: string) => Promise<void>
}

type PanelState = 'idle' | 'uploading' | 'preview' | 'confirmed' | 'error'

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

export function DataSourcePanel({ onUpload, onFix, onConfirm }: DataSourcePanelProps) {
  const [state, setState] = useState<PanelState>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fixPrompt, setFixPrompt] = useState('')
  const [isFixing, setIsFixing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [showSchema, setShowSchema] = useState(true)
  const [showPreview, setShowPreview] = useState(false)

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setState('uploading')
    setError(null)
    setProgress(20)

    try {
      const fakeProgress = setInterval(() => {
        setProgress((p) => Math.min(p + 15, 85))
      }, 300)
      const data = await onUpload(file)
      clearInterval(fakeProgress)
      setProgress(100)
      setResult(data)
      setState('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }, [onUpload])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'application/x-sqlite3': ['.db'], 'application/octet-stream': ['.db'] },
    multiple: false,
    disabled: state === 'uploading' || state === 'preview' || state === 'confirmed',
  })

  const handleFix = async () => {
    if (!result || !fixPrompt.trim()) return
    setIsFixing(true)
    try {
      const updated = await onFix(result.session_id, fixPrompt)
      setResult(updated)
      setFixPrompt('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fix failed')
    } finally {
      setIsFixing(false)
    }
  }

  const handleConfirm = async () => {
    if (!result) return
    setIsConfirming(true)
    try {
      await onConfirm(result.session_id)
      setState('confirmed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirm failed')
    } finally {
      setIsConfirming(false)
    }
  }

  const reset = () => {
    setState('idle')
    setResult(null)
    setError(null)
    setProgress(0)
    setFixPrompt('')
  }

  // Get columns info (handle both CSV flat and SQLite nested)
  const getColumnsInfo = (): Record<string, { dtype: string; null_pct: number }> => {
    if (!result) return {}
    const ci = result.columns_info as Record<string, unknown>
    // Flat (CSV)
    if (ci && typeof Object.values(ci)[0] === 'object' && 'dtype' in ((Object.values(ci)[0] as Record<string, unknown>) ?? {})) {
      return ci as Record<string, { dtype: string; null_pct: number }>
    }
    // Nested (SQLite): flatten first table
    const firstTable = Object.values(ci)[0]
    if (firstTable && typeof firstTable === 'object') {
      return firstTable as Record<string, { dtype: string; null_pct: number }>
    }
    return {}
  }

  return (
    <div className="p-4 space-y-4">
      {/* Drop zone */}
      {state === 'idle' || state === 'error' ? (
        <>
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
              isDragActive
                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20'
                : 'border-border hover:border-indigo-300 hover:bg-muted/50'
            )}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drop CSV or SQLite here</p>
            <p className="text-xs text-muted-foreground mt-1">Max {50}MB · .csv · .db</p>
          </div>
          {state === 'error' && error && (
            <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </>
      ) : null}

      {/* Upload progress */}
      {state === 'uploading' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading and analyzing...
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="h-2 rounded-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Confirmed */}
      {state === 'confirmed' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Source activated! You can now query it.</span>
          </div>
          <button onClick={reset} className="w-full text-xs text-muted-foreground hover:text-foreground underline">
            Upload another file
          </button>
        </div>
      )}

      {/* Preview state */}
      {state === 'preview' && result && (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center gap-2 text-sm">
            {result.source_type === 'csv' ? (
              <FileSpreadsheet className="w-4 h-4 text-green-500" />
            ) : (
              <Database className="w-4 h-4 text-blue-500" />
            )}
            <span className="font-medium truncate">{result.filename}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {result.table_count} {result.source_type === 'csv' ? 'cols' : 'table(s)'}
            </span>
          </div>

          {/* Schema */}
          <div className="rounded-lg border overflow-hidden">
            <button
              onClick={() => setShowSchema(!showSchema)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted text-xs font-medium"
            >
              Schema
              {showSchema ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showSchema && (
              <div className="divide-y max-h-48 overflow-y-auto">
                {Object.entries(getColumnsInfo()).map(([col, info]) => (
                  <div key={col} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span className="font-mono text-muted-foreground flex-1 truncate">{col}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', getDtypeBadge(info.dtype))}>
                      {info.dtype}
                    </span>
                    {info.null_pct > 0 && (
                      <span className="text-muted-foreground">{info.null_pct}% null</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview rows */}
          {result.preview_rows.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="w-full flex items-center justify-between px-3 py-2 bg-muted text-xs font-medium"
              >
                Preview (first {result.preview_rows.length} rows)
                {showPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showPreview && (
                <div className="overflow-auto max-h-48">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {Object.keys(result.preview_rows[0]).map((col) => (
                          <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview_rows.map((row, i) => (
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
          )}

          {/* Fix prompt */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Wand2 className="w-3.5 h-3.5" />
              Adjust data (optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={fixPrompt}
                onChange={(e) => setFixPrompt(e.target.value)}
                placeholder='e.g. "rename col1 to revenue"'
                className="flex-1 px-3 py-2 rounded-lg border bg-background text-xs outline-none focus:ring-2 ring-ring"
                onKeyDown={(e) => e.key === 'Enter' && handleFix()}
              />
              <button
                onClick={handleFix}
                disabled={!fixPrompt.trim() || isFixing}
                className="px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/70 text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {isFixing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={reset}
              className="flex-1 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConfirming}
              className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isConfirming ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                'Use this source'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
