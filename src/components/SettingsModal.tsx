import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useSettings } from '@/state/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsModal({ open, onOpenChange }: Props) {
  const settings = useSettings()

  const [apiKey, setApiKey] = useState('')
  const [baseURL, setBaseURL] = useState('')
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [imageQualityPreset, setImageQualityPreset] = useState<'high' | 'balanced' | 'fast'>('balanced')
  const [saving, setSaving] = useState(false)
  const [testStatus, setTestStatus] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setApiKey(settings.apiKey)
    setBaseURL(settings.baseURL)
    setModel(settings.model)
    setSystemPrompt(settings.systemPrompt)
    setTheme(settings.theme)
    setImageQualityPreset(settings.imageQualityPreset ?? 'balanced')
    setTestStatus('')
  }, [open, settings])

  async function handleSave() {
    setSaving(true)
    try {
      await settings.setApiKey(apiKey)
      await settings.updateConfig({
        baseURL: baseURL.trim() || 'https://api.x.ai/v1',
        model: model.trim() || 'grok-3-latest',
        systemPrompt,
        imageQualityPreset,
      })
      await settings.setTheme(theme)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTestStatus('Testing...')
    const key = apiKey.trim()
    const url = (baseURL.trim() || 'https://api.x.ai/v1').replace(/\/+$/, '')
    if (!key) {
      setTestStatus('Enter a key first')
      return
    }
    try {
      const res = await fetch(`${url}/models`, {
        headers: { authorization: `Bearer ${key}` },
      })
      if (res.ok) {
        setTestStatus('✓ Connection OK')
      } else {
        setTestStatus(`✕ ${res.status} ${res.statusText}`)
      }
    } catch (e: any) {
      setTestStatus(`✕ ${e.message || 'Network error'}`)
    }
  }

  const presets = [
    { label: 'xAI Grok', base: 'https://api.x.ai/v1', model: 'grok-3-latest' },
    { label: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { label: 'Groq (fast)', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    { label: 'Ollama (local)', base: 'http://localhost:11434/v1', model: 'llama3.2' },
  ]

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 text-sm">
        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">API KEY</label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-... or xai-..."
            className="font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Stored only in your browser.</p>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1.5">BASE URL + MODEL</label>
          <div className="flex gap-2">
            <Input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.x.ai/v1" className="font-mono text-xs" />
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="grok-3-latest" className="font-mono text-xs w-48" />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setBaseURL(p.base); setModel(p.model) }}
                className="text-[10px] px-2 py-0.5 rounded border hover:bg-muted"
              >
                {p.label}
              </button>
            ))}
          </div>
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

