import { useEffect, useRef, useState } from 'react'
import { Settings, Plus, Square, Trash2, Edit2, Copy, Check, Paperclip, Download, ArrowRightLeft, Radio, StickyNote, TrendingUp, Globe, FileText } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { useThreads } from '@/state/threads'
import { Button } from '@/components/ui/button'
import { SettingsModal } from '@/components/SettingsModal'
import { ShareModal } from '@/components/ShareModal'
import { ImportModal } from '@/components/ImportModal'
import { Modal } from '@/components/ui/modal'
import { Markdown } from '@/lib/markdown'
import { cn, getTextFromContent } from '@/lib/utils'
import { exportConversation, exportAsHandoff, type ExportFormat } from '@/lib/exportConversation'
import { loadMessages } from '@/lib/storage/db'

/**
 * Resize + compress image before sending to LLM.
 * Keeps aspect ratio. Max dimension on longest side.
 * Uses JPEG for good compression.
 */
async function processImageForUpload(
  file: File, 
  maxSize = 1280, 
  quality = 0.85
): Promise<{ kind: 'image'; mediaType: string; data: string; preview: string; originalSize: number; compressedSize: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    
    img.onload = () => {
      let { width, height } = img

      // Resize if needed
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        } else {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d', { alpha: false })!
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to JPEG for compression
      const dataUrl = canvas.toDataURL('image/jpeg', quality)
      const match = dataUrl.match(/^data:(.+);base64,(.+)$/)
      
      if (!match) {
        return reject(new Error('Failed to process image'))
      }

      // Calculate compressed size from base64
      const compressedSize = Math.round((match[2].length * 3) / 4)

      resolve({
        kind: 'image',
        mediaType: match[1],
        data: match[2],
        preview: dataUrl,
        originalSize: file.size,
        compressedSize,
      })
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Read any non-image file (PDF, CSV, DOCX, XLSX, JSON, TXT, etc.) as base64.
 * For text-based and office formats we also extract readable text so Grok/Claude
 * get clean content instead of binary garbage.
 */
async function processFileForUpload(file: File): Promise<{
  kind: 'file'
  mediaType: string
  data: string
  name: string
  originalSize: number
  extractedText?: string
}> {
  const base64 = await readFileAsBase64(file)
  const mediaType = file.type || getMimeFromName(file.name)
  let extractedText: string | undefined

  const lowerName = file.name.toLowerCase()

  try {
    if (lowerName.endsWith('.txt') || mediaType.startsWith('text/')) {
      extractedText = decodeBase64ToText(base64)
    } else if (lowerName.endsWith('.json') || mediaType === 'application/json') {
      const raw = decodeBase64ToText(base64)
      try {
        // Pretty-print JSON for better readability
        extractedText = JSON.stringify(JSON.parse(raw), null, 2)
      } catch {
        extractedText = raw
      }
    } else if (lowerName.endsWith('.csv')) {
      extractedText = decodeBase64ToText(base64)
    } else if (lowerName.endsWith('.docx') || mediaType.includes('wordprocessingml')) {
      const mammoth = await import('mammoth')
      const arrayBuffer = base64ToArrayBuffer(base64)
      const result = await mammoth.extractRawText({ arrayBuffer })
      extractedText = result.value?.trim() || '[No text extracted from DOCX]'
    } else if (lowerName.endsWith('.xlsx') || mediaType.includes('spreadsheetml')) {
      const XLSXmod = await import('xlsx')
      const arrayBuffer = base64ToArrayBuffer(base64)
      const workbook = XLSXmod.read(arrayBuffer, { type: 'array' })
      extractedText = convertXlsxToText(workbook, XLSXmod)
    }
    // For PDF we intentionally leave extractedText undefined so Gemini/Claude can use native PDF support
  } catch (err) {
    console.warn('Text extraction failed for', file.name, err)
    extractedText = `[Could not extract text from ${file.name}]`
  }

  // Truncate very long extracted text to protect context
  if (extractedText && extractedText.length > 80000) {
    extractedText = extractedText.slice(0, 80000) + '\n\n[... content truncated ...]'
  }

  return {
    kind: 'file',
    mediaType,
    data: base64,
    name: file.name,
    originalSize: file.size,
    extractedText,
  }
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const match = result.match(/^data:(.+);base64,(.+)$/)
      if (!match) return reject(new Error('Failed to read file'))
      resolve(match[2])
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function decodeBase64ToText(base64: string): string {
  try {
    return atob(base64)
  } catch {
    return '[Unable to decode file content]'
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function getMimeFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.txt')) return 'text/plain'
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return 'application/octet-stream'
}

function convertXlsxToText(workbook: any, XLSXmod: any): string {
  const sheets = workbook.SheetNames
  let text = ''
  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName]
    const json = XLSXmod.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    text += `=== Sheet: ${sheetName} ===\n`
    for (const row of json) {
      text += (row as any[]).join('\t') + '\n'
    }
    text += '\n'
  }
  return text.trim() || '[No data found in spreadsheet]'
}

function isSupportedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type
  return (
    type.startsWith('image/') ||
    type === 'application/pdf' ||
    type === 'text/csv' ||
    type === 'text/plain' ||
    type === 'application/json' ||
    type.includes('wordprocessingml') ||
    type.includes('spreadsheetml') ||
    name.endsWith('.pdf') ||
    name.endsWith('.csv') ||
    name.endsWith('.txt') ||
    name.endsWith('.json') ||
    name.endsWith('.docx') ||
    name.endsWith('.xlsx')
  )
}

async function processAnyFileForUpload(
  file: File,
  maxSize = 1280,
  quality = 0.85
): Promise<
  | { kind: 'image'; mediaType: string; data: string; preview: string; originalSize: number; compressedSize: number }
  | { kind: 'file'; mediaType: string; data: string; name: string; originalSize: number; extractedText?: string }
> {
  if (file.type.startsWith('image/')) {
    return processImageForUpload(file, maxSize, quality)
  }
  return processFileForUpload(file)
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [claudeFMPlaying, setClaudeFMPlaying] = useState(false)
  const [notepadOpen, setNotepadOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [webSearch, setWebSearch] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<
    Array<
      | {
          id: string
          kind: 'image'
          mediaType: string
          data: string
          preview: string
          originalSize: number
          compressedSize: number
        }
      | {
          id: string
          kind: 'file'
          mediaType: string
          data: string
          name: string
          originalSize: number
          extractedText?: string
        }
    >
  >([])

  const settings = useSettings()
  const {
    hydrated,
    threads,
    currentThreadId,
    messages,
    currentNotes,
    isStreaming,
    streamingMessageId,
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
    setCurrentNotes,
    saveCurrentNotes,
    clearError,
    // Path 1 - Projects
    projects,
    currentProjectId,
    createProject,
    renameProject: _renameProject,
    deleteProject,
    setCurrentProject,
    moveThreadToProject,
  } = useThreads()

  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')

  // Path 1 - Visible threads based on selected project
  const visibleThreads = currentProjectId === null
    ? threads.filter(t => !t.projectId)
    : threads.filter(t => t.projectId === currentProjectId)

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

  // Apply chat font size
  useEffect(() => {
    if (!settings.hydrated) return
    const root = document.documentElement

    const sizeMap = {
      sm: '14px',
      md: '15px',
      lg: '17px',
      xl: '19px',
    } as const

    const size = sizeMap[settings.chatFontSize] || '15px'
    root.style.setProperty('--chat-font-size', size)
  }, [settings.chatFontSize, settings.hydrated])

  // Auto-scroll to bottom
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isStreaming])

  // Auto-save notes (debounced)
  useEffect(() => {
    if (!currentThreadId) return
    const timeout = setTimeout(() => {
      saveCurrentNotes()
    }, 600)
    return () => clearTimeout(timeout)
  }, [currentNotes, currentThreadId, saveCurrentNotes])

  const currentThread = threads.find((t) => t.id === currentThreadId)
  const hasKey = settings.currentProvider === 'grok' ? !!settings.grokApiKey :
                 settings.currentProvider === 'claude' ? !!settings.claudeApiKey :
                 !!settings.geminiApiKey

  async function handleSend() {
    const text = input.trim()
    if ((!text && attachments.length === 0) || isStreaming || !hasKey) return

    const atts = attachments.map((a) => ({
      mediaType: a.mediaType,
      data: a.data,
      name: a.kind === 'file' ? a.name : undefined,
      extractedText: a.kind === 'file' ? a.extractedText : undefined,
    }))

    setInput('')
    setAttachments([])
    setWebSearch(false)

    await sendMessage(text, { webSearch, attachments: atts })
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
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

  async function handleExport(format: ExportFormat) {
    if (!currentThread) return
    setExportOpen(false)
    try {
      // Always load the complete latest messages from storage
      const freshMessages = await loadMessages(currentThread.id)
      if (freshMessages.length === 0) return
      await exportConversation(currentThread, freshMessages, format)
    } catch (e) {
      console.error('Export failed', e)
      alert('Export failed. See console for details.')
    }
  }

  async function handleHandoff() {
    if (!currentThread) return
    try {
      // Always load the complete latest messages from storage to guarantee the full dialogue
      const freshMessages = await loadMessages(currentThread.id)
      if (freshMessages.length === 0) return
      exportAsHandoff(currentThread, freshMessages, settings.systemPrompt, currentNotes)
    } catch (e) {
      console.error('Handoff failed', e)
      alert('Handoff failed. See console for details.')
    }
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

                  {/* Path 1: Quick project assignment for current thread */}
                  <select
                    value={currentThread.projectId || ''}
                    onChange={async (e) => {
                      const newProjectId = e.target.value || null
                      await moveThreadToProject(currentThread.id, newProjectId)
                    }}
                    className="ml-2 text-[11px] bg-muted border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Move this thread to a project"
                  >
                    <option value="">Uncategorized</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
          <div className="text-[10px] px-1.5 py-px rounded bg-muted text-muted-foreground font-mono capitalize">
            {settings.currentProvider} • {
              settings.currentProvider === 'grok' ? settings.grokModel :
              settings.currentProvider === 'claude' ? settings.claudeModel :
              settings.geminiModel
            }
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void newChat()}
            title={
              currentProjectId
                ? "Start a new thread in this project. Use Handoff on an existing thread first if you want to carry forward context."
                : "Start a new thread"
            }
          >
            <Plus className="size-4" /> New
          </Button>

          {currentProjectId && (
            <span className="hidden md:inline text-[10px] text-muted-foreground ml-1">
              Tip: Use Handoff to continue context
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExportOpen(true)}
            disabled={!currentThread || messages.length === 0}
          >
            <Download className="size-4" /> Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleHandoff}
            disabled={!currentThread || messages.length === 0}
            title="Create a handoff document with full context + images for continuing in a new thread"
          >
            <ArrowRightLeft className="size-4" /> Handoff
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            disabled={!currentThread || messages.length === 0}
            title="Share this thread with someone (with optional encryption)"
          >
            Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (claudeFMPlaying) {
                setClaudeFMPlaying(false)
              } else {
                window.open('https://www.youtube.com/live/YmQ7jRgf4f0', '_blank')
                setClaudeFMPlaying(true)
              }
            }}
            title={claudeFMPlaying ? "Claude FM is playing (click to hide indicator)" : "Claude FM — Music for thinking and building"}
          >
            <Radio className="size-4" /> Claude FM
            {claudeFMPlaying && (
              <span
                className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
                title="Playing"
              />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => window.open('https://www.google.com/finance', '_blank')}
            title="Google Finance"
            aria-label="Google Finance"
          >
            <TrendingUp className="size-4 text-green-500" />
          </Button>

          <Button variant="outline" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings className="size-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - Path 1: Projects + filtered threads */}
        <div className="w-60 border-r flex flex-col bg-muted/20 text-sm">
          {/* Projects header */}
          <div className="flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-[1.5px] text-muted-foreground border-b">
            <span>Projects</span>
            <div className="flex items-center gap-1 text-[10px]">
              <button
                onClick={() => setImportOpen(true)}
                className="rounded px-1.5 py-0.5 font-normal text-muted-foreground hover:bg-background hover:text-foreground transition"
                title="Import a shared thread"
              >
                Import
              </button>
              <button
                onClick={async () => {
                  const name = prompt('New project name')
                  if (name?.trim()) await createProject(name.trim())
                }}
                className="rounded px-1.5 py-0.5 font-normal hover:bg-background hover:text-foreground transition -mr-1"
              >
                + new
              </button>
            </div>
          </div>

          {/* Project list */}
          <div className="px-2 py-1 space-y-px">
            {/* All Chats */}
            <div
              onClick={() => setCurrentProject(null)}
              className={cn(
                'px-3 py-1.5 rounded-md cursor-pointer hover:bg-background/60 flex items-center',
                currentProjectId === null && 'bg-background font-medium'
              )}
            >
              All Chats
            </div>

            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => setCurrentProject(p.id)}
                className={cn(
                  'group px-3 py-1.5 rounded-md cursor-pointer hover:bg-background/60 flex items-center justify-between',
                  currentProjectId === p.id && 'bg-background font-medium'
                )}
              >
                <div className="truncate flex items-center gap-2">
                  {p.color && (
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  )}
                  {p.name}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm(`Delete project “${p.name}”? Threads will move to All Chats.`)) {
                      void deleteProject(p.id)
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive px-1 -mr-1"
                  title="Delete project"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Divider + current section label */}
          <div className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground border-t mt-1">
            {currentProjectId === null ? 'Uncategorized' : projects.find(p => p.id === currentProjectId)?.name}
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-px">
            {visibleThreads.length === 0 && (
              <div className="px-3 py-3 text-muted-foreground text-xs">No threads here yet</div>
            )}
            {visibleThreads.map((t) => (
              <div
                key={t.id}
                onClick={() => void switchThread(t.id)}
                className={cn(
                  'group flex items-center justify-between gap-2 px-3 py-1.5 rounded-md cursor-pointer hover:bg-background/60',
                  t.id === currentThreadId && 'bg-background font-medium'
                )}
              >
                <div className="truncate pr-2">{t.title}</div>
                {t.id === currentThreadId && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void deleteCurrent() }}
                    className="opacity-40 hover:opacity-100 p-0.5"
                    aria-label="Delete thread"
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
                <div className="flex min-h-[420px] items-center justify-center">
                  <div className="text-5xl md:text-6xl font-light tracking-[-2px] text-muted-foreground/40 select-none font-chat">
                    Let's Play!
                  </div>
                </div>
              )}

              {messages.map((m, idx) => {
                const isUser = m.role === 'user'
                const isLastAssistant = !isUser && idx === messages.length - 1
                const isGenerating = streamingMessageId != null && m.id === streamingMessageId
                return (
                  <div key={m.id} className={cn('flex gap-3', isUser && 'justify-end')}>
                    <div className={cn('max-w-[82%] group', isUser ? 'text-right' : '')}>
                      {!isUser && (
                        <div className="text-xs text-muted-foreground mb-1 px-1 flex items-center gap-1.5">
                          Assistant
                          {isGenerating && (
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500/70 animate-pulse"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      )}
                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
                          isUser
                            ? 'bg-primary text-primary-foreground inline-block'
                            : 'bg-muted'
                        )}
                      >
                        {isUser ? (
                          <div>
                            {/* Images */}
                            {m.content
                              .filter((p): p is { type: 'image'; mediaType: string; data: string } => p.type === 'image')
                              .map((img, i) => (
                                <img
                                  key={i}
                                  src={`data:${img.mediaType};base64,${img.data}`}
                                  alt="Attached"
                                  className="max-h-64 rounded-lg mb-2 border border-white/20"
                                />
                              ))}
                            {/* Files (PDF, CSV, etc.) */}
                            {m.content
                              .filter((p): p is { type: 'file'; mediaType: string; data: string; name?: string } => p.type === 'file')
                              .map((f, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 mb-2 rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm"
                                >
                                  <FileText className="size-4 shrink-0" />
                                  <span className="truncate">{f.name || 'Attached file'}</span>
                                  <span className="opacity-60 text-xs">({f.mediaType.split('/').pop()})</span>
                                </div>
                              ))}
                            {/* Text */}
                            <div className="whitespace-pre-wrap message-text">
                              {getTextFromContent(m.content)}
                            </div>
                          </div>
                        ) : (
                          isGenerating && getTextFromContent(m.content).trim() === '' ? (
                            <div className="flex items-center gap-1.5 py-1" aria-label="Generating response">
                              {[0, 1, 2].map((i) => (
                                <span
                                  key={i}
                                  className="h-1 w-1 rounded-full bg-muted-foreground/60 animate-bounce"
                                  style={{ animationDelay: `${i * 150}ms`, animationDuration: '1.1s' }}
                                />
                              ))}
                            </div>
                          ) : (
                            <Markdown text={getTextFromContent(m.content) || (isGenerating ? '▌' : '')} />
                          )
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition text-xs">
                        <button
                          onClick={() => void handleCopy(getTextFromContent(m.content), m.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted text-muted-foreground"
                        >
                          {copiedId === m.id ? <Check className="size-3" /> : <Copy className="size-3" />} Copy
                        </button>
                        {isUser && (
                          <button
                            onClick={() => {
                              const currentText = getTextFromContent(m.content)
                              const newText = prompt('Edit message', currentText)
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
          <div
            className="bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()

              if (!hasKey || isStreaming) return

              const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => isSupportedFile(f))
              if (droppedFiles.length === 0) return

              const qualityPreset = useSettings.getState().imageQualityPreset ?? 'balanced'
              const presets = {
                high: { maxSize: 1920, quality: 0.92 },
                balanced: { maxSize: 1280, quality: 0.85 },
                fast: { maxSize: 800, quality: 0.75 },
              } as const
              const { maxSize, quality } = presets[qualityPreset]

              const newAtts = await Promise.all(
                droppedFiles.map((f) => processAnyFileForUpload(f, maxSize, quality))
              )
              setAttachments((prev) => [
                ...prev,
                ...newAtts.map((a) => ({ id: crypto.randomUUID(), ...a })),
              ])
            }}
          >
            <div className="max-w-3xl mx-auto">
              {/* Attachments preview */}
              {attachments.length > 0 && (
                <div className="flex gap-2 mb-2 flex-wrap">
                  {attachments.map((att) => {
                    const isImage = att.kind === 'image'
                    const savings = isImage
                      ? Math.round(((att.originalSize - att.compressedSize) / att.originalSize) * 100)
                      : 0
                    return (
                      <div key={att.id} className="relative group">
                        {isImage ? (
                          <img
                            src={att.preview}
                            alt="preview"
                            className="h-14 w-14 object-cover rounded-lg border"
                          />
                        ) : (
                          <div className="h-14 w-14 flex flex-col items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                            <FileText className="size-6" />
                            <div className="text-[8px] mt-0.5 w-12 truncate text-center">{att.name.split('.').pop()?.toUpperCase()}</div>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-white px-1 rounded-b-lg text-center tabular-nums">
                          {Math.round(att.originalSize / 1024)}KB
                          {isImage && savings > 0 && <span className="text-green-400"> (-{savings}%)</span>}
                          {!isImage && att.name && (
                            <span className="opacity-75"> {att.name.length > 12 ? att.name.slice(0, 8) + '…' : att.name}</span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                          }
                          className="absolute -top-1 -right-1 bg-black/70 hover:bg-black text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-80 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2 items-stretch">
                {/* Left buttons */}
                <div className="flex gap-2 items-center self-stretch">
                  {/* Attach photos */}
                  <Button
                    variant="outline"
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*,.pdf,.csv,.txt,.json,.docx,.xlsx,application/pdf,text/csv,text/plain,application/json'
                      input.multiple = true
                      input.onchange = async (e) => {
                        const files = Array.from((e.target as HTMLInputElement).files || [])
                        const qualityPreset = useSettings.getState().imageQualityPreset ?? 'balanced'

                        const presets = {
                          high: { maxSize: 1920, quality: 0.92 },
                          balanced: { maxSize: 1280, quality: 0.85 },
                          fast: { maxSize: 800, quality: 0.75 },
                        } as const

                        const { maxSize, quality } = presets[qualityPreset]

                        const newAtts = await Promise.all(
                          files.map((f) => processAnyFileForUpload(f, maxSize, quality))
                        )
                        setAttachments((prev) => [
                          ...prev,
                          ...newAtts.map((a) => ({ id: crypto.randomUUID(), ...a })),
                        ])
                      }
                      input.click()
                    }}
                    disabled={isStreaming || !hasKey}
                    title="Attach images, PDFs, CSVs, DOCX, XLSX, JSON, TXT"
                    className="h-full px-3 rounded-2xl"
                  >
                    <Paperclip className="size-4" />
                  </Button>

                  <Button
                    variant={webSearch ? 'default' : 'outline'}
                    onClick={() => setWebSearch(!webSearch)}
                    disabled={isStreaming || !hasKey}
                    title="Toggle web search (Grok)"
                    className={cn(
                      'h-full px-3 rounded-2xl',
                      webSearch && 'bg-purple-600 text-white hover:bg-purple-700'
                    )}
                  >
                    <Globe className="size-4" />
                  </Button>
                </div>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={hasKey ? 'Message your LLM… (Shift+Enter for new line)' : 'Add your API key in Settings to chat'}
                  rows={1}
                  id="prompt-textarea"
                  className="flex-1 min-h-[44px] max-h-40 resize-y rounded-2xl bg-[color:var(--chat-input)] px-4 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 font-chat"
                  disabled={isStreaming || !hasKey}
                />

                {/* Right button(s) - on normal background */}
                <div className="flex items-center self-stretch">
                  {isStreaming ? (
                    <Button 
                      variant="outline" 
                      onClick={cancel}
                      className="h-full px-3 rounded-2xl"
                    >
                      <Square className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      onClick={() => void handleSend()}
                      disabled={(!input.trim() && attachments.length === 0) || !hasKey}
                      className="h-full px-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                    >
                      Send
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

      {/* Share modal (Path 1) */}
      <ShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        currentThread={currentThread || null}
        messages={messages}
        projectName={currentThread?.projectId ? projects.find(p => p.id === currentThread.projectId)?.name : undefined}
      />

      {/* Import modal (Path 1) */}
      <ImportModal open={importOpen} onOpenChange={setImportOpen} />

      {/* Export modal */}
      <Modal open={exportOpen} onOpenChange={setExportOpen}>
        <div className="space-y-4">
          <div>
            <div className="text-lg font-semibold">Export conversation</div>
            <div className="text-sm text-muted-foreground mt-1">
              {currentThread?.title} — {messages.length} messages
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => void handleExport('markdown')}
              className="flex flex-col items-start rounded-xl border p-4 text-left hover:bg-accent transition"
            >
              <div className="font-medium">Markdown (.md)</div>
              <div className="text-xs text-muted-foreground mt-1">Readable text + images as data URIs</div>
            </button>

            <button
              onClick={() => void handleExport('csv')}
              className="flex flex-col items-start rounded-xl border p-4 text-left hover:bg-accent transition"
            >
              <div className="font-medium">CSV (.csv)</div>
              <div className="text-xs text-muted-foreground mt-1">Tabular: timestamp, role, text</div>
            </button>

            <button
              onClick={() => void handleExport('pdf')}
              className="flex flex-col items-start rounded-xl border p-4 text-left hover:bg-accent transition"
            >
              <div className="font-medium">PDF (.pdf)</div>
              <div className="text-xs text-muted-foreground mt-1">Formatted document with images</div>
            </button>

            <button
              onClick={() => void handleExport('docx')}
              className="flex flex-col items-start rounded-xl border p-4 text-left hover:bg-accent transition"
            >
              <div className="font-medium">Word (.docx)</div>
              <div className="text-xs text-muted-foreground mt-1">Real .docx file with embedded images</div>
            </button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Floating Notepad */}
      <div className="fixed bottom-16 left-4 z-50 flex flex-col items-start">
        {/* Notepad Toggle Button */}
        <button
          onClick={() => setNotepadOpen(!notepadOpen)}
          className="flex h-11 w-11 items-center justify-center rounded-full border bg-background shadow-md hover:bg-accent transition-all active:scale-95"
          title="Thread Notes"
        >
          <StickyNote className="size-5" />
        </button>

        {/* Floating Notepad Panel */}
        {notepadOpen && (
          <div className="mt-2 w-80 rounded-2xl border bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-medium text-muted-foreground">Notes</div>
              <button
                onClick={() => {
                  setNotepadOpen(false)
                  saveCurrentNotes()
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <textarea
              value={currentNotes}
              onChange={(e) => setCurrentNotes(e.target.value)}
              placeholder="Write your notes for this thread here..."
              className="h-64 w-full resize-none rounded-b-2xl bg-transparent p-3 text-sm outline-none font-chat"
            />
          </div>
        )}
      </div>

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
