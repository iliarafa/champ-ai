import Dexie, { type EntityTable } from 'dexie'

export type Theme = 'light' | 'dark' | 'system'
export type ProviderId = 'grok' | 'claude' | 'gemini'

export interface SettingsRow {
  id: 1
  currentProvider: ProviderId

  // Per-provider models
  grokModel: string
  claudeModel: string
  geminiModel: string

  systemPrompt: string
  theme: Theme
  imageQualityPreset: 'high' | 'balanced' | 'fast'
  chatFontSize: 'sm' | 'md' | 'lg' | 'xl'
}

export interface Thread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  notes?: string
}

export type MessageRole = 'user' | 'assistant'

export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: string } // base64 without data: prefix

export interface Message {
  id: string
  threadId: string
  role: MessageRole
  content: MessageContentPart[]
  createdAt: number
}

export const db = new Dexie('champ-ai') as Dexie & {
  settings: EntityTable<SettingsRow, 'id'>
  threads: EntityTable<Thread, 'id'>
  messages: EntityTable<Message, 'id'>
}

db.version(1).stores({
  settings: 'id',
  threads: 'id, updatedAt',
  messages: 'id, threadId, createdAt',
})

export const SETTINGS_DEFAULTS: SettingsRow = {
  id: 1,
  currentProvider: 'grok',

  grokModel: 'grok-3-latest',
  claudeModel: 'claude-3-5-sonnet-latest',
  geminiModel: 'gemini-1.5-pro',

  systemPrompt: '',
  theme: 'system',
  imageQualityPreset: 'balanced',
  chatFontSize: 'md',
}

export async function loadSettings(): Promise<SettingsRow> {
  const row = await db.settings.get(1)
  if (!row) return SETTINGS_DEFAULTS
  return { ...SETTINGS_DEFAULTS, ...row, id: 1 }
}

export async function saveSettings(patch: Partial<Omit<SettingsRow, 'id'>>): Promise<void> {
  const current = await loadSettings()
  await db.settings.put({ ...current, ...patch, id: 1 })
}

export async function loadThreads(): Promise<Thread[]> {
  return db.threads.orderBy('updatedAt').reverse().toArray()
}

export async function createThread(title: string): Promise<Thread> {
  const now = Date.now()
  const thread: Thread = {
    id: crypto.randomUUID ? crypto.randomUUID() : 't_' + Math.random().toString(36).slice(2),
    title: title || 'New chat',
    createdAt: now,
    updatedAt: now,
    notes: '',
  }
  await db.threads.put(thread)
  return thread
}

export async function updateThreadTitle(id: string, title: string): Promise<void> {
  await db.threads.update(id, { title, updatedAt: Date.now() })
}

export async function updateThreadNotes(id: string, notes: string): Promise<void> {
  await db.threads.update(id, { notes, updatedAt: Date.now() })
}

export async function touchThread(id: string): Promise<void> {
  await db.threads.update(id, { updatedAt: Date.now() })
}

export async function deleteThread(id: string): Promise<void> {
  await db.transaction('rw', db.threads, db.messages, async () => {
    await db.messages.where('threadId').equals(id).delete()
    await db.threads.delete(id)
  })
}

export async function loadMessages(threadId: string): Promise<Message[]> {
  return db.messages.where('threadId').equals(threadId).sortBy('createdAt')
}

export async function persistMessages(threadId: string, messages: Message[]): Promise<void> {
  await db.transaction('rw', db.messages, async () => {
    await db.messages.where('threadId').equals(threadId).delete()
    if (messages.length) await db.messages.bulkPut(messages)
  })
  await touchThread(threadId)
}
