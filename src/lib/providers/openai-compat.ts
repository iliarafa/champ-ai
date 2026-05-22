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

  const messages = req.messages.map((m) => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content }
    }

    // Convert our MessageContentPart[] to OpenAI vision format
    const parts = m.content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      }
      if (part.type === 'image') {
        return {
          type: 'image_url',
          image_url: {
            url: `data:${part.mediaType};base64,${part.data}`,
          },
        }
      }
      if (part.type === 'file') {
        // Grok fallback: prefer pre-extracted text (from docx/xlsx/json etc.) when available.
        // Otherwise fall back to decoding the original bytes.
        const content = part.extractedText || (() => {
          try { return atob(part.data); } catch { return '[binary content]'; }
        })();
        const header = `Attached file: ${part.name || 'document'} (${part.mediaType})\n\n`;
        return { type: 'text', text: header + content };
      }
      return part
    })

    return {
      role: m.role,
      content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts,
    }
  })

  if (req.systemPrompt && req.systemPrompt.trim()) {
    messages.unshift({ role: 'system', content: req.systemPrompt.trim() })
  }

  const body: Record<string, unknown> = {
    model: req.model,
    stream: true,
    messages,
  }

  // Web search support (primarily for xAI/Grok)
  // xAI currently recommends search_parameters for Grok models.
  // Using the tools/live_search format has been returning 410 for some users.
  if (req.webSearchEnabled) {
    body.search_parameters = {
      mode: "on",
      sources: ["web", "x"],
    }
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
      if (j?.error?.message) {
        msg = j.error.message
      } else if (text) {
        msg = `${msg}: ${text.slice(0, 300)}`
      }
    } catch {
      if (text) msg = `${msg}: ${text.slice(0, 300)}`
    }

    // Give a friendlier message for search-related 410s
    if (res.status === 410 && req.webSearchEnabled) {
      msg = "Web search is currently not available on your xAI account (received 410). This feature is being rolled out gradually and may require a paid plan. You can disable the globe icon for now."
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
