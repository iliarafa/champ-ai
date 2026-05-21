// Adapted from ai4me (same author) — proven SSE parser for OpenAI-compatible streams
export interface SSEEvent {
  event?: string
  data: string
}

export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const evt = parseChunk(raw)
        if (evt) yield evt
      }
    }
    if (buffer.trim()) {
      const evt = parseChunk(buffer)
      if (evt) yield evt
    }
  } finally {
    reader.releaseLock()
  }
}

function parseChunk(raw: string): SSEEvent | null {
  let event: string | undefined
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      const v = line.slice(5)
      dataLines.push(v.startsWith(' ') ? v.slice(1) : v)
    }
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}
