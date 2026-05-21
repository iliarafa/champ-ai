import { parseSSEStream } from '@/lib/sse';
import { ProviderError, type StreamEvent, type StreamRequest } from './types';

export async function* streamGemini(req: StreamRequest): AsyncGenerator<StreamEvent> {
  const model = req.model || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${req.apiKey}`;

  // Convert messages to Gemini format
  const contents = req.messages
    .filter(m => m.role !== 'system')
    .map(m => {
      const parts: any[] = [];

      if (typeof m.content === 'string') {
        parts.push({ text: m.content });
      } else {
        m.content.forEach(part => {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image') {
            parts.push({
              inlineData: {
                mimeType: part.mediaType,
                data: part.data,
              },
            });
          }
        });
      }

      // Gemini uses 'user' and 'model' roles
      const role = m.role === 'assistant' ? 'model' : 'user';

      return { role, parts };
    });

  const body: any = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  };

  if (req.systemPrompt?.trim()) {
    body.systemInstruction = {
      parts: [{ text: req.systemPrompt.trim() }],
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: req.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new ProviderError(`Gemini request failed (${res.status}): ${text}`, {
      status: res.status,
      body: text,
    });
  }

  for await (const evt of parseSSEStream(res.body)) {
    if (!evt.data) continue;

    // Gemini streaming returns JSON lines with candidates
    try {
      // Sometimes it's wrapped in array or has leading [ 
      let dataStr = evt.data.trim();
      if (dataStr.startsWith('[')) dataStr = dataStr.slice(1);
      if (dataStr.endsWith(']')) dataStr = dataStr.slice(0, -1);
      if (!dataStr) continue;

      const data = JSON.parse(dataStr);

      const candidate = data.candidates?.[0];
      const part = candidate?.content?.parts?.[0];

      if (part?.text) {
        yield { type: 'text-delta', text: part.text };
      }

      if (candidate?.finishReason) {
        yield { type: 'done' };
        return;
      }
    } catch {
      // ignore malformed chunks
    }
  }

  yield { type: 'done' };
}
