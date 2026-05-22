# HANDOFF — Champ Ai Development

**Date:** 2026-05-21  
**Current Branch:** main  
**Last Commit:** f9d9ff0 (Claude 4.7 Opus updates)

## Project Overview

Champ Ai is a **client-side-only** LLM chat application that supports multiple providers (Grok/xAI, Claude/Anthropic, Gemini/Google) without any backend. Everything runs in the browser using React + Vite + TypeScript + Tailwind + Dexie (IndexedDB).

Key philosophy:
- Privacy-first (all data stays in the browser)
- Multi-provider support with saved credentials
- Rich features while staying lightweight

## Current Major Features

### Core
- Streaming responses from Grok, Claude, and Gemini
- Per-provider API keys and model selection (saved in browser)
- File attachments: images (with client-side resizing + compression presets), plus PDF, CSV, DOCX, XLSX, JSON, and TXT. Text is automatically extracted from Office/spreadsheet files for reliable use with all providers (Grok, Claude, Gemini).
- Markdown rendering with custom styling (Menlo font support)
- Thread management with persistence via Dexie

### Recent Additions (Important for Continuation)

**1. Thread-Specific Notepad**
- Floating notepad icon (bottom-left)
- Notes are saved per-thread
- Auto-saves while typing (debounced)
- Fully integrated into the Handoff export

**2. Improved Handoff System**
- Generates a clean, portable Markdown document
- Includes:
  - Full conversation history
  - System prompt
  - Per-thread notes (from the notepad)
  - Clear continuation instructions for the next model
- Designed to let users easily migrate a conversation to a new thread or different LLM

**3. Settings Redesign**
- Cleaner, less crowded layout
- Image Quality presets no longer show specific resolutions (user feedback)
- Chat Font Size now uses visual "Aa" previews in different sizes instead of text labels
- Model selection changed from free-text input to a proper dropdown with recommended models per provider
- Models now auto-save when changed (no need to click Save)
- System Prompt placeholder updated to "You are..."

**4. Claude 4.7 Support**
- Added as the top/recommended model for Claude
- Set as the new default in `SETTINGS_DEFAULTS`
- Old Claude 3 Opus was removed from the list

**5. Other Polish**
- "Let's Play!" floating empty state (Menlo font, disappears on first message)
- Claude FM music button in header with subtle playing indicator
- Various small UI and reliability improvements

## Architecture Notes

- **State Management**: Zustand (`useThreads`, `useSettings`)
- **Persistence**: Dexie (IndexedDB)
  - Threads + Messages
  - Settings (including per-provider keys/models)
  - Thread notes (stored on the Thread object)
- **Provider System**: Located in `src/lib/providers/`
  - `index.ts` dispatches to the correct provider
  - Separate files for Grok (OpenAI-compatible), Claude, and Gemini
- **Export/Handoff**: `src/lib/exportConversation.ts`
- **UI Components**: Mostly in `src/components/` + shadcn/ui primitives

## Important Files

| Area                    | Key Files                                      |
|-------------------------|------------------------------------------------|
| Settings & Model Logic  | `src/components/SettingsModal.tsx`             |
| Thread & Message State  | `src/state/threads.ts`                         |
| Settings State          | `src/state/settings.ts`                        |
| Database Layer          | `src/lib/storage/db.ts`                        |
| Handoff Export          | `src/lib/exportConversation.ts`                |
| Main App                | `src/App.tsx`                                  |
| Notepad Feature         | Implemented in `App.tsx` (bottom-left floating UI) |

## Current Recommended Models (as of this handoff)

**Grok**
- `grok-3-latest` (recommended / best)
- `grok-2-1212`

**Claude**
- `claude-4.7` (recommended / best — Opus tier)
- `claude-3-5-sonnet-20241022`
- `claude-3-5-haiku-20241022`

**Gemini**
- `gemini-1.5-pro`
- `gemini-1.5-flash`
- `gemini-2.0-flash-exp`

## How to Run Locally

```bash
npm install
npm run dev
```

App usually runs on `http://localhost:8080` (or the port shown in terminal).

To fully reset local data (for testing empty state, etc.):
- Open DevTools → Application → Storage → Clear site data

## How the Handoff Feature Works

1. User clicks the floating notepad icon (bottom-left) → can write thread-specific notes.
2. User clicks the **Handoff** button in the header.
3. A Markdown file is generated containing:
   - Conversation history
   - System prompt
   - Notes from the notepad
   - Instructions for the receiving model
4. User pastes this document into a new chat (in Champ Ai or another LLM) to continue.

This is currently one of the most important features for long-term usage.

## Recommended Next Steps / Open Items

- Real per-provider connection testing in Settings (currently just a placeholder)
- Better error handling and retry logic for streaming
- Support for more advanced Claude features (extended thinking, etc.)
- Web search / tool use for Claude and Gemini (currently only on Grok)
- Ability to edit or delete individual messages more robustly
- Dark/light mode refinements
- Mobile responsiveness improvements
- Possibly a "Regenerate with different model" flow

## Notes for Future Development

- When adding new models, update:
  1. `getModelsForProvider()` in `SettingsModal.tsx`
  2. `SETTINGS_DEFAULTS` in `src/lib/storage/db.ts` (if changing defaults)
- The Notepad and Handoff are tightly coupled — changes to one often affect the other.
- Try to keep the Settings modal feeling light. It has a tendency to get crowded (we already did one major cleanup pass).

---

**You now have the full current context.**

This document + the codebase should allow you (or anyone else) to continue development smoothly.

Welcome back whenever you're ready to keep building. 🚀

— Grok (your pair programmer)