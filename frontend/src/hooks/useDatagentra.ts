import { useState, useCallback, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartConfig {
  x_key: string
  y_keys: string[]
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

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`)
      const data = await res.json()
      setConversations(data.conversations)
      return data.conversations as Conversation[]
    } catch {
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
    } catch {
      // ignore
    }
  }, [])

  const createConversation = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations`, { method: 'POST' })
      const data: Conversation = await res.json()
      setConversations((prev) => [data, ...prev])
      setActiveConversationId(data.id)
      setMessages([])
      return data
    } catch {
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
    } catch {
      // ignore
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
    } catch {
      // ignore
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
        streamingStep: 'Generating SQL...',
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

          if (event.event === 'sql') {
            partialResponse = { ...partialResponse, sql: event.sql }
            setMessages((prev) => prev.map((m) => m.id === agentId
              ? { ...m, streamingStep: 'Running query...', response: partialResponse as AgentResponse }
              : m))
          } else if (event.event === 'data') {
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
            const finalResponse: AgentResponse = {
              question: event.question,
              sql: event.sql,
              columns: event.columns,
              rows: event.rows,
              summary: event.summary,
              chart_type: event.chart_type,
              chart_config: event.chart_config,
              chart_title: event.chart_title,
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
      setMessages((prev) => {
        const hasPlaceholder = prev.some((m) => m.id === agentId)
        if (hasPlaceholder) {
          return prev.map((m) => m.id === agentId
            ? { ...m, type: 'error' as const, content: err instanceof Error ? err.message : 'Something went wrong', isStreaming: false, streamingStep: undefined }
            : m)
        }
        return [...prev, {
          id: crypto.randomUUID(),
          type: 'error' as const,
          content: err instanceof Error ? err.message : 'Something went wrong',
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
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Upload failed')
    }
    const data = await res.json()
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

  // ---------------------------------------------------------------------------
  // Switch data source
  // ---------------------------------------------------------------------------

  const switchDataSource = useCallback(async (sourceId: string) => {
    const res = await fetch(`${API_URL}/api/datasource`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId }),
    })
    if (!res.ok) throw new Error('Switch failed')
    const data = await res.json()
    setActiveSourceState(data.active_source)
    await fetchSchema()
    await fetchDataSources()
  }, [fetchSchema, fetchDataSources])

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
    refreshSchema: fetchSchema,
    // setup
    setupStatus,
    saveSetup,
  }
}
