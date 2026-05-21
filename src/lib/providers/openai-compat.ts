import { parseSSEStream } from '@/lib/sse'
import { ProviderError, type StreamEvent, type StreamRequest } from './types'

interface OpenAIChatDelta {
  content?: string
  role?: string
}

interface OpenAIChatChoice {
  delta?: OpenAIChatDelta
  finish_reason?: string | null
}

interface OpenAIStreamChunk {
  choices?: OpenAIChatChoice[]
  error?: { message?: string }
}

export async function* streamOpenAICompat(req: StreamRequest): AsyncGenerator<StreamEvent> {
  const base = req.baseURL.replace(/\/+$/, '')
  const url = `${base}/chat/completions`

  const messages: StreamRequest['messages'] = []
  if (req.systemPrompt && req.systemPrompt.trim()) {
    messages.push({ role: 'system', content: req.systemPrompt.trim() })
  }
  messages.push(...req.messages)

  const body: Record<string, unknown> = {
    model: req.model,
    stream: true,
    messages,
  }

  // Web search support (primarily for xAI/Grok; most other OpenAI-compatible
  // servers safely ignore unknown top-level keys)
  if (req.webSearchEnabled) {
    body.search_parameters = { mode: 'on' }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: req.signal,
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    let msg = `Request failed (${res.status})`
    try {
      const j = JSON.parse(text)
      if (j?.error?.message) msg = j.error.message
    } catch {
      if (text) msg = text.slice(0, 200)
    }
    throw new ProviderError(msg, { status: res.status, body: text })
  }

  for await (const evt of parseSSEStream(res.body)) {
    if (!evt.data) continue
    if (evt.data === '[DONE]') {
      yield { type: 'done' }
      return
    }

    let payload: OpenAIStreamChunk
    try {
      payload = JSON.parse(evt.data) as OpenAIStreamChunk
    } catch {
      continue
    }

    if (payload.error?.message) {
      yield { type: 'error', message: payload.error.message }
      return
    }

    const choice = payload.choices?.[0]
    const delta = choice?.delta?.content
    if (typeof delta === 'string' && delta.length > 0) {
      yield { type: 'text-delta', text: delta }
    }

    if (choice?.finish_reason) {
      yield { type: 'done' }
      return
    }
  }

  yield { type: 'done' }
}
