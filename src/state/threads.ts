import { create } from 'zustand'
import {
  createThread,
  deleteThread,
  loadMessages,
  loadThreads,
  persistMessages,
  touchThread,
  updateThreadTitle,
  type Message,
  type Thread,
  type MessageContentPart,
} from '@/lib/storage/db'
import { useSettings } from './settings'
import { streamOpenAICompat, ProviderError } from '@/lib/providers'
import { getTextFromContent } from '@/lib/utils'

export interface ThreadsState {
  hydrated: boolean
  threads: Thread[]
  currentThreadId: string | null
  messages: Message[]
  isStreaming: boolean
  streamingMessageId: string | null
  error: string | null

  hydrate: () => Promise<void>
  newChat: () => Promise<void>
  switchThread: (id: string) => Promise<void>
  sendMessage: (
    text: string,
    opts?: {
      webSearch?: boolean
      attachments?: Array<{ mediaType: string; data: string }>
    }
  ) => Promise<void>
  cancel: () => void
  regenerateLast: () => Promise<void>
  editAndResend: (messageId: string, newText: string) => Promise<void>
  deleteCurrent: () => Promise<void>
  renameCurrent: (title: string) => Promise<void>
  clearError: () => void
}

let abortController: AbortController | null = null

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 42 ? t.slice(0, 39) + '…' : t || 'New chat'
}

export const useThreads = create<ThreadsState>((set, get) => ({
  hydrated: false,
  threads: [],
  currentThreadId: null,
  messages: [],
  isStreaming: false,
  streamingMessageId: null,
  error: null,

  async hydrate() {
    if (get().hydrated) return
    const threads = await loadThreads()
    let currentId: string | null = null
    let msgs: Message[] = []

    if (threads.length > 0) {
      currentId = threads[0].id
      msgs = await loadMessages(currentId)
    } else {
      // Create a welcome thread on first run
      const welcome = await createThread('Welcome')
      currentId = welcome.id
      const welcomeMsg: Message = {
        id: newId(),
        threadId: currentId,
        role: 'assistant',
        content: [{ type: 'text', text: 'Welcome to Champ Ai. Add your LLM API key in Settings and start chatting.' }],
        createdAt: Date.now(),
      }
      await persistMessages(currentId, [welcomeMsg])
      msgs = [welcomeMsg]
    }

    set({
      hydrated: true,
      threads,
      currentThreadId: currentId,
      messages: msgs,
    })
  },

  async newChat() {
    const { currentThreadId, messages } = get()
    if (currentThreadId) {
      // ensure latest messages are saved (no-op if already persisted during streaming)
      await persistMessages(currentThreadId, messages)
    }

    const thread = await createThread('New chat')
    set({
      threads: [thread, ...get().threads.filter((t) => t.id !== thread.id)],
      currentThreadId: thread.id,
      messages: [],
      error: null,
    })
  },

  async switchThread(id: string) {
    const { currentThreadId, messages } = get()
    if (id === currentThreadId) return
    if (currentThreadId) {
      await persistMessages(currentThreadId, messages)
    }
    const msgs = await loadMessages(id)
    set({
      currentThreadId: id,
      messages: msgs,
      error: null,
    })
  },

  async sendMessage(text, opts = {}) {
    const trimmed = text.trim()
    const attachments = opts.attachments ?? []
    if ((!trimmed && attachments.length === 0) || get().isStreaming) return

    const settings = useSettings.getState()
    if (!settings.apiKey) {
      set({ error: 'Add your API key in Settings first.' })
      return
    }

    const { currentThreadId } = get()
    if (!currentThreadId) {
      await get().newChat()
    }

    const threadId = get().currentThreadId!
    const now = Date.now()

    const userContent: MessageContentPart[] = []
    if (trimmed) userContent.push({ type: 'text', text: trimmed })
    attachments.forEach((att) => {
      userContent.push({ type: 'image', mediaType: att.mediaType, data: att.data })
    })

    const userMsg: Message = {
      id: newId(),
      threadId,
      role: 'user',
      content: userContent,
      createdAt: now,
    }

    let msgs = [...get().messages, userMsg]
    set({ messages: msgs, error: null })

    // Auto-title from first user message (use first text part)
    const firstText = userContent.find((p) => p.type === 'text')?.text ?? ''
    const thread = get().threads.find((t) => t.id === threadId)
    if (thread && thread.title === 'New chat' && firstText) {
      const title = deriveTitle(firstText)
      await updateThreadTitle(threadId, title)
      set({
        threads: get().threads.map((t) => (t.id === threadId ? { ...t, title } : t)),
      })
    }

    const assistantMsg: Message = {
      id: newId(),
      threadId,
      role: 'assistant',
      content: [{ type: 'text', text: '' }],
      createdAt: now + 1,
    }
    msgs = [...msgs, assistantMsg]
    set({
      messages: msgs,
      isStreaming: true,
      streamingMessageId: assistantMsg.id,
    })

    abortController = new AbortController()
    const signal = abortController.signal

    // Build history for the request
    const history = msgs
      .filter((m) => m.id !== assistantMsg.id)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      for await (const evt of streamOpenAICompat({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
        model: settings.model,
        systemPrompt: settings.systemPrompt || undefined,
        messages: history,
        webSearchEnabled: opts.webSearch,
        signal,
      })) {
        if (signal.aborted) break
        const current = get().messages
        const idx = current.findIndex((m) => m.id === assistantMsg.id)
        if (idx === -1) break

        if (evt.type === 'text-delta') {
          const currentAssistant = current[idx]
          const lastPart = currentAssistant.content[currentAssistant.content.length - 1]

          let updatedContent: MessageContentPart[]
          if (lastPart && lastPart.type === 'text') {
            updatedContent = [
              ...currentAssistant.content.slice(0, -1),
              { type: 'text', text: lastPart.text + evt.text },
            ]
          } else {
            updatedContent = [...currentAssistant.content, { type: 'text', text: evt.text }]
          }

          const updated = { ...currentAssistant, content: updatedContent }
          const next = [...current.slice(0, idx), updated, ...current.slice(idx + 1)]
          set({ messages: next })
        } else if (evt.type === 'error') {
          set({ error: evt.message })
          break
        } else if (evt.type === 'done') {
          break
        }
      }
    } catch (e: any) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        const msg = e instanceof ProviderError ? e.message : e?.message || 'Request failed'
        set({ error: msg })
      }
    } finally {
      abortController = null
      const finalMsgs = get().messages
      const finalIdx = finalMsgs.findIndex((m) => m.id === assistantMsg.id)

      // Drop empty assistant placeholder on failure
      const finalAssistant = finalIdx !== -1 ? finalMsgs[finalIdx] : null
      const isEmptyAssistant =
        finalAssistant &&
        finalAssistant.content.length === 1 &&
        finalAssistant.content[0].type === 'text' &&
        !finalAssistant.content[0].text.trim()

      const cleaned =
        finalIdx !== -1 && isEmptyAssistant
          ? finalMsgs.filter((_, i) => i !== finalIdx)
          : finalMsgs

      set({
        messages: cleaned,
        isStreaming: false,
        streamingMessageId: null,
      })
      await persistMessages(threadId, cleaned)
      await touchThread(threadId)
    }
  },

  cancel() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    set({ isStreaming: false, streamingMessageId: null })
  },

  async regenerateLast() {
    const msgs = get().messages
    if (msgs.length === 0 || get().isStreaming) return
    const last = msgs[msgs.length - 1]
    if (last.role !== 'assistant') return

    // Remove last assistant and resend the conversation
    const withoutLast = msgs.slice(0, -1)
    set({ messages: withoutLast })
    await persistMessages(get().currentThreadId!, withoutLast)

    const lastUser = [...withoutLast].reverse().find((m) => m.role === 'user')
    if (lastUser) {
      const text = getTextFromContent(lastUser.content)
      await get().sendMessage(text)
    }
  },

  async editAndResend(messageId, newText) {
    const msgs = get().messages
    const idx = msgs.findIndex((m) => m.id === messageId)
    if (idx === -1 || msgs[idx].role !== 'user' || get().isStreaming) return

    const original = msgs[idx]
    const nonTextParts = original.content.filter((p) => p.type !== 'text')
    const editedContent: MessageContentPart[] = [
      ...nonTextParts,
      ...(newText.trim() ? [{ type: 'text' as const, text: newText.trim() }] : []),
    ]
    const edited = { ...original, content: editedContent }
    const truncated = msgs.slice(0, idx + 1).map((m, i) => (i === idx ? edited : m))

    set({ messages: truncated, error: null })
    await persistMessages(get().currentThreadId!, truncated)

    // Remove any assistant messages after the edit point and resend
    const afterEdit = truncated.slice(0, idx + 1)
    set({ messages: afterEdit })
    await get().sendMessage(newText.trim())
  },

  async deleteCurrent() {
    const id = get().currentThreadId
    if (!id) return
    await deleteThread(id)
    const remaining = get().threads.filter((t) => t.id !== id)
    if (remaining.length === 0) {
      const t = await createThread('New chat')
      const welcome: Message = {
        id: newId(),
        threadId: t.id,
        role: 'assistant',
        content: [{ type: 'text', text: 'New chat started.' }],
        createdAt: Date.now(),
      }
      await persistMessages(t.id, [welcome])
      set({
        threads: [t],
        currentThreadId: t.id,
        messages: [welcome],
      })
    } else {
      const next = remaining[0]
      const msgs = await loadMessages(next.id)
      set({
        threads: remaining,
        currentThreadId: next.id,
        messages: msgs,
      })
    }
  },

  async renameCurrent(title) {
    const id = get().currentThreadId
    if (!id) return
    await updateThreadTitle(id, title.trim() || 'Untitled')
    set({
      threads: get().threads.map((t) =>
        t.id === id ? { ...t, title: title.trim() || 'Untitled' } : t
      ),
    })
  },

  clearError() {
    set({ error: null })
  },
}))
