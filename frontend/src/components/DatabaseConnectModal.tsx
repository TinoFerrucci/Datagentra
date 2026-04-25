import { useState } from 'react'
import { X, Database, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExternalConnection } from '@/hooks/useDatagentra'

interface DatabaseConnectModalProps {
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
}

const DEFAULT_PORTS: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
}

export function DatabaseConnectModal({ onClose, onConnect, onSwitchSource }: DatabaseConnectModalProps) {
  const [dbType, setDbType] = useState<'postgres' | 'mysql'>('postgres')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState(5432)
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleDbTypeChange = (type: 'postgres' | 'mysql') => {
    setDbType(type)
    setPort(DEFAULT_PORTS[type])
  }

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
        onClose()
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">Connect Database</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="px-5 py-10 flex flex-col items-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Connected successfully!</p>
          </div>
        ) : (
          <div className="px-5 py-5 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* DB type toggle */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Database Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleDbTypeChange('postgres')}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                    dbType === 'postgres'
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300'
                      : 'border-border hover:bg-muted text-muted-foreground'
                  )}
                >
                  <Database className="w-4 h-4" />
                  PostgreSQL
                </button>
                <button
                  onClick={() => handleDbTypeChange('mysql')}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                    dbType === 'mysql'
                      ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300'
                      : 'border-border hover:bg-muted text-muted-foreground'
                  )}
                >
                  <Database className="w-4 h-4" />
                  MySQL
                </button>
              </div>
            </div>

            {/* Host + Port */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <label className="text-sm font-medium">Host</label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="localhost"
                  className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Port</label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
                />
              </div>
            </div>

            {/* Database name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Database</label>
              <input
                type="text"
                value={database}
                onChange={(e) => setDatabase(e.target.value)}
                placeholder="my_database"
                className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
              />
            </div>

            {/* User + Password */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">User</label>
                <input
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="root"
                  className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 rounded-xl border bg-background text-sm outline-none focus:ring-2 ring-ring font-mono"
                />
              </div>
            </div>

            {/* Display name (optional) */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Display name <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
          </div>
        )}

        {!success && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConnect}
              disabled={!canConnect || connecting}
              className={cn(
                'px-5 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2',
                canConnect && !connecting
                  ? 'bg-teal-600 hover:bg-teal-700 text-white'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {connecting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Connecting...</>
              ) : (
                'Connect'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
