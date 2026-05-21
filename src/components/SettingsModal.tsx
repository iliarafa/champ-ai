import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
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
        { id: 'claude-4.7', label: 'Claude 4.7 Opus' },
        { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (New)' },
        { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
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

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

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
    </Modal>
  )
}

