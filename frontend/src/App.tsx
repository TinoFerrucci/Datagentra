import { useState, useRef, useEffect } from 'react'
import {
  Database,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Plus,
  Trash2,
  MessageSquare,
  Pencil,
  Check,
  X,
  Settings,
  Code2,
  Copy,
} from 'lucide-react'
import logoUrl from '../statics/logo.png'
import datagentraUrl from '../statics/datagentra.png'
import { useDatagentra } from './hooks/useDatagentra'
import { ChatInterface } from './components/ChatInterface'
import { SchemaExplorer } from './components/SchemaExplorer'
import { SetupWizard } from './components/SetupWizard'
import { SettingsModal } from './components/SettingsModal'
import { AddDataSourceModal } from './components/AddDataSourceModal'
import { cn } from './lib/utils'
import type { Conversation } from './hooks/useDatagentra'

type RightPanel = 'schema' | 'sql'

import type { ChatMessage } from './hooks/useDatagentra'

function SqlHistoryPanel({ messages }: { messages: ChatMessage[] }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  const sqlItems = messages
    .filter((m) => m.type === 'agent' && m.response?.sql)
    .map((m, i) => ({ index: i + 1, sql: m.response!.sql! }))

  const handleCopy = async (sql: string, idx: number) => {
    await navigator.clipboard.writeText(sql)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  if (sqlItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-xs text-muted-foreground px-4 text-center">
        No SQL queries yet in this conversation.
      </div>
    )
  }

  return (
    <div className="p-3 space-y-2">
      {sqlItems.map(({ index, sql }) => (
        <div key={index} className="rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted">
            <span className="text-xs font-medium text-muted-foreground">Query {index}</span>
            <button
              onClick={() => handleCopy(sql, index)}
              title="Copy"
              className="p-1 rounded hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            >
              {copiedIdx === index
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <pre className="text-xs px-3 py-2 overflow-x-auto text-foreground/80 leading-relaxed whitespace-pre-wrap break-all">
            {sql}
          </pre>
        </div>
      ))}
    </div>
  )
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  const [rightPanel, setRightPanel] = useState<RightPanel>('schema')
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showDBConnect, setShowDBConnect] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const {
    messages,
    isLoading,
    ask,
    conversations,
    activeConversationId,
    loadConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    dataSources,
    activeSource,
    schema,
    llmInfo,
    setupStatus,
    saveSetup,
    uploadFile,
    fixUpload,
    confirmUpload,
    switchDataSource,
    connectDatabase,
    deleteDatabaseConnection,
    renameColumn,
    dropColumn,
    suggestions,
    fetchSuggestions,
  } = useDatagentra()

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  }, [darkMode])

  const toggleDark = () => {
    setDarkMode((d) => {
      localStorage.setItem('theme', d ? 'light' : 'dark')
      return !d
    })
  }

  const activeSourceName =
    dataSources.find((s) => s.id === activeSource?.id)?.name ?? 'E-commerce (default)'

  const conversationTitle =
    conversations.find((c) => c.id === activeConversationId)?.title ?? 'Conversation'

  // Inline rename helpers
  const startEdit = (conv: Conversation) => {
    setEditingConvId(conv.id)
    setEditingTitle(conv.title)
    setTimeout(() => editInputRef.current?.select(), 0)
  }

  const commitEdit = async () => {
    if (editingConvId && editingTitle.trim()) {
      await renameConversation(editingConvId, editingTitle.trim())
    }
    setEditingConvId(null)
  }

  const cancelEdit = () => setEditingConvId(null)

  return (
    <div className={cn('flex h-screen bg-background text-foreground overflow-hidden', darkMode && 'dark')}>
      {/* ================================================================
          LEFT SIDEBAR — Conversations & Data sources
      ================================================================ */}
      <aside className="w-56 border-r flex flex-col bg-card flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b">
          <img src={logoUrl} alt="Datagentra" className="w-7 h-7 object-contain" />
          <span className="font-bold text-sm">Datagentra</span>
        </div>

        {/* Conversations */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-3 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Conversations
            </p>
            <button
              onClick={createConversation}
              title="New conversation"
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-[11px] text-muted-foreground px-2 py-2 italic">
                No conversations yet
              </p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group relative flex items-center rounded-md text-xs transition-colors cursor-pointer',
                  conv.id === activeConversationId
                    ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {editingConvId === conv.id ? (
                  /* Inline rename input */
                  <div className="flex items-center gap-1 w-full px-2 py-1.5">
                    <input
                      ref={editInputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      className="flex-1 min-w-0 bg-transparent border-b border-teal-400 outline-none text-xs"
                      autoFocus
                    />
                    <button onClick={commitEdit} className="text-green-600 hover:text-green-700">
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  /* Normal row */
                  <button
                    onClick={() => loadConversation(conv.id)}
                    onDoubleClick={() => startEdit(conv)}
                    className="flex items-center gap-2 px-2 py-1.5 w-full text-left min-w-0"
                  >
                    <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate flex-1">{conv.title}</span>
                  </button>
                )}

                {/* Hover actions */}
                {editingConvId !== conv.id && (
                  <div className="absolute right-1 hidden group-hover:flex items-center gap-0.5 bg-inherit">
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(conv) }}
                      title="Rename"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                      title="Delete"
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Data sources */}
          <div className="border-t px-3 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Data Sources
              </p>
              <button
                onClick={() => setShowDBConnect(true)}
                title="Connect database"
                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {dataSources.map((source) => (
                <div
                  key={source.id}
                  className="group relative flex items-center"
                >
                  <button
                    onClick={() => switchDataSource(source.id)}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left min-w-0',
                      source.active
                        ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Database className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{source.name}</span>
                    {source.active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0" />
                    )}
                  </button>
                  {(source.type === 'postgres' || source.type === 'mysql') && (
                    <button
                      onClick={() => deleteDatabaseConnection(source.id)}
                      title="Remove connection"
                      className="absolute right-1 hidden group-hover:flex p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom: LLM info + settings + theme toggle */}
        <div className="px-4 py-4 border-t flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {llmInfo
              ? `${llmInfo.provider === 'ollama' ? 'Local' : 'OpenAI'}`
              : 'Connecting...'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSettings(true)}
              title="LLM Settings"
              className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={toggleDark}
              className="p-1.5 rounded-md hover:bg-muted transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ================================================================
          MAIN CHAT AREA
      ================================================================ */}
      <main className="flex-1 flex flex-col min-w-0">
        {activeConversationId ? (
          <ChatInterface
            messages={messages}
            isLoading={isLoading}
            onAsk={ask}
            onNew={createConversation}
            llmInfo={llmInfo}
            activeSourceName={activeSourceName}
            suggestions={suggestions}
            onFetchSuggestions={fetchSuggestions}
            conversationTitle={conversationTitle}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
            <img src={datagentraUrl} alt="Datagentra" className="h-14 object-contain opacity-90" />
            <p className="text-muted-foreground text-sm">
              Select a conversation or start a new one
            </p>
            <button
              onClick={createConversation}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              New conversation
            </button>
          </div>
        )}
      </main>

      {/* ================================================================
          RIGHT PANEL — Schema Explorer / SQL
      ================================================================ */}
      <aside
        className={cn(
          'border-l flex flex-col bg-card transition-all duration-200 flex-shrink-0',
          rightCollapsed ? 'w-12' : 'w-72'
        )}
      >
        {/* Panel header */}
        <div className="flex items-center border-b px-3 py-3 gap-2 flex-shrink-0">
          {!rightCollapsed && (
            <>
              {(
                [
                  { id: 'schema', icon: <Database className="w-3.5 h-3.5" />, label: 'Schema' },
                  { id: 'sql',    icon: <Code2 className="w-3.5 h-3.5" />,   label: 'SQL' },
                ] as const
              ).map(({ id, icon, label }) => (
                <button
                  key={id}
                  onClick={() => setRightPanel(id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                    rightPanel === id
                      ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </>
          )}
          <button
            onClick={() => setRightCollapsed((c) => !c)}
            className="ml-auto p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            {rightCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Panel content */}
        {!rightCollapsed && (
          <div className="flex-1 overflow-y-auto">
            {rightPanel === 'schema' && (
              <SchemaExplorer
                schema={schema}
                onColumnClick={(text) => {
                  window.dispatchEvent(new CustomEvent('insert-text', { detail: text }))
                }}
              />
            )}
            {rightPanel === 'sql' && (
              <SqlHistoryPanel messages={messages} />
            )}
          </div>
        )}
      </aside>

      {/* Setup wizard — shown when LLM is not configured */}
      {setupStatus !== null && !setupStatus.configured && (
        <SetupWizard onSave={saveSetup} />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          current={setupStatus}
          onSave={saveSetup}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Add data source modal */}
      {showDBConnect && (
        <AddDataSourceModal
          onClose={() => setShowDBConnect(false)}
          onConnect={connectDatabase}
          onSwitchSource={switchDataSource}
          onUpload={uploadFile}
          onConfirm={confirmUpload}
          onRenameColumn={renameColumn}
          onDropColumn={dropColumn}
        />
      )}
    </div>
  )
}
