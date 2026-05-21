import { useEffect, useRef, useState } from 'react'
import { Settings, Plus, Send, Square, Globe, Trash2, Edit2, Copy, Check } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { useThreads } from '@/state/threads'
import { Button } from '@/components/ui/button'
import { SettingsModal } from '@/components/SettingsModal'
import { Markdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const settings = useSettings()
  const {
    hydrated,
    threads,
    currentThreadId,
    messages,
    isStreaming,
    error,
    hydrate,
    newChat,
    switchThread,
    sendMessage,
    cancel,
    regenerateLast,
    editAndResend,
    deleteCurrent,
    renameCurrent,
    clearError,
  } = useThreads()

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')

  // Hydrate on mount
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Apply theme
  useEffect(() => {
    if (!settings.hydrated) return
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = settings.theme === 'dark' || (settings.theme === 'system' && prefersDark)
    root.classList.toggle('dark', isDark)
  }, [settings.theme, settings.hydrated])

  // Auto-scroll to bottom
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isStreaming])

  const currentThread = threads.find((t) => t.id === currentThreadId)
  const hasKey = !!settings.apiKey

  async function handleSend() {
    const text = input.trim()
    if (!text || isStreaming || !hasKey) return
    setInput('')
    await sendMessage(text, { webSearch })
    setWebSearch(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void handleSend()
    }
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1400)
  }

  function startRename() {
    if (!currentThread) return
    setTitleInput(currentThread.title)
    setEditingTitle(true)
  }

  async function commitRename() {
    if (!currentThreadId) return
    await renameCurrent(titleInput.trim() || 'Untitled')
    setEditingTitle(false)
  }

  if (!hydrated) {
    return <div className="h-screen flex items-center justify-center text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-2.5 shrink-0 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-xl tracking-[-0.02em]">Champ Ai</div>
          <img 
            src="/basketball.png" 
            alt="Basketball" 
            className="h-5 w-5 object-contain -ml-1 opacity-90" 
          />
          {currentThread && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              {editingTitle ? (
                <input
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitRename()
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                  className="bg-transparent border-b border-border px-1 focus:outline-none"
                  autoFocus
                />
              ) : (
                <>
                  <span className="max-w-[220px] truncate">{currentThread.title}</span>
                  <button onClick={startRename} className="p-1 hover:text-foreground" aria-label="Rename chat">
                    <Edit2 className="size-3" />
                  </button>
                </>
              )}
            </div>
          )}
          <div className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground font-mono">
            {settings.model}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void newChat()}>
            <Plus className="size-4" /> New
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <div className="w-60 border-r flex flex-col bg-muted/20">
          <div className="p-3 text-xs uppercase tracking-[1px] text-muted-foreground flex items-center justify-between">
            <span>Chats</span>
            <button onClick={() => void newChat()} className="text-[10px] hover:text-foreground">+ new</button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5 text-sm">
            {threads.length === 0 && (
              <div className="px-3 py-2 text-muted-foreground text-xs">No chats yet</div>
            )}
            {threads.map((t) => (
              <div
                key={t.id}
                onClick={() => void switchThread(t.id)}
                className={cn(
                  'group flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-background/70',
                  t.id === currentThreadId && 'bg-background border'
                )}
              >
                <div className="truncate pr-2">{t.title}</div>
                {t.id === currentThreadId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void deleteCurrent() }}
                    className="opacity-40 hover:opacity-100 p-1"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 text-[10px] text-muted-foreground border-t">
            Everything stays in your browser
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div ref={listRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
              {messages.length === 0 && (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="text-2xl mb-3">Start a conversation</div>
                  <p className="text-sm">Add your API key in Settings to begin.</p>
                </div>
              )}

              {messages.map((m, idx) => {
                const isUser = m.role === 'user'
                const isLastAssistant = !isUser && idx === messages.length - 1
                return (
                  <div key={m.id} className={cn('flex gap-3', isUser && 'justify-end')}>
                    <div className={cn('max-w-[82%] group', isUser ? 'text-right' : '')}>
                      {!isUser && (
                        <div className="text-xs text-muted-foreground mb-1 px-1">Assistant</div>
                      )}
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                          isUser
                            ? 'bg-primary text-primary-foreground inline-block'
                            : 'bg-muted border'
                        )}
                      >
                        {isUser ? (
                          <div className="whitespace-pre-wrap">{m.content}</div>
                        ) : (
                          <Markdown text={m.content || (isStreaming ? '▌' : '')} />
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition text-xs">
                        <button
                          onClick={() => void handleCopy(m.content, m.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
                        >
                          {copiedId === m.id ? <Check className="size-3" /> : <Copy className="size-3" />} Copy
                        </button>
                        {isUser && (
                          <button
                            onClick={() => {
                              const newText = prompt('Edit message', m.content)
                              if (newText != null) void editAndResend(m.id, newText)
                            }}
                            className="px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
                          >
                            Edit &amp; resend
                          </button>
                        )}
                        {isLastAssistant && !isStreaming && (
                          <button onClick={() => void regenerateLast()} className="px-2 py-0.5 rounded hover:bg-muted text-muted-foreground">
                            Regenerate
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {error && (
                <div className="max-w-3xl mx-auto rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={clearError} className="underline">dismiss</button>
                </div>
              )}
            </div>
          </div>

          {/* Prompt Bar */}
          <div className="border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={hasKey ? 'Message your LLM… (⌘↵)' : 'Add your API key in Settings to chat'}
                  rows={1}
                  className="flex-1 min-h-[44px] max-h-40 resize-y rounded-2xl border bg-background px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                  disabled={isStreaming || !hasKey}
                />

                <div className="flex flex-col gap-1.5">
                  <Button
                    variant={webSearch ? 'default' : 'outline'}
                    size="icon-sm"
                    onClick={() => setWebSearch(!webSearch)}
                    disabled={isStreaming || !hasKey}
                    title="Toggle web search (Grok)"
                    className={cn(webSearch && 'bg-purple-600 text-white hover:bg-purple-700')}
                  >
                    <Globe className="size-4" />
                  </Button>

                  {isStreaming ? (
                    <Button variant="outline" size="icon-sm" onClick={cancel}>
                      <Square className="size-4" />
                    </Button>
                  ) : (
                    <Button size="icon-sm" onClick={() => void handleSend()} disabled={!input.trim() || !hasKey}>
                      <Send className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="text-center text-[10px] text-muted-foreground mt-2">
                One LLM • One key • Private
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
