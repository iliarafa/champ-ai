import { create } from 'zustand'
import { loadSettings, saveSettings, type Theme, type SettingsRow, type ProviderId, SETTINGS_DEFAULTS } from '@/lib/storage/db'
import { keys, KEY_GROK, KEY_CLAUDE, KEY_GEMINI } from '@/lib/storage/keys'

export interface SettingsState {
  hydrated: boolean
  currentProvider: ProviderId

  grokApiKey: string
  claudeApiKey: string
  geminiApiKey: string

  grokModel: string
  claudeModel: string
  geminiModel: string

  systemPrompt: string
  theme: Theme
  imageQualityPreset: 'high' | 'balanced' | 'fast'
  chatFontSize: 'sm' | 'md' | 'lg' | 'xl'

  hydrate: () => Promise<void>
  setApiKey: (provider: ProviderId, value: string) => Promise<void>
  updateConfig: (patch: Partial<Omit<SettingsRow, 'id' | 'theme'>>) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setCurrentProvider: (provider: ProviderId) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  currentProvider: 'grok',

  grokApiKey: '',
  claudeApiKey: '',
  geminiApiKey: '',

  grokModel: SETTINGS_DEFAULTS.grokModel,
  claudeModel: SETTINGS_DEFAULTS.claudeModel,
  geminiModel: SETTINGS_DEFAULTS.geminiModel,

  systemPrompt: '',
  theme: 'system',
  imageQualityPreset: 'balanced',
  chatFontSize: 'md',

  async hydrate() {
    if (get().hydrated) return

    const row = await loadSettings()

    const [grokKey, claudeKey, geminiKey] = await Promise.all([
      keys.get(KEY_GROK),
      keys.get(KEY_CLAUDE),
      keys.get(KEY_GEMINI),
    ])

    set({
      hydrated: true,
      currentProvider: row.currentProvider,

      grokApiKey: grokKey ?? '',
      claudeApiKey: claudeKey ?? '',
      geminiApiKey: geminiKey ?? '',

      grokModel: row.grokModel,
      claudeModel: row.claudeModel,
      geminiModel: row.geminiModel,

      systemPrompt: row.systemPrompt,
      theme: row.theme,
      imageQualityPreset: row.imageQualityPreset ?? 'balanced',
      chatFontSize: row.chatFontSize ?? 'md',
    })
  },

  async setApiKey(provider, value) {
    const trimmed = value.trim()
    const keyConstant =
      provider === 'grok' ? KEY_GROK :
      provider === 'claude' ? KEY_CLAUDE : KEY_GEMINI

    if (trimmed) {
      await keys.set(keyConstant, trimmed)
    } else {
      await keys.delete(keyConstant)
    }

    const patch =
      provider === 'grok' ? { grokApiKey: trimmed } :
      provider === 'claude' ? { claudeApiKey: trimmed } :
      { geminiApiKey: trimmed }

    set(patch)
  },

  async updateConfig(patch) {
    set(patch)
    await saveSettings(patch)
  },

  async setTheme(theme) {
    set({ theme })
    await saveSettings({ theme })
  },

  async setCurrentProvider(provider) {
    set({ currentProvider: provider })
    await saveSettings({ currentProvider: provider })
  },
}))
