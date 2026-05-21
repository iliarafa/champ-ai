import { create } from 'zustand'
import { loadSettings, saveSettings, type Theme, type SettingsRow } from '@/lib/storage/db'
import { keys, KEY_LLM } from '@/lib/storage/keys'

export interface SettingsState {
  hydrated: boolean
  apiKey: string
  baseURL: string
  model: string
  systemPrompt: string
  theme: Theme
  imageQualityPreset: 'high' | 'balanced' | 'fast'
  chatFontSize: 'sm' | 'md' | 'lg' | 'xl'

  hydrate: () => Promise<void>
  setApiKey: (value: string) => Promise<void>
  updateConfig: (patch: Partial<Omit<SettingsRow, 'id' | 'theme'>>) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  apiKey: '',
  baseURL: 'https://api.x.ai/v1',
  model: 'grok-3-latest',
  systemPrompt: '',
  theme: 'system',
  imageQualityPreset: 'balanced',
  chatFontSize: 'md',

  async hydrate() {
    if (get().hydrated) return
    const [row, apiKey] = await Promise.all([
      loadSettings(),
      keys.get(KEY_LLM),
    ])
    set({
      hydrated: true,
      apiKey: apiKey ?? '',
      baseURL: row.baseURL,
      model: row.model,
      systemPrompt: row.systemPrompt,
      theme: row.theme,
      imageQualityPreset: row.imageQualityPreset ?? 'balanced',
      chatFontSize: row.chatFontSize ?? 'md',
    })
  },

  async setApiKey(value) {
    const trimmed = value.trim()
    if (trimmed) {
      await keys.set(KEY_LLM, trimmed)
    } else {
      await keys.delete(KEY_LLM)
    }
    set({ apiKey: trimmed })
  },

  async updateConfig(patch) {
    const current = {
      baseURL: get().baseURL,
      model: get().model,
      systemPrompt: get().systemPrompt,
      theme: get().theme,
    }
    const next = { ...current, ...patch }
    await saveSettings(next)
    set(next)
  },

  async setTheme(theme) {
    set({ theme })
    await saveSettings({ theme })
  },
}))
