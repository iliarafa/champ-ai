import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { Thread, Message } from '@/lib/storage/db'

interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentThread: Thread | null
  messages: Message[]
  projectName?: string
}

export function ShareModal({
  open,
  onOpenChange,
  currentThread,
  messages,
  projectName,
}: ShareModalProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string | null>(null)
  const [error, setError] = useState('')

  const canGenerate = !!currentThread && messages.length > 0

  function generateMarkdown(): string {
    if (!currentThread) return ''

    const getText = (content: any): string => {
      if (!content) return ''
      if (typeof content === 'string') return content
      if (!Array.isArray(content)) return ''
      return content
        .filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('\n')
    }

    const getImages = (content: any) => {
      if (!content || typeof content === 'string' || !Array.isArray(content)) return []
      return content.filter((p: any) => p.type === 'image')
    }

    const lines: string[] = []

    lines.push(`# ${currentThread.title}`)
    lines.push('')
    if (projectName) {
      lines.push(`**Project:** ${projectName}`)
      lines.push('')
    }
    lines.push(`**Shared:** ${new Date().toISOString()}`)
    lines.push(`**Messages:** ${messages.length}`)
    lines.push('')
    lines.push('---')
    lines.push('')

    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : 'Assistant'
      const time = new Date(msg.createdAt).toLocaleString()
      lines.push(`### ${role} — ${time}`)
      lines.push('')

      const text = getText(msg.content)
      if (text) {
        lines.push(text)
        lines.push('')
      }

      const images = getImages(msg.content)
      for (const img of images) {
        const dataUri = `data:${img.mediaType};base64,${img.data}`
        lines.push(`![attached image](${dataUri})`)
        lines.push('')
      }

      lines.push('---')
      lines.push('')
    }

    return lines.join('\n')
  }

  async function handleGenerate() {
    if (!currentThread) return
    setError('')
    setIsGenerating(true)

    try {
      await new Promise(r => setTimeout(r, 80))
      const md = generateMarkdown()
      setGeneratedMarkdown(md)
    } catch (e: any) {
      setError(e.message || 'Failed to generate Markdown')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleCopy() {
    if (!generatedMarkdown) return
    navigator.clipboard.writeText(generatedMarkdown).then(() => {
      alert('Markdown copied to clipboard!')
    })
  }

  function handleDownload() {
    if (!generatedMarkdown || !currentThread) return

    const blob = new Blob([generatedMarkdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentThread.title.replace(/\s+/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function reset() {
    setGeneratedMarkdown(null)
    setError('')
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  return (
    <Modal open={open} onOpenChange={handleClose}>
      <div className="space-y-4 max-w-md">
        <div>
          <div className="text-lg font-semibold">Share Thread</div>
          <div className="text-sm text-muted-foreground mt-1">
            Generate a Markdown copy of this conversation to share with others.
          </div>
        </div>

        {!generatedMarkdown ? (
          <>
            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Markdown'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-2">
              <div className="font-medium">Markdown ready</div>
              <div>
                <strong>{currentThread?.title}</strong><br />
                {messages.length} messages
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleCopy} className="w-full">
                Copy Markdown to Clipboard
              </Button>
              <Button onClick={handleDownload} variant="outline" className="w-full">
                Download .md file
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground">
              The recipient can paste this Markdown or import the .md file using the Import button.
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={reset}>Generate Again</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}