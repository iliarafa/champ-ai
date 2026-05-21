// Key storage — localStorage on web (easy to swap for Capacitor Preferences)
// Everything stays on-device. Matches the pattern from ai4me.

export interface KeyStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

const PREFIX = 'champ-ai:secret:'

const localStorageKeyStore: KeyStore = {
  async get(key) {
    try {
      return localStorage.getItem(PREFIX + key)
    } catch {
      return null
    }
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value)
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key)
  },
}

export const keys: KeyStore = localStorageKeyStore

export const KEY_LLM = 'llm_api_key'
