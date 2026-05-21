import { streamOpenAICompat } from './openai-compat'
import { streamClaude } from './claude'
import { streamGemini } from './gemini'
import type { StreamEvent, StreamRequest } from './types'
import type { ProviderId } from '@/lib/storage/db'

// Central dispatcher for all providers.
export async function* streamProvider(
  provider: ProviderId,
  request: StreamRequest
): AsyncGenerator<StreamEvent> {
  if (provider === 'grok') {
    yield* streamOpenAICompat(request)
  } else if (provider === 'claude') {
    yield* streamClaude(request)
  } else if (provider === 'gemini') {
    yield* streamGemini(request)
  } else {
    throw new Error(`Unsupported provider: ${provider}`)
  }
}

export type { ProviderId, StreamRequest, StreamEvent }
export { ProviderError } from './types'
