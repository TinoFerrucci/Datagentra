import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Send, Loader2, Bot, User, ChevronDown, ChevronUp,
  Database, Cpu, Plus, Copy, Check, Download, Sparkles, ImageDown, FileText,
} from 'lucide-react'
import { SyntaxHighlighter } from './SyntaxHighlighter'
import { DynamicChart } from './charts/DynamicChart'
import type { AgentResponse, ChatMessage, LLMInfo } from '@/hooks/useDatagentra'
import { cn } from '@/lib/utils'

interface ChatInterfaceProps {
  messages: ChatMessage[]
  isLoading: boolean
  onAsk: (question: string) => void
  onNew: () => void
  llmInfo: LLMInfo | null
  activeSourceName: string
  suggestions: string[]
  onFetchSuggestions: () => Promise<void>
  conversationTitle?: string
}

function exportCsv(columns: string[], rows: (string | number | null)[][], filename = 'datagentra_export') {
  const escape = (v: string | number | null) => {
    if (v === null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const csv = [columns.join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportConversationMd(messages: ChatMessage[], title: string) {
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push(`_Exported on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}_`)
  lines.push('')

  let questionNum = 0
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.type === 'user') {
      questionNum++
      lines.push(`## Question ${questionNum}`)
      lines.push('')
      lines.push(`**${msg.content}**`)
      lines.push('')
    } else if (msg.type === 'agent' && msg.response) {
      const r = msg.response
      if (r.sql) {
        lines.push('```sql')
        lines.push(r.sql)
        lines.push('```')
        lines.push('')
      }
      if (msg.content) {
        lines.push(msg.content)
        lines.push('')
      }
      if (r.columns && r.rows && r.rows.length > 0) {
        const MAX_ROWS = 10
        lines.push('| ' + r.columns.join(' | ') + ' |')
        lines.push('| ' + r.columns.map(() => '---').join(' | ') + ' |')
        r.rows.slice(0, MAX_ROWS).forEach((row) => {
          lines.push('| ' + row.map((c) => (c === null ? '' : String(c).replace(/\|/g, '\\|'))).join(' | ') + ' |')
        })
        if (r.rows.length > MAX_ROWS) {
          lines.push('')
          lines.push(`_... and ${r.rows.length - MAX_ROWS} more rows_`)
        }
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    } else if (msg.type === 'error') {
      lines.push(`> **Error:** ${msg.content}`)
      lines.push('')
    }
  }

  const md = lines.join('\n')
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handle}
      title="Copy SQL"
      className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

function AgentMessage({ message }: { message: ChatMessage }) {
  const [showSql, setShowSql] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [downloadingChart, setDownloadingChart] = useState(false)
  const chartRef = useRef<HTMLDivElement>(null)
  const r = message.response

  const handleDownloadChart = async () => {
    if (!chartRef.current) return
    setDownloadingChart(true)
    try {
      const { toPng } = await import('html-to-image')
      // CSS variables like hsl(var(--card)) resolve to transparent in getComputedStyle on the element.
      // Read the variable from :root directly to get the actual resolved value.
      const cardHsl = getComputedStyle(document.documentElement).getPropertyValue('--card').trim()
      const bg = cardHsl ? `hsl(${cardHsl})` : '#ffffff'
      const dataUrl = await toPng(chartRef.current, {
        pixelRatio: 2,
        backgroundColor: bg,
        cacheBust: true,
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `chart_${Date.now()}.png`
      a.click()
    } catch (e) {
      console.error('Chart export failed:', e)
    } finally {
      setDownloadingChart(false)
    }
  }

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
      <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-4 h-4 text-teal-600 dark:text-teal-400" />
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Badges */}
        {r?.source && (
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border">
              <Database className="w-3 h-3" />
              {r.source === 'sqlite_default' ? 'E-commerce' : r.source === 'postgres_default' ? 'PostgreSQL' : r.source}
            </span>
            {r.llm_provider && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                <Cpu className="w-3 h-3" />
                {r.llm_provider === 'ollama' ? 'Local' : 'OpenAI'} · {r.llm_model}
              </span>
            )}
          </div>
        )}

        {/* Streaming step indicator */}
        {message.isStreaming && message.streamingStep && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span>{message.streamingStep}</span>
          </div>
        )}

        {/* Summary */}
        {message.content && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
            {message.isStreaming && (
              <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-middle opacity-70" />
            )}
          </div>
        )}

        {/* Chart */}
        {r?.rows && r.rows.length > 0 && r.chart_type && r.chart_config && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-end px-3 pt-2">
              <button
                onClick={handleDownloadChart}
                disabled={downloadingChart}
                title="Download chart as PNG"
                className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {downloadingChart
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ImageDown className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div ref={chartRef} className="p-4 pt-1 bg-card">
              <DynamicChart response={r as AgentResponse} />
            </div>
          </div>
        )}

        {/* SQL accordion */}
        {r?.sql && (
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center bg-muted">
              <button
                onClick={() => setShowSql(!showSql)}
                className="flex-1 flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/70 transition-colors"
              >
                <span className="font-mono text-xs text-muted-foreground">SQL used</span>
                {showSql ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <div className="px-2">
                <CopyButton text={r.sql} />
              </div>
            </div>
            {showSql && (
              <div className="text-xs">
                <SyntaxHighlighter code={r.sql} language="sql" />
              </div>
            )}
          </div>
        )}

        {/* Data table */}
        {r?.rows && r.rows.length > 0 && r.columns && (
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center bg-muted">
              <button
                onClick={() => setShowTable(!showTable)}
                className="flex-1 flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/70 transition-colors"
              >
                <span className="text-xs text-muted-foreground">
                  Raw data ({r.rows.length} rows)
                </span>
                {showTable ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                onClick={() => exportCsv(r.columns!, r.rows)}
                title="Export CSV"
                className="px-2 py-2 hover:bg-muted/70 transition-colors text-muted-foreground hover:text-foreground"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
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
  onNew,
  llmInfo,
  activeSourceName,
  suggestions,
  onFetchSuggestions,
  conversationTitle,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false)
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

  const handleFetchSuggestions = async () => {
    setFetchingSuggestions(true)
    await onFetchSuggestions()
    setFetchingSuggestions(false)
  }

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
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => exportConversationMd(messages, conversationTitle || 'Conversation')}
              title="Export conversation as Markdown"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground border"
            >
              <FileText className="w-3.5 h-3.5" />
              Export
            </button>
          )}
          <button
            onClick={onNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground border"
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <Bot className="w-8 h-8 text-teal-600 dark:text-teal-400" />
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
            <button
              onClick={handleFetchSuggestions}
              disabled={fetchingSuggestions}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {fetchingSuggestions
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />}
              {fetchingSuggestions ? 'Generating...' : 'Generate from schema'}
            </button>
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
            <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-teal-600 dark:text-teal-400" />
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
