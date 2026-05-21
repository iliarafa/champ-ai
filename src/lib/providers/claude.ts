import { parseSSEStream } from '@/lib/sse';
import { ProviderError, type StreamEvent, type StreamRequest } from './types';

export async function* streamClaude(req: StreamRequest): AsyncGenerator<StreamEvent> {
  const url = 'https://api.anthropic.com/v1/messages';

  // Convert our messages to Anthropic format
  const messages = req.messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (typeof m.content === 'string') {
        return { role: m.role, content: m.content };
      }

      const content = m.content.map(part => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        }
        if (part.type === 'image') {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.mediaType,
              data: part.data,
            },
          };
        }
        return part;
      });

      return { role: m.role, content };
    });

  const body: any = {
    model: req.model,
    max_tokens: 8192,
    messages,
    stream: true,
  };

  if (req.systemPrompt?.trim()) {
    body.system = req.systemPrompt.trim();
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new ProviderError(`Claude request failed (${res.status}): ${text}`, {
      status: res.status,
      body: text,
    });
  }

  for await (const evt of parseSSEStream(res.body)) {
    if (!evt.data) continue;

    if (evt.event === 'content_block_delta') {
      try {
        const data = JSON.parse(evt.data);
        if (data.delta?.type === 'text_delta' && data.delta.text) {
          yield { type: 'text-delta', text: data.delta.text };
        }
      } catch {
        // ignore parse errors
      }
    }

    if (evt.event === 'message_stop') {
      yield { type: 'done' };
      return;
    }
  }

  yield { type: 'done' };
}
