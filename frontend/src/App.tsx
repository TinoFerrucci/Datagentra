import { useState } from 'react'
import {
  Database,
  Upload,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  LayoutDashboard,
} from 'lucide-react'
import { useDatagentra } from './hooks/useDatagentra'
import { ChatInterface } from './components/ChatInterface'
import { SchemaExplorer } from './components/SchemaExplorer'
import { DataSourcePanel } from './components/DataSourcePanel'
import { cn } from './lib/utils'

type RightPanel = 'schema' | 'upload'

export default function App() {
  const [darkMode, setDarkMode] = useState(false)
  const [rightPanel, setRightPanel] = useState<RightPanel>('schema')
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const {
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
  } = useDatagentra()

  const toggleDark = () => {
    setDarkMode((d) => {
      if (!d) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      return !d
    })
  }

  const activeSourceName =
    dataSources.find((s) => s.id === activeSource?.id)?.name ?? 'PostgreSQL (default)'

  return (
    <div className={cn('flex h-screen bg-background text-foreground overflow-hidden', darkMode && 'dark')}>
      {/* ================================================================
          LEFT SIDEBAR — Navigation & Data sources
      ================================================================ */}
      <aside className="w-56 border-r flex flex-col bg-card flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">Datagentra</span>
        </div>

        {/* Data sources */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">
            Data Sources
          </p>
          <div className="space-y-1">
            {dataSources.map((source) => (
              <button
                key={source.id}
                onClick={() => switchDataSource(source.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-2 rounded-md text-xs font-medium transition-colors text-left',
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

        {/* Bottom: theme toggle */}
        <div className="px-4 py-4 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {llmInfo
              ? `${llmInfo.provider === 'ollama' ? 'Local' : 'OpenAI'}`
              : 'Connecting...'}
          </span>
          <button
            onClick={toggleDark}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
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
          onClear={clearMessages}
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
                  // Insert into chat input (via custom event)
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
    </div>
  )
}
