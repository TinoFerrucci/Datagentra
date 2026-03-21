import { useState, useEffect } from 'react'
import { X, Cpu, Bot, Eye, EyeOff, CheckCircle2, Loader2, AlertTriangle, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SetupStatus } from '@/hooks/useDatagentra'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface OllamaModel { name: string; size: number }
interface OpenAIModel { id: string; name: string }

interface SettingsModalProps {
  current: SetupStatus | null
  onSave: (provider: string, model: string, apiKey?: string) => Promise<void>
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '?'
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

export function SettingsModal({ current, onSave, onClose }: SettingsModalProps) {
  const [provider, setProvider] = useState<'openai' | 'ollama'>(current?.provider ?? 'openai')

  // OpenAI state
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [openaiModels, setOpenaiModels] = useState<OpenAIModel[] | null>(null)  // null = not validated yet
  const [keyError, setKeyError] = useState<string | null>(null)
  const [selectedOpenaiModel, setSelectedOpenaiModel] = useState(
    current?.provider === 'openai' ? (current.model ?? 'gpt-4o-mini') : 'gpt-4o-mini'
  )

  // Ollama state
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null)
  const [checkingOllama, setCheckingOllama] = useState(false)
  const [selectedOllamaModel, setSelectedOllamaModel] = useState(
    current?.provider === 'ollama' ? (current.model ?? '') : ''
  )

  // Save state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-load models when already configured with OpenAI
  useEffect(() => {
    if (provider === 'openai' && current?.provider === 'openai' && openaiModels === null && !apiKey.trim()) {
      fetchCurrentModels()
    }
    if (provider === 'ollama') checkOllama()
  }, [provider])

  const fetchCurrentModels = async () => {
    setValidating(true)
    setKeyError(null)
    try {
      const res = await fetch(`${API_URL}/api/openai/models/current`)
      const data = await res.json()
      if (!res.ok) {
        setKeyError(data.detail || 'Could not load models.')
        return
      }
      const list: OpenAIModel[] = data.models || []
      setOpenaiModels(list)
      // Keep the currently selected model if it's in the list
      if (!list.find(m => m.id === selectedOpenaiModel) && list.length > 0) {
        setSelectedOpenaiModel(list[0].id)
      }
    } catch {
      setKeyError('Could not reach the server.')
    } finally {
      setValidating(false)
    }
  }

  const checkOllama = async () => {
    setCheckingOllama(true)
    try {
      const res = await fetch(`${API_URL}/api/ollama/models`)
      const data = await res.json()
      setOllamaRunning(data.running)
      const models: OllamaModel[] = data.models || []
      setOllamaModels(models)
      if (!selectedOllamaModel && models.length > 0) {
        setSelectedOllamaModel(models[0].name)
      }
    } catch {
      setOllamaRunning(false)
    } finally {
      setCheckingOllama(false)
    }
  }

  const validateKey = async () => {
    setValidating(true)
    setKeyError(null)
    setOpenaiModels(null)
    try {
      const res = await fetch(`${API_URL}/api/openai/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setKeyError(data.detail || 'Invalid API key.')
        return
      }
      const list: OpenAIModel[] = data.models || []
      setOpenaiModels(list)
      setSelectedOpenaiModel(list[0]?.id ?? '')
    } catch {
      setKeyError('Could not reach the server.')
    } finally {
      setValidating(false)
    }
  }

  const handleKeyChange = (v: string) => {
    setApiKey(v)
    if (openaiModels !== null || keyError) {
      setOpenaiModels(null)
      setKeyError(null)
    }
    // If user clears the field while already configured, reload current models
    if (!v.trim() && current?.provider === 'openai') {
      fetchCurrentModels()
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (provider === 'openai') {
        // Only send the key if the user explicitly entered and validated a new one
        const key = apiKey.trim() || undefined
        await onSave(provider, selectedOpenaiModel, key)
      } else {
        await onSave(provider, selectedOllamaModel)
      }
      setSaved(true)
      setTimeout(() => { setSaved(false); onClose() }, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving configuration')
    } finally {
      setSaving(false)
    }
  }

  const looksLikeKey = apiKey.trim().startsWith('sk-') && apiKey.trim().length > 20

  // Can save:
  // - OpenAI: model selected AND (already configured with openai OR new key validated)
  // - Ollama: running AND model selected
  const canSave =
    provider === 'openai'
      ? !!selectedOpenaiModel && openaiModels !== null
      : ollamaRunning === true && !!selectedOllamaModel

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-base">LLM Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Provider toggle */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setProvider('openai')}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                  provider === 'openai'
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                    : 'border-border hover:bg-muted text-muted-foreground'
                )}
              >
                <Cpu className="w-4 h-4" />
                OpenAI
              </button>
              <button
                onClick={() => setProvider('ollama')}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                  provider === 'ollama'
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                    : 'border-border hover:bg-muted text-muted-foreground'
                )}
              >
                <Bot className="w-4 h-4" />
                Ollama
              </button>
            </div>
          </div>

          {/* ── OpenAI config ── */}
          {provider === 'openai' && (
            <div className="space-y-4">
              {/* API Key input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {current?.provider === 'openai'
                    ? 'New API Key (optional — enter to change)'
                    : 'API Key'}
                </label>
                <div className={cn(
                  'flex gap-2 items-center rounded-xl border bg-background px-3 py-2.5 focus-within:ring-2 ring-ring',
                  keyError && 'border-red-400'
                )}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => handleKeyChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeKey && !validating) validateKey() }}
                    placeholder={current?.provider === 'openai' ? '••••••••  leave blank to keep current' : 'sk-...'}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground font-mono"
                  />
                  <button onClick={() => setShowKey((s) => !s)} className="text-muted-foreground hover:text-foreground">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {keyError && <p className="text-xs text-red-600 dark:text-red-400">{keyError}</p>}
              </div>

              {/* Validate button — only when a new key is being entered */}
              {apiKey.trim() && openaiModels === null && (
                <button
                  disabled={!looksLikeKey || validating}
                  onClick={validateKey}
                  className={cn(
                    'w-full py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2',
                    looksLikeKey && !validating
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-muted text-muted-foreground cursor-not-allowed'
                  )}
                >
                  {validating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Validating...</>
                  ) : (
                    'Validate key & list models'
                  )}
                </button>
              )}

              {/* Model list — auto-loaded from stored key or after validating new key */}
              {validating && openaiModels === null && !keyError && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading models...
                </div>
              )}
              {openaiModels !== null && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Model</label>
                    {apiKey.trim() && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Key validated
                      </span>
                    )}
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {openaiModels.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedOpenaiModel(m.id)}
                        className={cn(
                          'w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition-colors text-left',
                          selectedOpenaiModel === m.id
                            ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                            : 'border-border hover:bg-muted'
                        )}
                      >
                        <span className="font-mono font-medium">{m.id}</span>
                        {selectedOpenaiModel === m.id && <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Ollama config ── */}
          {provider === 'ollama' && (
            <div className="space-y-4">
              <div className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium',
                ollamaRunning === null ? 'bg-muted text-muted-foreground' :
                ollamaRunning ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' :
                'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
              )}>
                {checkingOllama ? <Loader2 className="w-4 h-4 animate-spin" /> :
                 ollamaRunning ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                <span className="flex-1">
                  {checkingOllama ? 'Checking...' :
                   ollamaRunning ? `${ollamaModels.length} model${ollamaModels.length !== 1 ? 's' : ''} available` :
                   'Ollama not reachable'}
                </span>
                <button onClick={checkOllama} disabled={checkingOllama} className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10">
                  <RefreshCw className={cn('w-3.5 h-3.5', checkingOllama && 'animate-spin')} />
                </button>
              </div>

              {ollamaRunning && ollamaModels.length > 0 && (
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {ollamaModels.map((m) => (
                    <button
                      key={m.name}
                      onClick={() => setSelectedOllamaModel(m.name)}
                      className={cn(
                        'w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition-colors text-left',
                        selectedOllamaModel === m.name
                          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                          : 'border-border hover:bg-muted'
                      )}
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="text-xs text-muted-foreground">{formatBytes(m.size)}</span>
                    </button>
                  ))}
                </div>
              )}

              {ollamaRunning === false && (
                <div className="flex gap-2 rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 px-3 py-2.5 text-xs text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>Ollama is not running. Start it and click Refresh.</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={cn(
              'px-5 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2',
              canSave && !saving
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : saved ? (
              <><CheckCircle2 className="w-4 h-4" /> Saved!</>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
