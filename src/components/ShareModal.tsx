import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import type { Thread, Message } from '@/lib/storage/db'
import { packThread, type ChampShareV1, FILE_EXTENSION } from '@/lib/sharing/portable'
import { shareToJSON, shareToCompactString } from '@/lib/sharing/portable'

interface ShareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentThread: Thread | null
  messages: Message[]
  systemPrompt?: string
  projectName?: string
}

export function ShareModal({
  open,
  onOpenChange,
  currentThread,
  messages,
  systemPrompt,
  projectName,
}: ShareModalProps) {
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedShare, setGeneratedShare] = useState<ChampShareV1 | null>(null)
  const [error, setError] = useState('')

  const canGenerate = !!currentThread && messages.length > 0
  const passwordValid = !usePassword || (password.length >= 6 && password === confirmPassword)

  async function handleGenerate() {
    if (!currentThread) return
    setError('')
    setIsGenerating(true)

    try {
      const share = await packThread(
        {
          thread: currentThread,
          messages,
          systemPrompt,
          originalProjectName: projectName,
        },
        usePassword ? password : undefined
      )

      setGeneratedShare(share)
    } catch (e: any) {
      setError(e.message || 'Failed to generate share payload')
    } finally {
      setIsGenerating(false)
    }
  }

  function handleCopy() {
    if (!generatedShare) return
    const text = shareToCompactString(generatedShare)
    navigator.clipboard.writeText(text).then(() => {
      alert('Payload copied to clipboard!')
    })
  }

  function handleDownload() {
    if (!generatedShare || !currentThread) return

    const json = shareToJSON(generatedShare)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentThread.title.replace(/\s+/g, '_')}${FILE_EXTENSION}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function reset() {
    setGeneratedShare(null)
    setPassword('')
    setConfirmPassword('')
    setUsePassword(false)
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
            Create a portable, optionally encrypted copy of this conversation.
          </div>
        </div>

        {!generatedShare ? (
          <>
            <div className="space-y-3">
              <div className="text-sm font-medium">Encryption</div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!usePassword}
                  onChange={() => setUsePassword(false)}
                />
                No encryption (anyone with the file can open it)
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={usePassword}
                  onChange={() => setUsePassword(true)}
                />
                Password protected (recommended for sharing)
              </label>

              {usePassword && (
                <div className="pl-6 space-y-2 pt-1">
                  <input
                    type="password"
                    placeholder="Password (min 6 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                  {password && password !== confirmPassword && (
                    <div className="text-xs text-destructive">Passwords do not match</div>
                  )}
                </div>
              )}
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || !passwordValid || isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate Share Payload'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-2">
              <div className="font-medium">Share payload ready</div>
              <div>
                <strong>{generatedShare.meta.title}</strong><br />
                {generatedShare.meta.messageCount} messages • {generatedShare.meta.imageCount} images
              </div>
              <div className="text-xs text-muted-foreground">
                Encryption: {generatedShare.encryption.method === 'none' ? 'None' : 'Password protected'}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleCopy} className="w-full">
                Copy to Clipboard
              </Button>
              <Button onClick={handleDownload} variant="outline" className="w-full">
                Download {FILE_EXTENSION} file
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground">
              Send this payload to the other person. They can import it using the Import button.
              {generatedShare.encryption.method !== 'none' && ' They will need the password you chose.'}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={reset}>Generate Another</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}