import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { MessageContentPart } from '@/lib/storage/db'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTextFromContent(content: MessageContentPart[] | string | undefined | null): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}
