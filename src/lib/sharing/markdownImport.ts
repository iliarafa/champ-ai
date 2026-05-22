import type { Message, MessageContentPart } from '@/lib/storage/db'

export interface ParsedThread {
  title: string
  messages: Message[]
}

/**
 * Parses a Markdown file exported by Champ Ai (exportAsMarkdown or Handoff)
 * back into a structured thread.
 */
export function parseMarkdownToThread(markdown: string): ParsedThread {
  const lines = markdown.split('\n')

  // Extract title from first heading
  let title = 'Imported Conversation'
  const titleMatch = markdown.match(/^#\s+(.+)$/m)
  if (titleMatch) {
    title = titleMatch[1].trim()
  }

  const messages: Message[] = []
  let currentRole: 'user' | 'assistant' | null = null
  let currentText: string[] = []
  let currentImages: MessageContentPart[] = []
  let messageIndex = 0

  const flushMessage = () => {
    if (!currentRole) return

    const content: MessageContentPart[] = []

    const text = currentText.join('\n').trim()
    if (text) {
      content.push({ type: 'text', text })
    }

    content.push(...currentImages)

    if (content.length > 0) {
      messages.push({
        id: `imported-${Date.now()}-${messageIndex++}`,
        threadId: '', // will be set later
        role: currentRole,
        content,
        createdAt: Date.now() - (messages.length * 1000), // fake decreasing timestamps
      })
    }

    currentText = []
    currentImages = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Match message headers: ### User — timestamp or ### Assistant — timestamp
    const headerMatch = line.match(/^###\s+(User|Assistant)\s+—/)
    if (headerMatch) {
      flushMessage()
      currentRole = headerMatch[1].toLowerCase() as 'user' | 'assistant'
      continue
    }

    // Match images: ![...](data:...)
    const imageMatch = line.match(/!\[.*?\]\((data:[^)]+)\)/)
    if (imageMatch && currentRole) {
      const dataUri = imageMatch[1]
      const match = dataUri.match(/^data:(.+);base64,(.+)$/)
      if (match) {
        currentImages.push({
          type: 'image',
          mediaType: match[1],
          data: match[2],
        })
      }
      continue
    }

    // Collect text (skip separator lines and metadata at top)
    if (currentRole && !line.startsWith('---') && !line.startsWith('**Exported:**') && !line.startsWith('**Messages:**')) {
      currentText.push(line)
    }
  }

  // Flush last message
  flushMessage()

  return { title, messages }
}