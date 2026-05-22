import { useState, useRef } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useThreads } from '@/state/threads'
import { parseMarkdownToThread } from '@/lib/sharing/markdownImport'
import { Upload, FileText, AlertCircle } from 'lucide-react'

interface ImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportModal({ open, onOpenChange }: ImportModalProps) {
  const { projects, createProject, importFromMarkdown, setCurrentProject } = useThreads()

  const [rawInput, setRawInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [parsed, setParsed] = useState<{ title: string; messageCount: number } | null>(null)

  const [targetProjectId, setTargetProjectId] = useState<string | null>(null)
  const [newProjectName, setNewProjectName] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  async function parseMarkdown(input: string) {
    setError('')
    setParsed(null)

    if (!input.trim()) {
      setError('Please paste Markdown content or select a .md file')
      return
    }

    setIsProcessing(true)
    try {
      const result = parseMarkdownToThread(input)

      if (result.messages.length === 0) {
        throw new Error('Could not find any messages in this Markdown file')
      }

      setParsed({
        title: result.title,
        messageCount: result.messages.length,
      })

      setRawInput(input)
    } catch (e: any) {
      setError(e.message || 'Failed to parse the Markdown file')
    } finally {
      setIsProcessing(false)
    }
  }

  async function handleParse() {
    await parseMarkdown(rawInput)
  }

  async function handleImport() {
    if (!parsed || !rawInput) return

    setIsProcessing(true)
    setError('')

    let finalProjectId = targetProjectId

    try {
      if (newProjectName.trim()) {
        const newProj = await createProject(newProjectName.trim())
        finalProjectId = newProj.id
      }

      await importFromMarkdown(rawInput, finalProjectId)

      if (finalProjectId) {
        setCurrentProject(finalProjectId)
      }

      await new Promise((r) => setTimeout(r, 200))
      handleClose()
    } catch (e: any) {
      setError(e.message || 'Import failed')
    } finally {
      setIsProcessing(false)
    }
  }

  function handleClose() {
    setRawInput('')
    setParsed(null)
    setError('')
    setIsDragging(false)
    setTargetProjectId(null)
    setNewProjectName('')
    onOpenChange(false)
  }

  // Drag & drop handlers
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || ''
      setRawInput(text)
      parseMarkdown(text)
    }
    reader.readAsText(file)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function triggerFilePicker() {
    fileInputRef.current?.click()
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) || ''
      setRawInput(text)
      parseMarkdown(text)
    }
    reader.readAsText(file)
    e.target.value = '' // reset for same file
  }

  return (
    <Modal open={open} onOpenChange={handleClose}>
      <div className="space-y-5 w-full max-w-lg">
        <div>
          <div className="text-lg font-semibold flex items-center gap-2">
            Import Shared Thread
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            Bring in a conversation someone shared with you.
          </div>
        </div>

        {!parsed ? (
          <>
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={triggerFilePicker}
              className={`
                border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                ${isDragging 
                  ? 'border-primary bg-primary/5 scale-[1.01]' 
                  : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30'
                }
              `}
            >
              <div className="flex flex-col items-center gap-3">
                <div className={`rounded-full p-3 ${isDragging ? 'bg-primary/10' : 'bg-muted'}`}>
                  <Upload className={`size-6 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className="font-medium">Drop a .md file here</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    or click to choose a Markdown file
                  </div>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,text/markdown"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <div className="relative">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t" />
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted-foreground">or paste below</span>
              </div>
            </div>

            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              onBlur={() => { if (rawInput.trim() && !parsed) handleParse() }}
              placeholder={`Paste Markdown content here...\n\nSupports files exported from Champ Ai (Export or Handoff)`}
              className="w-full h-28 border rounded-xl p-3 font-mono text-xs resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            />





            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div>{error}</div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button 
                onClick={handleParse} 
                disabled={!rawInput.trim() || isProcessing}
              >
                {isProcessing ? 'Reading file...' : 'Continue'}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Success Preview */}
            <div className="rounded-2xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-background p-2">
                  <FileText className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg leading-tight pr-2">
                    {parsed.title}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {parsed.messageCount} messages
                  </div>
                </div>
              </div>


            </div>

            {/* Destination */}
            <div>
              <div className="mb-1.5 text-sm font-medium">Import into</div>
              <select
                value={targetProjectId || ''}
                onChange={(e) => {
                  const val = e.target.value
                  setTargetProjectId(val || null)
                  if (val !== '__new__') setNewProjectName('')
                }}
                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background"
              >
                <option value="">All Chats (Uncategorized)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
                <option value="__new__">+ Create new project</option>
              </select>

              {targetProjectId === '__new__' && (
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="mt-2 w-full border rounded-xl px-3 py-2.5 text-sm"
                  autoFocus
                />
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <div>{error}</div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => { setParsed(null); setError('') }} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={handleImport} 
                disabled={isProcessing} 
                className="flex-1"
              >
                {isProcessing ? 'Importing…' : 'Import Thread'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}