import { useState, useEffect } from 'react'
import { Bot, Cpu, Wifi, WifiOff, RefreshCw, AlertTriangle, CheckCircle2, Eye, EyeOff, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface OllamaModel {
  name: string
  size: number
}

interface OpenAIModel {
  id: string
  name: string
}

interface SetupWizardProps {
  onSave: (provider: string, model: string, apiKey?: string) => Promise<void>
}

type Provider = 'openai' | 'ollama'
type Step = 'provider' | 'configure'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '?'
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

function ramEstimate(modelName: string): string {
  const name = modelName.toLowerCase()
  if (name.includes('70b') || name.includes('72b')) return '~48 GB RAM'
  if (name.includes('34b') || name.includes('32b')) return '~20 GB RAM'
  if (name.includes('13b') || name.includes('14b')) return '~10 GB RAM'
  if (name.includes('7b') || name.includes('8b')) return '~6 GB RAM'
  if (name.includes('3b') || name.includes('1b') || name.includes('2b')) return '~3 GB RAM'
  return 'RAM varies'
}

// ---------------------------------------------------------------------------
// Ollama step
// ---------------------------------------------------------------------------

function OllamaStep({
  onSelect,
}: {
  onSelect: (model: string) => void
}) {
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const checkOllama = async () => {
    setChecking(true)
    try {
      const res = await fetch(`${API_URL}/api/ollama/models`)
      const data = await res.json()
      setOllamaRunning(data.running)
      setModels(data.models || [])
      if (data.models?.length > 0) setSelected(data.models[0].name)
    } catch {
      setOllamaRunning(false)
      setModels([])
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    checkOllama()
  }, [])

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium',
        ollamaRunning === null ? 'bg-muted text-muted-foreground' :
        ollamaRunning ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' :
        'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
      )}>
        {checking ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : ollamaRunning ? (
          <Wifi className="w-4 h-4" />
        ) : (
          <WifiOff className="w-4 h-4" />
        )}
        <span className="flex-1">
          {checking ? 'Checking Ollama...' :
           ollamaRunning ? `Ollama is running — ${models.length} model${models.length !== 1 ? 's' : ''} available` :
           'Ollama is not running or not reachable'}
        </span>
        <button
          onClick={checkOllama}
          disabled={checking}
          className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', checking && 'animate-spin')} />
        </button>
      </div>

      {/* Not running guide */}
      {ollamaRunning === false && (
        <div className="rounded-xl border bg-muted/50 p-4 text-sm space-y-3">
          <p className="font-semibold text-foreground">How to start Ollama</p>
          <ol className="space-y-2 text-muted-foreground list-decimal list-inside">
            <li>
              Install Ollama if you haven't:{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                curl -fsSL https://ollama.com/install.sh | sh
              </code>
            </li>
            <li>
              Pull a model (recommended for SQL):
              <pre className="mt-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto">
                ollama pull qwen2.5:7b
              </pre>
            </li>
            <li>
              Ollama runs automatically after install. Click <strong>Refresh</strong> above once it's ready.
            </li>
          </ol>
        </div>
      )}

      {/* Model list */}
      {ollamaRunning && models.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Select a model</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {models.map((m) => (
              <button
                key={m.name}
                onClick={() => setSelected(m.name)}
                className={cn(
                  'w-full flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors text-left',
                  selected === m.name
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-border hover:bg-muted'
                )}
              >
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(m.size)} on disk</p>
                </div>
                <span className="text-xs text-muted-foreground font-medium">{ramEstimate(m.name)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {ollamaRunning && models.length === 0 && (
        <div className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">
          No models found. Pull one first:
          <pre className="mt-2 bg-muted rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto">
            ollama pull qwen2.5:7b
          </pre>
          Then click Refresh.
        </div>
      )}

      {/* Hardware disclaimer */}
      <div className="flex gap-2.5 rounded-xl border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 text-xs text-yellow-700 dark:text-yellow-400">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">Hardware requirements</p>
          <p>Model performance depends on your hardware. Small models (3–7B) need 4–8 GB RAM, large models (13B+) need 16 GB+. GPU acceleration (CUDA/Metal) greatly improves speed.</p>
        </div>
      </div>

      <button
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
        className={cn(
          'w-full py-3 rounded-xl font-semibold text-sm transition-colors',
          selected
            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
      >
        Use {selected ?? 'selected model'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OpenAI step  — phase 1: enter key  →  phase 2: pick model from real API
// ---------------------------------------------------------------------------

function OpenAIStep({ onSelect }: { onSelect: (model: string, apiKey: string) => void }) {
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [validating, setValidating] = useState(false)
  const [models, setModels] = useState<OpenAIModel[] | null>(null)   // null = not yet validated
  const [selected, setSelected] = useState<string>('')
  const [keyError, setKeyError] = useState<string | null>(null)

  const looksLikeKey = apiKey.trim().startsWith('sk-') && apiKey.trim().length > 20

  const validate = async () => {
    setValidating(true)
    setKeyError(null)
    setModels(null)
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
      setModels(list)
      setSelected(list[0]?.id ?? '')
    } catch {
      setKeyError('Could not reach the server. Check your connection.')
    } finally {
      setValidating(false)
    }
  }

  // Reset validation when key changes
  const handleKeyChange = (v: string) => {
    setApiKey(v)
    if (models !== null || keyError) {
      setModels(null)
      setKeyError(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* API Key input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">OpenAI API Key</label>
        <div className={cn(
          'flex gap-2 items-center rounded-xl border bg-card px-3 py-2.5 focus-within:ring-2 ring-ring',
          keyError && 'border-red-400'
        )}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => handleKeyChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeKey && !validating) validate() }}
            placeholder="sk-..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground font-mono"
            autoFocus
          />
          <button
            onClick={() => setShowKey((s) => !s)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {keyError ? (
          <p className="text-xs text-red-600 dark:text-red-400">{keyError}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Get your key at{' '}
            <span className="font-mono text-indigo-600 dark:text-indigo-400">platform.openai.com/api-keys</span>
          </p>
        )}
      </div>

      {/* Validate button — shown while no models yet */}
      {models === null && (
        <button
          disabled={!looksLikeKey || validating}
          onClick={validate}
          className={cn(
            'w-full py-3 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2',
            looksLikeKey && !validating
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {validating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Validating key...</>
          ) : (
            'Validate key & list models'
          )}
        </button>
      )}

      {/* Model list — shown after successful validation */}
      {models !== null && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Key valid — {models.length} models available
          </div>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m.id)}
                className={cn(
                  'w-full flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm transition-colors text-left',
                  selected === m.id
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
                    : 'border-border hover:bg-muted'
                )}
              >
                <span className="font-mono font-medium">{m.id}</span>
                {selected === m.id && <CheckCircle2 className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
              </button>
            ))}
          </div>

          <button
            disabled={!selected}
            onClick={() => selected && onSelect(selected, apiKey.trim())}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
          >
            Use {selected}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function SetupWizard({ onSave }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('provider')
  const [provider, setProvider] = useState<Provider | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleProviderSelect = (p: Provider) => {
    setProvider(p)
    setStep('configure')
  }

  const handleSave = async (model: string, apiKey?: string) => {
    if (!provider) return
    setSaving(true)
    setError(null)
    try {
      await onSave(provider, model, apiKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error saving configuration')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 px-6 py-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold">Welcome to Datagentra</h1>
          </div>
          <p className="text-indigo-200 text-sm">
            {step === 'provider'
              ? 'Choose how you want to power the AI agent.'
              : provider === 'openai'
              ? 'Connect your OpenAI account.'
              : 'Configure your local Ollama instance.'}
          </p>
          {/* Step dots */}
          <div className="flex gap-1.5 mt-4">
            {['provider', 'configure'].map((s, i) => (
              <div
                key={s}
                className={cn(
                  'h-1 rounded-full transition-all',
                  s === step ? 'w-6 bg-white' : i < ['provider', 'configure'].indexOf(step) ? 'w-3 bg-white/60' : 'w-3 bg-white/30'
                )}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {saving ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-sm font-medium">Saving configuration...</p>
            </div>
          ) : step === 'provider' ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Select your preferred LLM provider. You can change this later in Settings.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {/* OpenAI */}
                <button
                  onClick={() => handleProviderSelect('openai')}
                  className="flex flex-col items-start gap-3 rounded-2xl border-2 border-border hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 p-5 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">OpenAI</p>
                    <p className="text-xs text-muted-foreground">Cloud API. Best quality, requires API key.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-indigo-600 mt-auto self-end" />
                </button>

                {/* Ollama */}
                <button
                  onClick={() => handleProviderSelect('ollama')}
                  className="flex flex-col items-start gap-3 rounded-2xl border-2 border-border hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 p-5 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">Ollama</p>
                    <p className="text-xs text-muted-foreground">Runs locally. Free, private, no internet needed.</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-indigo-600 mt-auto self-end" />
                </button>
              </div>
            </div>
          ) : provider === 'ollama' ? (
            <OllamaStep onSelect={(model) => handleSave(model)} />
          ) : (
            <OpenAIStep onSelect={(model, key) => handleSave(model, key)} />
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Back button */}
        {step === 'configure' && !saving && (
          <div className="px-6 pb-5 pt-0">
            <button
              onClick={() => setStep('provider')}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back to provider selection
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
