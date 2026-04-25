import { useState, useCallback, useEffect } from 'react'
import { logger } from '@/lib/logger'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const DEFAULT_SUGGESTIONS = [
  'Top 10 products by revenue',
  'Monthly sales trend in 2024',
  'Orders by status',
  'Most active customers',
]

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartConfig {
  x_key: string
  y_keys: string[]
}

export interface QueryPlan {
  intent: 'ranking' | 'distribution' | 'trend' | 'metric' | 'listing' | 'comparison' | 'exploration'
  row_limit: number | null
  needs_chart: boolean
  chart_hint: 'bar' | 'line' | 'area' | 'pie' | 'metric' | 'scatter' | 'table' | null
  user_wants_extensive: boolean
  reasoning: string
}

export interface AgentResponse {
  question: string
  sql: string
  columns: string[]
  rows: (string | number | null)[][]
  summary: string
  chart_type: 'bar' | 'line' | 'area' | 'pie' | 'metric' | 'scatter' | 'table'
  chart_config: ChartConfig
  chart_title: string
  plan?: QueryPlan
  source: string
  llm_provider: string
  llm_model: string
}

export interface ChatMessage {
  id: string
  type: 'user' | 'agent' | 'error'
  content: string
  response?: AgentResponse
  timestamp: Date
  isStreaming?: boolean
  streamingStep?: string
}

export interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
}

export interface DataSource {
  id: string
  type: string
  name: string
  active: boolean
}

export interface ExternalConnection {
  id: string
  type: string
  name: string
  host: string
  port: number
  database: string
  table_count: number
}

export interface UploadResult {
  session_id: string
  source_type: string
  filename: string
  table_count: number
  schema_analysis: Record<string, unknown>
  preview_rows: Record<string, unknown>[]
  columns_info: Record<string, unknown>
}

export interface SchemaColumn {
  name: string
  type: string
  nullable: boolean
  is_pk?: boolean
  fk?: { ref_table: string; ref_column: string }
}

export interface SchemaTable {
  columns: SchemaColumn[]
  row_count: number
}

export interface LLMInfo {
  provider: string
  model: string
}

export interface SetupStatus {
  configured: boolean
  provider: 'openai' | 'ollama'
  model: string
}

export interface OllamaModel {
  name: string
  size: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiMessageToChat(m: Record<string, unknown>): ChatMessage {
  return {
    id: m.id as string,
    type: m.type as ChatMessage['type'],
    content: m.content as string,
    response: m.response as AgentResponse | undefined,
    timestamp: new Date(m.timestamp as string),
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDatagentra() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [activeSource, setActiveSourceState] = useState<{ id: string; type: string } | null>(null)
  const [schema, setSchema] = useState<Record<string, SchemaTable>>({})
  const [llmInfo, setLlmInfo] = useState<LLMInfo | null>(null)
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS)

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`)
      const data = await res.json()
      setConversations(data.conversations)
      return data.conversations as Conversation[]
    } catch (err) {
      logger.error('fetchConversations failed', { error: String(err) })
      return []
    }
  }, [])

  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${convId}`)
      if (!res.ok) return
      const data = await res.json()
      setActiveConversationId(convId)
      setMessages((data.messages as Record<string, unknown>[]).map(apiMessageToChat))
      logger.info('Conversation loaded', { convId, messageCount: data.messages?.length })
    } catch (err) {
      logger.error('loadConversation failed', { convId, error: String(err) })
    }
  }, [])

  const createConversation = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`, { method: 'POST' })
      const data: Conversation = await res.json()
      setConversations((prev) => [data, ...prev])
      setActiveConversationId(data.id)
      setMessages([])
      logger.info('Conversation created', { convId: data.id })
      return data
    } catch (err) {
      logger.error('createConversation failed', { error: String(err) })
      return null
    }
  }, [])

  const deleteConversation = useCallback(async (convId: string) => {
    try {
      await fetch(`${API_URL}/api/conversations/${convId}`, { method: 'DELETE' })
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (activeConversationId === convId) {
        setActiveConversationId(null)
        setMessages([])
      }
      logger.info('Conversation deleted', { convId })
    } catch (err) {
      logger.error('deleteConversation failed', { convId, error: String(err) })
    }
  }, [activeConversationId])

  const renameConversation = useCallback(async (convId: string, title: string) => {
    try {
      await fetch(`${API_URL}/api/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title } : c))
      )
    } catch {
      // ignore
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Data sources / schema
  // ---------------------------------------------------------------------------

  const fetchDataSources = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/datasource`)
      const data = await res.json()
      setDataSources(data.sources)
      setActiveSourceState(data.active)
    } catch (err) {
      logger.error('fetchDataSources failed', { error: String(err) })
    }
  }, [])

  const fetchSchema = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/schema`)
      const data = await res.json()
      setSchema(data.tables || {})
    } catch {
      // ignore
    }
  }, [])

  const fetchLLMInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/llm-info`)
      const data = await res.json()
      setLlmInfo(data)
    } catch {
      // ignore
    }
  }, [])

  const fetchSetupStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/setup/status`)
      const data: SetupStatus = await res.json()
      setSetupStatus(data)
    } catch {
      // ignore
    }
  }, [])

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/suggest`)
      if (!res.ok) {
        let detail = `Request failed (${res.status})`
        try {
          const body = await res.json()
          if (body?.detail) detail = body.detail
        } catch {
          // no JSON body
        }
        if (res.status === 401) {
          const err = new Error(detail) as Error & { status?: number }
          err.status = 401
          throw err
        }
        logger.warn('fetchSuggestions non-OK, using defaults', { status: res.status, detail })
        return
      }
      const data = await res.json()
      if (data.questions?.length > 0) setSuggestions(data.questions)
    } catch (err) {
      logger.warn('fetchSuggestions failed', { error: String(err) })
      throw err
    }
  }, [])

  const saveSetup = useCallback(async (provider: string, model: string, apiKey?: string) => {
    const res = await fetch(`${API_URL}/api/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model, ...(apiKey ? { api_key: apiKey } : {}) }),
    })
    if (!res.ok) throw new Error('Failed to save configuration')
    await Promise.all([fetchSetupStatus(), fetchLLMInfo()])
  }, [fetchSetupStatus, fetchLLMInfo])

  // On mount: load everything, then open the most recent conversation
  useEffect(() => {
    fetchSetupStatus()
    Promise.all([fetchDataSources(), fetchSchema(), fetchLLMInfo(), fetchConversations()]).then(
      ([, , , convs]) => {
        if (convs && convs.length > 0) {
          loadConversation(convs[0].id)
        }
      }
    )
  }, [fetchDataSources, fetchSchema, fetchLLMInfo, fetchConversations, loadConversation, fetchSetupStatus])

  // ---------------------------------------------------------------------------
  // Ask
  // ---------------------------------------------------------------------------

  const ask = useCallback(async (question: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: question,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)

    const agentId = crypto.randomUUID()
    const t0 = performance.now()
    logger.info('Ask started', { question, convId: activeConversationId, source: activeSource?.id })

    try {
      const body: Record<string, unknown> = { question }
      if (activeSource && activeSource.type !== 'sqlite' && activeSource.type !== 'postgres') {
        body.session_id = activeSource.id
      }
      if (activeConversationId) {
        body.conversation_id = activeConversationId
      }

      const res = await fetch(`${API_URL}/api/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Unknown error')
      }

      // Connection established — replace spinner with streaming agent message
      setIsLoading(false)
      setMessages((prev) => [...prev, {
        id: agentId,
        type: 'agent',
        content: '',
        isStreaming: true,
        streamingStep: 'Planning query...',
        timestamp: new Date(),
      }])

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let summary = ''
      let partialResponse: Partial<AgentResponse> = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          const event = JSON.parse(trimmed)

          if (event.event === 'plan') {
            logger.debug('Stream: plan received', { plan: event.plan })
            partialResponse = { ...partialResponse, plan: event.plan }
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, streamingStep: 'Generating SQL...', response: partialResponse as AgentResponse }
              : m))
          } else if (event.event === 'sql') {
            logger.debug('Stream: sql received', { sql: event.sql?.slice(0, 120) })
            partialResponse = { ...partialResponse, sql: event.sql }
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, streamingStep: 'Running query...', response: partialResponse as AgentResponse }
              : m))
          } else if (event.event === 'data') {
            logger.debug('Stream: data received', { rows: event.rows?.length, cols: event.columns })
            partialResponse = { ...partialResponse, columns: event.columns, rows: event.rows }
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, streamingStep: `Analysing ${event.rows.length} rows...`, response: partialResponse as AgentResponse }
              : m))
          } else if (event.event === 'summary_chunk') {
            summary += event.chunk
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, content: summary, streamingStep: 'Writing analysis...' }
              : m))
          } else if (event.event === 'chart') {
            logger.debug('Stream: chart received', { type: event.chart_type, title: event.chart_title })
            partialResponse = {
              ...partialResponse,
              chart_type: event.chart_type,
              chart_config: event.chart_config,
              chart_title: event.chart_title,
            }
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, response: partialResponse as AgentResponse }
              : m))
          } else if (event.event === 'done') {
            const elapsed = ((performance.now() - t0) / 1000).toFixed(2)
            logger.info('Ask done', {
              question,
              durationSec: elapsed,
              rows: event.rows?.length,
              chartType: event.chart_type,
              provider: event.llm_provider,
              model: event.llm_model,
              convId: event.conversation_id,
            })
            const finalResponse: AgentResponse = {
              question: event.question,
              sql: event.sql,
              columns: event.columns,
              rows: event.rows,
              summary: event.summary,
              chart_type: event.chart_type,
              chart_config: event.chart_config,
              chart_title: event.chart_title,
              plan: event.plan,
              source: event.source,
              llm_provider: event.llm_provider,
              llm_model: event.llm_model,
            }
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, isStreaming: false, streamingStep: undefined, content: event.summary, response: finalResponse }
              : m))
            const convId: string = event.conversation_id
            if (convId !== activeConversationId) setActiveConversationId(convId)
            fetchConversations()
          } else if (event.event === 'error') {
            throw new Error(event.detail)
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      logger.error('Ask failed', { question, error: msg, durationMs: performance.now() - t0 })
      setMessages((prev) => {
        const hasPlaceholder = prev.some((m) => m.id === agentId)
        if (hasPlaceholder) {
          return prev.map((m) => m.id === agentId
            ? { ...m, type: 'error' as const, content: msg, isStreaming: false, streamingStep: undefined }
            : m)
        }
        return [...prev, {
          id: crypto.randomUUID(),
          type: 'error' as const,
          content: msg,
          timestamp: new Date(),
        }]
      })
    } finally {
      setIsLoading(false)
    }
  }, [activeSource, activeConversationId, fetchConversations])

  // ---------------------------------------------------------------------------
  // File uploads
  // ---------------------------------------------------------------------------

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    logger.info('File upload started', { filename: file.name, sizeMB: (file.size / 1024 / 1024).toFixed(2) })
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json()
      logger.error('File upload failed', { filename: file.name, error: err.detail })
      throw new Error(err.detail || 'Upload failed')
    }
    const data = await res.json()
    logger.info('File upload success', { filename: file.name, sessionId: data.session_id, tables: data.table_count })
    await fetchDataSources()
    return data
  }, [fetchDataSources])

  const fixUpload = useCallback(async (sessionId: string, prompt: string): Promise<UploadResult> => {
    const res = await fetch(`${API_URL}/api/upload/fix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, prompt }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Fix failed')
    }
    return res.json()
  }, [])

  const confirmUpload = useCallback(async (sessionId: string) => {
    const res = await fetch(`${API_URL}/api/upload/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sessionId }),
    })
    if (!res.ok) throw new Error('Confirm failed')
    const data = await res.json()
    setActiveSourceState(data.active_source)
    await fetchDataSources()
    await fetchSchema()
  }, [fetchDataSources, fetchSchema])

  const renameColumn = useCallback(async (sessionId: string, oldName: string, newName: string): Promise<UploadResult> => {
    const res = await fetch(`${API_URL}/api/upload/rename-column`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, old_name: oldName, new_name: newName }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Rename failed')
    }
    return res.json()
  }, [])

  const dropColumn = useCallback(async (sessionId: string, columnName: string): Promise<UploadResult> => {
    const res = await fetch(`${API_URL}/api/upload/drop-column`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, column_name: columnName }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Drop failed')
    }
    return res.json()
  }, [])

  // ---------------------------------------------------------------------------
  // Switch data source
  // ---------------------------------------------------------------------------

  const switchDataSource = useCallback(async (sourceId: string) => {
    logger.info('Data source switch', { sourceId })
    const res = await fetch(`${API_URL}/api/datasource`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId }),
    })
    if (!res.ok) {
      logger.error('Data source switch failed', { sourceId })
      throw new Error('Switch failed')
    }
    const data = await res.json()
    setActiveSourceState(data.active_source)
    await fetchSchema()
    await fetchDataSources()
  }, [fetchSchema, fetchDataSources])

  const connectDatabase = useCallback(async (params: {
    db_type: string
    host: string
    port: number
    database: string
    user: string
    password: string
    name?: string
  }) => {
    const res = await fetch(`${API_URL}/api/database/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Connection failed')
    }
    const data = await res.json()
    await fetchDataSources()
    return data.connection as ExternalConnection
  }, [fetchDataSources])

  const deleteDatabaseConnection = useCallback(async (connId: string) => {
    const res = await fetch(`${API_URL}/api/database/connections/${connId}`, { method: 'DELETE' })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Delete failed')
    }
    await fetchDataSources()
    await fetchSchema()
  }, [fetchDataSources, fetchSchema])

  return {
    // messages
    messages,
    isLoading,
    ask,
    // conversations
    conversations,
    activeConversationId,
    loadConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    // data sources
    dataSources,
    activeSource,
    switchDataSource,
    // schema & llm
    schema,
    llmInfo,
    uploadFile,
    fixUpload,
    confirmUpload,
    renameColumn,
    dropColumn,
    refreshSchema: fetchSchema,
    connectDatabase,
    deleteDatabaseConnection,
    // suggestions
    suggestions,
    fetchSuggestions,
    // setup
    setupStatus,
    saveSetup,
  }
}
