/**
 * Portable encrypted thread format for Path 1 (ChampShare v1)
 *
 * This format is designed to be:
 * - Self-contained (everything needed to restore a thread lives inside)
 * - Optionally encrypted with a user passphrase
 * - Human-inspectable when unencrypted (valid JSON)
 * - Easy to transport (copy/paste or .champ file)
 */

import type { Thread, Message } from '@/lib/storage/db'
import { encryptString, decryptString } from '@/lib/crypto'

export const CHAMPSHARE_VERSION = 1 as const
export const FILE_EXTENSION = '.champ'

export interface ChampShareMeta {
  title: string
  originalProjectName?: string
  messageCount: number
  imageCount: number
  hasNotes: boolean
}

export interface ChampShareV1 {
  v: typeof CHAMPSHARE_VERSION
  type: 'thread'
  exportedAt: number
  app: 'champ-ai'
  meta: ChampShareMeta
  encryption: {
    method: 'none' | 'aes-256-gcm-pbkdf2'
    saltB64?: string
    ivB64?: string
  }
  payload: string // plaintext JSON or base64(ciphertext)
}

export interface ThreadPayload {
  thread: {
    title: string
    notes?: string
    createdAt: number
    updatedAt: number
  }
  messages: Message[]
  systemPrompt?: string
}

/* --------------------------- Packing --------------------------- */

export interface PackThreadInput {
  thread: Thread
  messages: Message[]
  systemPrompt?: string
  originalProjectName?: string
}

export async function packThread(
  input: PackThreadInput,
  password?: string
): Promise<ChampShareV1> {
  const imageCount = input.messages.reduce(
    (sum, m) =>
      sum +
      m.content.filter((p) => p.type === 'image').length,
    0
  )

  const hasNotes = Boolean(input.thread.notes?.trim())

  const innerPayload: ThreadPayload = {
    thread: {
      title: input.thread.title,
      notes: input.thread.notes,
      createdAt: input.thread.createdAt,
      updatedAt: input.thread.updatedAt,
    },
    messages: input.messages,
    systemPrompt: input.systemPrompt,
  }

  const payloadJson = JSON.stringify(innerPayload)

  const encrypted = await encryptString(payloadJson, password)

  const meta: ChampShareMeta = {
    title: input.thread.title,
    originalProjectName: input.originalProjectName,
    messageCount: input.messages.length,
    imageCount,
    hasNotes,
  }

  return {
    v: CHAMPSHARE_VERSION,
    type: 'thread',
    exportedAt: Date.now(),
    app: 'champ-ai',
    meta,
    encryption: {
      method: password ? 'aes-256-gcm-pbkdf2' : 'none',
      saltB64: encrypted.salt,
      ivB64: encrypted.iv,
    },
    payload: encrypted.ciphertext,
  }
}

/* --------------------------- Unpacking --------------------------- */

export interface UnpackResult {
  payload: ThreadPayload
  meta: ChampShareMeta
  originalProjectName?: string
}

export async function unpackThread(
  share: ChampShareV1,
  password?: string
): Promise<UnpackResult> {
  if (share.v !== CHAMPSHARE_VERSION) {
    throw new Error(`Unsupported ChampShare version: ${share.v}`)
  }
  if (share.type !== 'thread') {
    throw new Error(`Unsupported ChampShare type: ${share.type}`)
  }

  const decryptedJson = await decryptString(
    {
      ciphertext: share.payload,
      salt: share.encryption.saltB64,
      iv: share.encryption.ivB64,
    },
    password
  )

  let inner: ThreadPayload
  try {
    inner = JSON.parse(decryptedJson) as ThreadPayload
  } catch (e) {
    throw new Error('Failed to parse thread payload (corrupted data?)')
  }

  return {
    payload: inner,
    meta: share.meta,
    originalProjectName: share.meta.originalProjectName,
  }
}

/* --------------------------- Helpers --------------------------- */

export function isChampShare(data: unknown): data is ChampShareV1 {
  return (
    typeof data === 'object' &&
    data !== null &&
    'v' in data &&
    (data as any).v === CHAMPSHARE_VERSION &&
    (data as any).type === 'thread'
  )
}

export function shareToJSON(share: ChampShareV1): string {
  return JSON.stringify(share, null, 2)
}

export function shareToCompactString(share: ChampShareV1): string {
  return JSON.stringify(share)
}