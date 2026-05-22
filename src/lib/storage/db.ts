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
  projectId?: string | null   // null or undefined = uncategorized
}

export interface Project {
  id: string
  name: string
  color?: string
  createdAt: number
  updatedAt: number
  sortOrder?: number
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
  projects: EntityTable<Project, 'id'>
}

db.version(1).stores({
  settings: 'id',
  threads: 'id, updatedAt',
  messages: 'id, threadId, createdAt',
})

// Version 2: Add Projects + projectId on threads (local-first cowork foundation)
db.version(2).stores({
  settings: 'id',
  threads: 'id, updatedAt, projectId',
  messages: 'id, threadId, createdAt',
  projects: 'id, updatedAt, sortOrder',
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

/* ========================= PROJECTS (Path 1 - Local-first cowork) ========================= */

export async function loadProjects(): Promise<Project[]> {
  return db.projects.orderBy('sortOrder').toArray()
}

export async function createProject(name: string, color?: string): Promise<Project> {
  const now = Date.now()
  const project: Project = {
    id: crypto.randomUUID ? crypto.randomUUID() : 'p_' + Math.random().toString(36).slice(2),
    name: name.trim() || 'New Project',
    color,
    createdAt: now,
    updatedAt: now,
    sortOrder: Date.now(), // simple initial ordering
  }
  await db.projects.put(project)
  return project
}

export async function updateProject(id: string, patch: Partial<Pick<Project, 'name' | 'color' | 'sortOrder'>>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteProject(id: string): Promise<void> {
  // Move any threads in this project back to uncategorized (null)
  await db.transaction('rw', db.projects, db.threads, async () => {
    await db.threads.where('projectId').equals(id).modify({ projectId: null, updatedAt: Date.now() })
    await db.projects.delete(id)
  })
}

export async function assignThreadToProject(threadId: string, projectId: string | null): Promise<void> {
  await db.threads.update(threadId, { projectId, updatedAt: Date.now() })
}

export async function loadThreadsByProject(projectId: string | null): Promise<Thread[]> {
  if (projectId === null) {
    // Uncategorized: projectId is null or missing
    return db.threads
      .filter((t) => t.projectId == null)
      .toArray()
  }
  return db.threads.where('projectId').equals(projectId).toArray()
}
