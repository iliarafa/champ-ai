import type { MessageContentPart } from '@/lib/storage/db'

export interface StreamRequest {
  apiKey: string
  baseURL: string
  model: string
  systemPrompt?: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string | MessageContentPart[]
  }>
  webSearchEnabled?: boolean
  signal?: AbortSignal
}

export type StreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export class ProviderError extends Error {
  status?: number
  body?: unknown
  constructor(message: string, opts: { status?: number; body?: unknown } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = opts.status
    this.body = opts.body
  }
}
