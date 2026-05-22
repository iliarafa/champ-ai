import { useEffect, useState, type ReactNode } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import type { ProviderId } from '@/lib/storage/db'
import { SETTINGS_DEFAULTS } from '@/lib/storage/db'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: Props) {
  const settings = useSettings()

  const [activeTab, setActiveTab] = useState<'settings' | 'docs'>('settings')

  // Documentation sections that can be collapsed/expanded
  // Start with all sections closed by default
  const [openDocsSections, setOpenDocsSections] = useState<Set<string>>(new Set())

  const toggleDocsSection = (id: string) => {
    setOpenDocsSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [imageQualityPreset, setImageQualityPreset] = useState<'high' | 'balanced' | 'fast'>('balanced')
  const [chatFontSize, setChatFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('md')
  const [editingProvider, setEditingProvider] = useState<ProviderId>('grok')
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<string>('')
  const [isCustomModel, setIsCustomModel] = useState(false)

  const loadProviderValues = (provider: ProviderId) => {
    setIsCustomModel(false)

    let currentModel = ''

    if (provider === 'grok') {
      setApiKey(settings.grokApiKey)
      currentModel = settings.grokModel
    } else if (provider === 'claude') {
      setApiKey(settings.claudeApiKey)
      currentModel = settings.claudeModel
    } else if (provider === 'gemini') {
      setApiKey(settings.geminiApiKey)
      currentModel = settings.geminiModel
    }

    const recommended = getModelsForProvider(provider).map(m => m.id)
    if (!recommended.includes(currentModel)) {
      setIsCustomModel(true)
    }

    setModel(currentModel)
  }

  const getModelsForProvider = (provider: ProviderId) => {
    if (provider === 'grok') {
      return [
        { id: 'grok-3-latest', label: 'Grok 3 (latest)' },
        { id: 'grok-2-1212', label: 'Grok 2' },
      ]
    }

    if (provider === 'claude') {
      return [
        { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet (Latest)' },
        { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Oct 2024)' },
        { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        { id: 'claude-4.7', label: 'Claude 4.7 Opus (Not available yet)' },
      ]
    }

    return [
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
      { id: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
    ]
  }

  const saveModelForProvider = async (provider: ProviderId, newModel: string) => {
    const trimmed = newModel.trim()
    if (!trimmed) return

    const patch =
      provider === 'grok' ? { grokModel: trimmed } :
      provider === 'claude' ? { claudeModel: trimmed } :
      { geminiModel: trimmed }

    await settings.updateConfig(patch)
  }

  useEffect(() => {
    if (!open) return

    setSystemPrompt(settings.systemPrompt)
    setTheme(settings.theme)
    setImageQualityPreset(settings.imageQualityPreset ?? 'balanced')
    setChatFontSize(settings.chatFontSize ?? 'md')
    setTestStatus('')

    const initialProvider = settings.currentProvider
    setEditingProvider(initialProvider)
    loadProviderValues(initialProvider)
  }, [open, settings])

  async function handleSave() {
    setSaving(true)
    try {
      // Save API key for the provider being edited
      await settings.setApiKey(editingProvider, apiKey)

      // Save model for the provider being edited + common settings
      const modelPatch =
        editingProvider === 'grok' ? { grokModel: model.trim() || SETTINGS_DEFAULTS.grokModel } :
        editingProvider === 'claude' ? { claudeModel: model.trim() || SETTINGS_DEFAULTS.claudeModel } :
        { geminiModel: model.trim() || SETTINGS_DEFAULTS.geminiModel }

      await settings.updateConfig({
        ...modelPatch,
        systemPrompt,
        imageQualityPreset,
        chatFontSize,
      })

      await settings.setTheme(theme)

      // Make the edited provider the active one
      await settings.setCurrentProvider(editingProvider)

      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTestStatus('Testing...')
    const key = apiKey.trim()
    if (!key) {
      setTestStatus('Enter a key first')
      return
    }
    // Simple test: just check if key is non-empty for now
    // Real per-provider tests can be added later
    setTestStatus('✓ Key looks valid (full test coming soon)')
  }

  // Local collapsible section component for the Documentation tab
  function DocsSection({
    title,
    open,
    onToggle,
    children,
  }: {
    title: string
    open: boolean
    onToggle: () => void
    children: ReactNode
  }) {
    return (
      <div className="border-b border-border/60 last:border-b-0">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-between py-3 text-left font-semibold text-foreground hover:bg-muted/50 rounded-md px-2 -mx-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={open}
        >
          <span>{title}</span>
          <ChevronDown
            className={cn('size-4 transition-transform text-muted-foreground', open && 'rotate-180')}
          />
        </button>
        {open && (
          <div className="pb-5 pl-2 text-[13.5px] leading-relaxed">
            {children}
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        <button
          onClick={() => setActiveTab('settings')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition',
            activeTab === 'settings'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition',
            activeTab === 'docs'
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          Documentation
        </button>
      </div>

      {activeTab === 'settings' ? (
        <>
          <div className="space-y-6 text-sm">
        {/* Provider Selector */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">ACTIVE PROVIDER</label>
          <div className="inline-flex rounded-lg border p-0.5 text-sm w-full">
            {(['grok', 'claude', 'gemini'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setEditingProvider(p)
                  loadProviderValues(p)
                }}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-md capitalize transition-colors',
                  editingProvider === p
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">API KEY</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={editingProvider === 'grok' ? 'xai-...' : editingProvider === 'claude' ? 'sk-ant-...' : 'AIza...'}
            className="font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Stored only in your browser.</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">MODEL</label>

          <select
            value={isCustomModel ? 'custom' : model}
            onChange={(e) => {
              const value = e.target.value

              if (value === 'custom') {
                setIsCustomModel(true)
                return
              }

              setIsCustomModel(false)
              setModel(value)
              saveModelForProvider(editingProvider, value) // Auto-save
            }}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {getModelsForProvider(editingProvider).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            <option value="custom">Custom model...</option>
          </select>

          {isCustomModel && (
            <Input
              value={model}
              onChange={(e) => {
                const newValue = e.target.value
                setModel(newValue)

                // Debounced auto-save for custom models
                clearTimeout((window as any).__modelSaveTimeout)
                ;(window as any).__modelSaveTimeout = setTimeout(() => {
                  saveModelForProvider(editingProvider, newValue)
                }, 600)
              }}
              placeholder="Enter custom model ID"
              className="mt-2 font-mono text-xs"
            />
          )}

          <p className="text-[10px] text-muted-foreground mt-1">
            Select a model for {editingProvider}.
          </p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">SYSTEM PROMPT (optional)</label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            placeholder="You are..."
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">THEME</label>
          <div className="inline-flex rounded-lg border p-0.5 text-sm">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={cn(
                  'px-3 py-1 rounded-md',
                  theme === t ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">IMAGE QUALITY</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'high', label: 'High', desc: 'Maximum detail' },
              { value: 'balanced', label: 'Balanced', desc: 'Recommended' },
              { value: 'fast', label: 'Fast', desc: 'Smaller files' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setImageQualityPreset(p.value as any)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition',
                  imageQualityPreset === p.value
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                <div className="font-medium">{p.label}</div>
                <div className="text-[10px] opacity-70 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Affects how large photos are when sent to the model.
          </p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">CHAT FONT SIZE</label>
          <div className="inline-flex rounded-lg border p-0.5 text-sm">
            {[
              { value: 'sm', size: 'text-xs' },
              { value: 'md', size: 'text-sm' },
              { value: 'lg', size: 'text-base' },
              { value: 'xl', size: 'text-lg' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setChatFontSize(p.value as any)}
                className={cn(
                  'px-2.5 py-1 rounded-md flex items-center justify-center min-w-[42px]',
                  chatFontSize === p.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <span className={cn('font-medium leading-none', p.size)}>Aa</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-2">
        <Button variant="outline" onClick={handleTest} disabled={saving}>Test connection</Button>
        {testStatus && <span className="text-xs text-muted-foreground">{testStatus}</span>}
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>Save</Button>
      </div>
        </>
      ) : (
        /* ===================== DOCUMENTATION TAB ===================== */
        <div className="text-sm max-h-[460px] overflow-y-auto pr-3 -mr-1 leading-relaxed">
          {/* GETTING STARTED */}
          <DocsSection title="Getting Started" open={openDocsSections.has('getting-started')} onToggle={() => toggleDocsSection('getting-started')}>
            <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
              <li><strong>Open Settings</strong> — Click the gear icon in the top right.</li>
              <li><strong>Add an API key</strong> — Choose your provider (Grok, Claude, or Gemini) and paste your key. You can use multiple providers.</li>
              <li><strong>Pick a model</strong> — Select from recommended models or enter a custom one.</li>
              <li><strong>Start chatting</strong> — Type in the message box at the bottom and press <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-xs">Enter</kbd>. Use <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-xs">Shift + Enter</kbd> for a new line.</li>
            </ol>

            <div className="mt-4 text-xs bg-muted/50 p-3 rounded-lg">
              <strong>Recommended quick setup:</strong><br />
              Grok → <code className="text-xs">https://api.x.ai/v1</code> + <code>grok-3-latest</code><br />
              Claude → Use Anthropic key + <code>claude-3-5-sonnet-latest</code>
            </div>
          </DocsSection>

          {/* INTERFACE & CHATTING */}
          <DocsSection title="Interface &amp; Chatting" open={openDocsSections.has('interface')} onToggle={() => toggleDocsSection('interface')}>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
              <li><strong>Projects sidebar</strong> — Organize your conversations into folders. Click a project to filter the chat list.</li>
              <li><strong>Attachments</strong> — Click the paperclip or drag &amp; drop images, PDFs, CSVs, DOCX, XLSX, JSON, or TXT files into the chat. Text is extracted from documents and spreadsheets for best compatibility across providers.</li>
              <li><strong>Web Search</strong> — Toggle the globe icon for real-time web search (currently works best with Grok).</li>
              <li><strong>Edit &amp; Resend</strong> — Hover over your messages to edit previous prompts.</li>
              <li><strong>Regenerate</strong> — After an assistant response, hover to reveal the Regenerate button.</li>
              <li><strong>Notepad</strong> — Every thread has its own private notepad (bottom left) that is saved automatically and included in shares.</li>
            </ul>
          </DocsSection>

          {/* PROJECTS & SHARING */}
          <DocsSection title="Projects &amp; Secure Sharing" open={openDocsSections.has('projects-sharing')} onToggle={() => toggleDocsSection('projects-sharing')}>
            <p className="mb-3 text-muted-foreground">This is the main way to collaborate with others while staying private.</p>
            
            <div className="space-y-4 text-muted-foreground">
              <div>
                <strong className="text-foreground">Projects</strong><br />
                Use the sidebar to create, rename, and switch between Projects. Threads can be moved between projects using the dropdown next to the thread title.
              </div>

              <div>
                <strong className="text-foreground">Sharing a Thread</strong><br />
                Click the <strong>Share</strong> button in the header. You can choose:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li><strong>No encryption</strong> — Simple JSON file, anyone can open it.</li>
                  <li><strong>Markdown format</strong> — Threads are shared as readable Markdown files (with images embedded as base64; other attached files are noted). Easy to open in any text editor.</li>
                </ul>
                You can copy the payload or download it as a Markdown file.
              </div>

              <div>
                <strong className="text-foreground">Importing a Thread</strong><br />
                Click <strong>Import</strong> in the Projects section of the sidebar. You can paste Markdown content or drop a <code>.md</code> file. You can choose which project to import it into (or create a new one).
              </div>
            </div>
          </DocsSection>

          {/* EXPORT & HANDOFF */}
          <DocsSection title="Export &amp; Handoff" open={openDocsSections.has('export-handoff')} onToggle={() => toggleDocsSection('export-handoff')}>
            <p className="mb-2 text-muted-foreground">Different export options serve different purposes:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li><strong>Export</strong> — Standard formats (Markdown, PDF, DOCX, CSV) for archiving or sharing with humans.</li>
              <li><strong>Handoff</strong> — Specially formatted document designed to be pasted into another LLM so it can continue the exact same conversation with full context (including attached files and your notes).</li>
            </ul>
          </DocsSection>

          {/* SETTINGS EXPLAINED */}
          <DocsSection title="Settings Explained" open={openDocsSections.has('settings')} onToggle={() => toggleDocsSection('settings')}>
            <ul className="space-y-3 text-muted-foreground">
              <li><strong>Image Quality</strong> — Controls how much photos are compressed before being sent. "Fast" = smaller files, faster responses. "High" = maximum detail.</li>
              <li><strong>Chat Font Size</strong> — Changes the font size of messages and the input box.</li>
              <li><strong>System Prompt</strong> — A global instruction sent with every conversation (you can override per-thread via the notepad if needed).</li>
              <li><strong>Custom Models</strong> — You can enter any model ID supported by your provider.</li>
            </ul>
          </DocsSection>

          {/* TIPS */}
          <DocsSection title="Tips for Best Results" open={openDocsSections.has('tips')} onToggle={() => toggleDocsSection('tips')}>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li>Write a strong system prompt — it dramatically improves response quality.</li>
              <li>Use Projects to keep long-running research or client work organized.</li>
              <li>When sharing with others, password-protect important threads.</li>
              <li>The Handoff format is excellent when you want to switch models mid-conversation.</li>
              <li>Keep your API keys secure — treat them like passwords.</li>
            </ul>
          </DocsSection>

          {/* KEYBOARD SHORTCUTS */}
          <DocsSection title="Keyboard Shortcuts" open={openDocsSections.has('shortcuts')} onToggle={() => toggleDocsSection('shortcuts')}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between border-b border-border/60 py-1">
                <span>Send message</span>
                <span className="font-mono text-xs text-foreground">Enter</span>
              </div>
              <div className="flex justify-between border-b border-border/60 py-1">
                <span>New line</span>
                <span className="font-mono text-xs text-foreground">Shift + Enter</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Close modals</span>
                <span className="font-mono text-xs text-foreground">Esc</span>
              </div>
            </div>
          </DocsSection>

          {/* PRIVACY & SECURITY (moved to bottom) */}
          <DocsSection title="Privacy &amp; Security" open={openDocsSections.has('privacy')} onToggle={() => toggleDocsSection('privacy')}>
            <p className="mb-2">Champ Ai is built from the ground up with privacy as the #1 priority.</p>
            <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground">
              <li><strong>Everything stays local</strong> — All conversations, attached files (images, PDFs, documents, spreadsheets, etc.), notes, and settings are stored only on your device using IndexedDB and localStorage.</li>
              <li><strong>Your API keys never leave your browser</strong> — They are sent <em>only</em> to the provider you choose (Grok, Claude, or Gemini) when making requests.</li>
              <li><strong>No accounts, no backend, no telemetry</strong> — We don't know who you are, what you talk about, or which models you use.</li>
              <li><strong>Sharing</strong> — Use the Share button to generate a Markdown copy of any thread. You can copy it or download it as a <code>.md</code> file and send it to someone. They can import it using the Import button.</li>
            </ul>
          </DocsSection>

          <div className="pt-6 mt-2 border-t text-xs text-muted-foreground/80">
            Champ Ai is designed to be the simplest possible private interface for any OpenAI-compatible LLM. 
            Everything you see here is intentional — no accounts, no tracking, just you and your models.
          </div>
        </div>
      )}

    </Modal>
  )
}

