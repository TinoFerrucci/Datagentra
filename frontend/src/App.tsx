import { useState, useRef } from 'react'
import {
  Database,
  Upload,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  LayoutDashboard,
  Plus,
  Trash2,
  MessageSquare,
  Pencil,
  Check,
  X,
  Settings,
} from 'lucide-react'
import { useDatagentra } from './hooks/useDatagentra'
import { ChatInterface } from './components/ChatInterface'
import { SchemaExplorer } from './components/SchemaExplorer'
import { DataSourcePanel } from './components/DataSourcePanel'
import { SetupWizard } from './components/SetupWizard'
import { SettingsModal } from './components/SettingsModal'
import { cn } from './lib/utils'
import type { Conversation } from './hooks/useDatagentra'

type RightPanel = 'schema' | 'upload'

export default function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [rightPanel, setRightPanel] = useState<RightPanel>('schema')
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
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
  } = useDatagentra()

  const toggleDark = () => {
    setDarkMode((d) => {
      if (!d) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      return !d
    })
  }

  const activeSourceName =
    dataSources.find((s) => s.id === activeSource?.id)?.name ?? 'E-commerce (default)'

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
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">Datagentra</span>
        </div>

        {/* Conversations */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-3 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
              Conversaciones
            </p>
            <button
              onClick={createConversation}
              title="Nueva conversación"
              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5">
            {conversations.length === 0 && (
              <p className="text-[11px] text-muted-foreground px-2 py-2 italic">
                Sin conversaciones aún
              </p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  'group relative flex items-center rounded-md text-xs transition-colors cursor-pointer',
                  conv.id === activeConversationId
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
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
                      className="flex-1 min-w-0 bg-transparent border-b border-indigo-400 outline-none text-xs"
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
                      title="Renombrar"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                      title="Eliminar"
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
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
              Data Sources
            </p>
            <div className="space-y-0.5">
              {dataSources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => switchDataSource(source.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left',
                    source.active
                      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Database className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{source.name}</span>
                  {source.active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                  )}
                </button>
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
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
          onAsk={ask}
          onNew={createConversation}
          llmInfo={llmInfo}
          activeSourceName={activeSourceName}
        />
      </main>

      {/* ================================================================
          RIGHT PANEL — Schema Explorer / Upload
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
              <button
                onClick={() => setRightPanel('schema')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  rightPanel === 'schema'
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Database className="w-3.5 h-3.5" />
                Schema
              </button>
              <button
                onClick={() => setRightPanel('upload')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                  rightPanel === 'upload'
                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
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
            {rightPanel === 'schema' ? (
              <SchemaExplorer
                schema={schema}
                onColumnClick={(text) => {
                  window.dispatchEvent(new CustomEvent('insert-text', { detail: text }))
                }}
              />
            ) : (
              <DataSourcePanel
                onUpload={uploadFile}
                onFix={fixUpload}
                onConfirm={confirmUpload}
              />
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
    </div>
  )
}
