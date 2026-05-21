import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel } from 'docx'
import jsPDF from 'jspdf'
import type { Thread, Message, MessageContentPart } from '@/lib/storage/db'

/* ----------------------------- Utilities ----------------------------- */

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'conversation'
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString()
}

function getTextParts(content: MessageContentPart[] | string | undefined | null): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

function getImageParts(content: MessageContentPart[] | string | undefined | null): Array<{ mediaType: string; data: string }> {
  if (!content || typeof content === 'string' || !Array.isArray(content)) return []
  return content.filter((p): p is { type: 'image'; mediaType: string; data: string } => p.type === 'image')
}

function buildBaseFilename(thread: Thread): string {
  const date = new Date(thread.updatedAt || Date.now())
  const ymd = date.toISOString().slice(0, 10)
  return `${sanitizeFilename(thread.title)}_${ymd}`
}

/* --------------------------- Markdown Export --------------------------- */

export function exportAsMarkdown(thread: Thread, messages: Message[]) {
  const lines: string[] = []

  lines.push(`# ${thread.title}`)
  lines.push('')
  lines.push(`**Exported:** ${new Date().toISOString()}`)
  lines.push(`**Messages:** ${messages.length}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant'
    const time = formatTimestamp(msg.createdAt)
    lines.push(`### ${role} — ${time}`)
    lines.push('')

    const text = getTextParts(msg.content)
    if (text) {
      lines.push(text)
      lines.push('')
    }

    const images = getImageParts(msg.content)
    for (const img of images) {
      const dataUri = `data:${img.mediaType};base64,${img.data}`
      lines.push(`![attached image](${dataUri})`)
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  const filename = `${buildBaseFilename(thread)}.md`
  downloadTextFile(filename, lines.join('\n'), 'text/markdown')
}

/* ----------------------------- CSV Export ----------------------------- */

export function exportAsCSV(thread: Thread, messages: Message[]) {
  const rows: string[] = []
  rows.push('timestamp,role,text,image_count')

  for (const msg of messages) {
    const ts = new Date(msg.createdAt).toISOString()
    const role = msg.role
    const text = getTextParts(msg.content).replace(/"/g, '""') // escape quotes
    const imageCount = getImageParts(msg.content).length

    rows.push(`"${ts}","${role}","${text}",${imageCount}`)
  }

  const filename = `${buildBaseFilename(thread)}.csv`
  downloadTextFile(filename, rows.join('\n'), 'text/csv')
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' })
  triggerDownload(filename, blob)
}

/* ----------------------------- PDF Export ----------------------------- */

export async function exportAsPDF(thread: Thread, messages: Message[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 50
  const maxTextWidth = pageWidth - margin * 2
  let y = 60

  // Title
  doc.setFontSize(18)
  doc.text(thread.title, margin, y)
  y += 24

  doc.setFontSize(10)
  doc.text(`Exported: ${new Date().toLocaleString()}  •  ${messages.length} messages`, margin, y)
  y += 28

  doc.setDrawColor(180)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24

  const lineHeight = 14
  const roleGap = 18

  for (const msg of messages) {
    // Check if we need a new page
    if (y > 720) {
      doc.addPage()
      y = 60
    }

    // Role header
    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text(`${roleLabel}  —  ${formatTimestamp(msg.createdAt)}`, margin, y)
    y += roleGap

    // Text content
    const text = getTextParts(msg.content)
    if (text) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      const split = doc.splitTextToSize(text, maxTextWidth)
      doc.text(split, margin, y)
      y += split.length * lineHeight + 8
    }

    // Images
    const images = getImageParts(msg.content)
    for (const img of images) {
      if (y > 620) {
        doc.addPage()
        y = 60
      }
      try {
        const dataUri = `data:${img.mediaType};base64,${img.data}`
        // Estimate reasonable display size (max ~240pt wide)
        const imgProps = doc.getImageProperties(dataUri)
        const displayWidth = Math.min(240, imgProps.width)
        const scale = displayWidth / imgProps.width
        const displayHeight = imgProps.height * scale

        doc.addImage(dataUri, img.mediaType.split('/')[1].toUpperCase() as any, margin, y, displayWidth, displayHeight)
        y += displayHeight + 12
      } catch (e) {
        doc.setFontSize(9)
        doc.text('[Image could not be embedded]', margin, y)
        y += 16
      }
    }

    y += 12
  }

  const filename = `${buildBaseFilename(thread)}.pdf`
  doc.save(filename)
}

/* ----------------------------- DOCX Export ----------------------------- */

export async function exportAsDOCX(thread: Thread, messages: Message[]) {
  const children: any[] = []

  // Title
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: thread.title, bold: true })],
    })
  )

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Exported: ${new Date().toLocaleString()}`, italics: true, size: 18 }),
        new TextRun({ text: `   •   ${messages.length} messages`, size: 18 }),
      ],
      spacing: { after: 200 },
    })
  )

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
    const time = formatTimestamp(msg.createdAt)

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: roleLabel, bold: true }),
          new TextRun({ text: ` — ${time}`, color: '666666', size: 18 }),
        ],
        spacing: { before: 200, after: 80 },
      })
    )

    const text = getTextParts(msg.content)
    if (text) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text })],
          spacing: { after: 120 },
        })
      )
    }

    // Images
    const images = getImageParts(msg.content)
    for (const img of images) {
      try {
        const buffer = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0))
        const ext = img.mediaType.includes('png') ? 'png' : 'jpg'

        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: ext === 'png' ? 'png' : 'jpg',
                data: buffer,
                transformation: { width: 420, height: 280 }, // reasonable default; docx will scale proportionally if we want
              }),
            ],
            spacing: { before: 80, after: 160 },
          })
        )
      } catch {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: '[Attached image]', italics: true, color: '888888' })],
          })
        )
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const filename = `${buildBaseFilename(thread)}.docx`
  triggerDownload(filename, blob)
}

/* ----------------------------- Dispatcher ----------------------------- */

export type ExportFormat = 'markdown' | 'csv' | 'pdf' | 'docx'

export async function exportConversation(thread: Thread, messages: Message[], format: ExportFormat) {
  if (!thread || messages.length === 0) {
    alert('Nothing to export.')
    return
  }

  if (format === 'markdown') {
    exportAsMarkdown(thread, messages)
  } else if (format === 'csv') {
    exportAsCSV(thread, messages)
  } else if (format === 'pdf') {
    await exportAsPDF(thread, messages)
  } else if (format === 'docx') {
    await exportAsDOCX(thread, messages)
  }
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ----------------------------- HANDOFF Export ----------------------------- */
/**
 * Generates a special Markdown document designed for handing off the full
 * conversation context (including images) to a new thread / different model.
 * The output is optimized for pasting into another LLM to continue seamlessly.
 */
export function exportAsHandoff(
  thread: Thread,
  messages: Message[],
  systemPrompt?: string,
  notes?: string
) {
  const lines: string[] = []

  // === Calculate stats ===
  const totalImages = messages.reduce((sum, m) => sum + getImageParts(m.content).length, 0)
  const firstUserMessage = messages.find(m => m.role === 'user')
  const firstUserText = firstUserMessage ? getTextParts(firstUserMessage.content).trim() : ''
  const lastMessages = messages.slice(-3) // last 1-3 messages for "Current State"

  // === HEADER ===
  lines.push('# HANDOFF — Continue this conversation')
  lines.push('')
  lines.push('**Instructions for the new model:**')
  lines.push('')
  lines.push('You are continuing a previous conversation. Your role is the **Assistant**.')
  lines.push('')
  lines.push('- Carefully read the entire history below.')
  lines.push('- Follow the original **System Prompt** if one was provided.')
  lines.push('- Continue the conversation naturally from where it left off.')
  lines.push('- Do not restart or summarize unless asked.')
  lines.push('')
  lines.push('---')
  lines.push('')

  // === THREAD METADATA ===
  lines.push(`**Thread:** ${thread.title}`)
  lines.push(`**Created:** ${new Date(thread.createdAt).toLocaleString()}`)
  lines.push(`**Messages:** ${messages.length} (${totalImages} image${totalImages === 1 ? '' : 's'} attached)`)
  lines.push('')

  // === SYSTEM PROMPT ===
  if (systemPrompt && systemPrompt.trim()) {
    lines.push('## System Prompt')
    lines.push('')
    lines.push('```')
    lines.push(systemPrompt.trim())
    lines.push('```')
    lines.push('')
  } else {
    lines.push('*(No custom system prompt was set for the original thread)*')
    lines.push('')
  }

  // === NOTES ===
  if (notes && notes.trim()) {
    lines.push('## Notes')
    lines.push('')
    lines.push(notes.trim())
    lines.push('')
  }

  // === CONVERSATION OVERVIEW ===
  lines.push('## Conversation Overview')
  lines.push('')
  if (firstUserText) {
    const preview = firstUserText.length > 180 ? firstUserText.slice(0, 177) + '...' : firstUserText
    lines.push(`**Started with:** ${preview}`)
  }
  lines.push(`**Total exchanges:** ${messages.length}`)
  if (totalImages > 0) {
    lines.push(`**Images in this conversation:** ${totalImages} (marked in the history below — you will need to re-upload them to see them)`)
  }
  lines.push('')

  // === FULL CONVERSATION HISTORY ===
  lines.push('## Full Conversation History')
  lines.push('')
  lines.push('The complete dialogue is shown below in chronological order.')
  lines.push('')

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**'
    const time = new Date(msg.createdAt).toLocaleString()

    lines.push(`${roleLabel} — ${time}`)
    lines.push('')

    const text = getTextParts(msg.content)
    if (text) {
      lines.push(text)
      lines.push('')
    }

    const images = getImageParts(msg.content)
    if (images.length > 0) {
      const who = msg.role === 'user' ? 'User' : 'Assistant'
      const label = images.length === 1
        ? `[1 image attached by ${who}]`
        : `[${images.length} images attached by ${who}]`
      lines.push(`*${label}*`)
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  }

  // === CURRENT STATE (emphasized) ===
  lines.push('## Current State')
  lines.push('')
  lines.push('The conversation is currently at this point. The new model should respond as the **Assistant** to the last user message.')
  lines.push('')

  for (const msg of lastMessages) {
    const roleLabel = msg.role === 'user' ? '**User**' : '**Assistant**'
    const time = new Date(msg.createdAt).toLocaleString()

    lines.push(`${roleLabel} — ${time}`)

    const text = getTextParts(msg.content)
    if (text) {
      lines.push(text)
    }

    const images = getImageParts(msg.content)
    if (images.length > 0) {
      const who = msg.role === 'user' ? 'User' : 'Assistant'
      const label = images.length === 1
        ? `[1 image attached by ${who}]`
        : `[${images.length} images attached by ${who}]`
      lines.push(`*${label}*`)
    }

    lines.push('')
  }

  // === CLOSING ===
  lines.push('---')
  lines.push('')
  lines.push('**End of Handoff**')
  lines.push('')
  lines.push('You now have the full context. Continue the conversation as the Assistant from the last message above.')
  lines.push('If there were images in the original thread, re-upload the relevant ones when they become important in the discussion.')

  const filename = `Handoff_${sanitizeFilename(thread.title)}.md`
  downloadTextFile(filename, lines.join('\n'), 'text/markdown')
}
