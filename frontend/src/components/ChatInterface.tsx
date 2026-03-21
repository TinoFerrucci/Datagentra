import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Loader2, Bot, User, ChevronDown, ChevronUp, Database, Cpu, Trash2 } from 'lucide-react'
import { SyntaxHighlighter } from './SyntaxHighlighter'
import { DynamicChart } from './charts/DynamicChart'
import type { ChatMessage, LLMInfo } from '@/hooks/useDatagentra'
import { cn } from '@/lib/utils'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  isLoading: boolean
  onAsk: (question: string) => void
  onClear: () => void
  llmInfo: LLMInfo | null
  activeSourceName: string
}

function AgentMessage({ message }: { message: ChatMessage }) {
  const [showSql, setShowSql] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const r = message.response

  if (message.type === 'error') {
    return (
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-400 text-sm">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
      </div>
      <div className="flex-1 space-y-4">
        {/* Badges */}
        {r && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border">
              <Database className="w-3 h-3" />
              {r.source === 'postgres_default' ? 'PostgreSQL' : r.source}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Cpu className="w-3 h-3" />
              {r.llm_provider === 'ollama' ? 'Local' : 'OpenAI'} · {r.llm_model}
            </span>
          </div>
        )}

        {/* Summary */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>

        {/* Chart */}
        {r && r.rows.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <DynamicChart response={r} />
          </div>
        )}

        {/* SQL accordion */}
        {r && (
          <div className="rounded-lg border overflow-hidden">
            <button
              onClick={() => setShowSql(!showSql)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/70 transition-colors"
            >
              <span className="font-mono text-xs text-muted-foreground">SQL utilizado</span>
              {showSql ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showSql && (
              <div className="text-xs">
                <SyntaxHighlighter code={r.sql} language="sql" />
              </div>
            )}
          </div>
        )}

        {/* Data table */}
        {r && r.rows.length > 0 && (
          <div className="rounded-lg border overflow-hidden">
            <button
              onClick={() => setShowTable(!showTable)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/70 transition-colors"
            >
              <span className="text-xs text-muted-foreground">
                Datos crudos ({r.rows.length} filas)
              </span>
              {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showTable && (
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      {r.columns.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.slice(0, 100).map((row, ri) => (
                      <tr key={ri} className="border-t hover:bg-muted/30">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                            {cell === null ? <span className="italic opacity-50">null</span> : String(cell)}
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
      </div>
    </div>
  )
}

export function ChatInterface({
  messages,
  isLoading,
  onAsk,
  onClear,
  llmInfo,
  activeSourceName,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSubmit = () => {
    const q = input.trim()
    if (!q || isLoading) return
    setInput('')
    onAsk(q)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const suggestions = [
    'Top 10 products by revenue',
    'Monthly sales trend in 2024',
    'Orders by status',
    'Most active customers',
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-lg font-semibold">Datagentra</h1>
          <p className="text-xs text-muted-foreground">
            {activeSourceName} {llmInfo && `· ${llmInfo.provider === 'ollama' ? 'Local' : 'OpenAI'} / ${llmInfo.model}`}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Bot className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-1">Ask anything about your data</h2>
              <p className="text-sm text-muted-foreground">Write a question in natural language and get SQL, charts, and insights.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="text-left px-4 py-3 rounded-xl border bg-card hover:bg-muted text-sm transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.type === 'user' ? (
            <div key={msg.id} className="flex gap-3 justify-end">
              <div className="max-w-[70%] rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm">
                {msg.content}
              </div>
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
            </div>
          ) : (
            <AgentMessage key={msg.id} message={msg} />
          )
        )}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t">
        <div className="flex gap-2 items-end rounded-xl border bg-card focus-within:ring-2 ring-ring px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your data..."
            rows={1}
            className="flex-1 bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground min-h-[24px] max-h-40"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${el.scrollHeight}px`
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center transition-colors flex-shrink-0',
              input.trim() && !isLoading
                ? 'bg-primary text-primary-foreground hover:opacity-90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}
