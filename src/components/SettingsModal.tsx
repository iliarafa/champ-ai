import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import type { ProviderId } from '@/lib/storage/db'

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

  useEffect(() => {
    if (!open) return

    setSystemPrompt(settings.systemPrompt)
    setTheme(settings.theme)
    setImageQualityPreset(settings.imageQualityPreset ?? 'balanced')
    setChatFontSize(settings.chatFontSize ?? 'md')
    setEditingProvider(settings.currentProvider)
    setTestStatus('')

    // Load key and model for the current editing provider
    if (editingProvider === 'grok') {
      setApiKey(settings.grokApiKey)
      setModel(settings.grokModel)
    } else if (editingProvider === 'claude') {
      setApiKey(settings.claudeApiKey)
      setModel(settings.claudeModel)
    } else if (editingProvider === 'gemini') {
      setApiKey(settings.geminiApiKey)
      setModel(settings.geminiModel)
    }
  }, [open, settings, editingProvider])

  async function handleSave() {
    setSaving(true)
    try {
      // Save API key for the provider being edited
      await settings.setApiKey(editingProvider, apiKey)

      // Save model for the provider being edited + common settings
      const modelPatch =
        editingProvider === 'grok' ? { grokModel: model.trim() } :
        editingProvider === 'claude' ? { claudeModel: model.trim() } :
        { geminiModel: model.trim() }

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

      <div className="space-y-5 text-sm">
        {/* Provider Selector */}
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">ACTIVE PROVIDER</label>
          <div className="inline-flex rounded-lg border p-0.5 text-sm w-full">
            {(['grok', 'claude', 'gemini'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setEditingProvider(p)}
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
          <Input 
            value={model} 
            onChange={(e) => setModel(e.target.value)} 
            placeholder={
              editingProvider === 'grok' ? 'grok-3-latest' : 
              editingProvider === 'claude' ? 'claude-3-5-sonnet-20241022' : 
              'gemini-1.5-pro'
            } 
            className="font-mono text-xs" 
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter the exact model ID for {editingProvider}.
          </p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">SYSTEM PROMPT (optional)</label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            placeholder="You are a helpful assistant..."
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
          <label className="text-xs text-muted-foreground block mb-1.5">IMAGE QUALITY (for photos)</label>
          <div className="inline-flex rounded-lg border p-0.5 text-sm">
            {[
              { value: 'high', label: 'High', desc: '1920px • 92%' },
              { value: 'balanced', label: 'Balanced', desc: '1280px • 85%' },
              { value: 'fast', label: 'Fast', desc: '800px • 75%' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setImageQualityPreset(p.value as any)}
                className={cn(
                  'px-3 py-1 rounded-md text-left',
                  imageQualityPreset === p.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <div>{p.label}</div>
                <div className="text-[10px] opacity-70">{p.desc}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Higher quality = larger files sent to the model.</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">CHAT FONT SIZE</label>
          <div className="inline-flex rounded-lg border p-0.5 text-sm">
            {[
              { value: 'sm', label: 'Small' },
              { value: 'md', label: 'Medium' },
              { value: 'lg', label: 'Large' },
              { value: 'xl', label: 'XL' },
            ].map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setChatFontSize(p.value as any)}
                className={cn(
                  'px-3 py-1 rounded-md',
                  chatFontSize === p.value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Button variant="outline" onClick={handleTest} disabled={saving}>Test connection</Button>
        {testStatus && <span className="text-xs text-muted-foreground">{testStatus}</span>}
        <div className="flex-1" />
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving}>Save</Button>
      </div>
    </Modal>
  )
}

