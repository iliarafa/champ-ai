import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface MarkdownProps {
  text: string
}

function CodeBlock({ inline, className, children, ...props }: any) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const raw = String(children).replace(/\n$/, '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(raw)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch (e) {
      console.error('copy failed', e)
    }
  }

  if (inline) {
    return (
      <code className="font-mono text-[0.9em] bg-muted px-1 py-px rounded" {...props}>
        {children}
      </code>
    )
  }

  return (
    <div className="group relative my-3">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded-md bg-background/80 border px-1.5 py-1 opacity-0 group-hover:opacity-100 transition text-xs flex items-center gap-1 hover:bg-background"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        <span className="sr-only">Copy</span>
      </button>
      <pre className="font-mono text-[0.8125rem] bg-card border p-3 rounded-lg overflow-x-auto">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
      {language && (
        <div className="absolute left-2 top-2 text-[10px] text-muted-foreground/70 font-mono pointer-events-none">
          {language}
        </div>
      )}
    </div>
  )
}

export function Markdown({ text }: MarkdownProps) {
  return (
    <div className="prose-chat max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
