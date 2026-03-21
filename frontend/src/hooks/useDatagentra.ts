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
  chart_type: 'bar' | 'line' | 'area' | 'pie' | 'metric'
  chart_config: ChartConfig
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

export interface SchemaTable {
  columns: { name: string; type: string; nullable: boolean }[]
  row_count: number
}

export interface LLMInfo {
  provider: string
  model: string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDatagentra() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [activeSource, setActiveSourceState] = useState<{ id: string; type: string } | null>(null)
  const [schema, setSchema] = useState<Record<string, SchemaTable>>({})
  const [llmInfo, setLlmInfo] = useState<LLMInfo | null>(null)

  // ---------------------------------------------------------------------------
  // Load initial data
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

  useEffect(() => {
    fetchDataSources()
    fetchSchema()
    fetchLLMInfo()
  }, [fetchDataSources, fetchSchema, fetchLLMInfo])

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

    try {
      const body: Record<string, unknown> = { question }
      if (activeSource && activeSource.type !== 'postgres') {
        body.session_id = activeSource.id
      }

      const res = await fetch(`${API_URL}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Unknown error')
      }

      const data: AgentResponse = await res.json()
      const agentMsg: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'agent',
        content: data.summary,
        response: data,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, agentMsg])
    } catch (err) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        type: 'error',
        content: err instanceof Error ? err.message : 'Something went wrong',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setIsLoading(false)
    }
  }, [activeSource])

  // ---------------------------------------------------------------------------
  // Upload file
  // ---------------------------------------------------------------------------

  const uploadFile = useCallback(async (file: File): Promise<UploadResult> => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      body: formData,
    })
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

  const clearMessages = useCallback(() => setMessages([]), [])

  return {
    messages,
    isLoading,
    dataSources,
    activeSource,
    schema,
    llmInfo,
    ask,
    uploadFile,
    fixUpload,
    confirmUpload,
    switchDataSource,
    clearMessages,
    refreshSchema: fetchSchema,
  }
}
