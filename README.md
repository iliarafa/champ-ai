# Champ Ai

**One LLM. One key. Pure chat.**

A minimal, private, client-side chat interface for any OpenAI-compatible LLM (xAI/Grok, OpenAI, Groq, Ollama, etc.). No backend, no accounts, no telemetry — your key never leaves your browser.

**Live Demo:** [https://champ-ai-ten.vercel.app](https://champ-ai-ten.vercel.app)

## Quick start

```bash
npm install
npm run dev
```

1. Open Settings (gear icon)
2. Paste your API key (and optionally change Base URL / Model)
3. Start chatting

Recommended quick models:
- **xAI Grok** — `https://api.x.ai/v1` + `grok-3-latest`
- **Groq (very fast)** — `https://api.groq.com/openai/v1` + any Llama
- **Local (Ollama)** — `http://localhost:11434/v1` + `llama3.2`

## Features

- Streaming responses
- Per-message web search toggle (works great with Grok)
- Multiple chats with local persistence (IndexedDB)
- **File attachments** — Drag or upload images, PDFs, CSVs, DOCX, XLSX, JSON, and TXT files. Images are resized/compressed; text is extracted from documents for best compatibility across providers.
- Edit & resend, regenerate, copy
- Markdown + syntax-friendly code blocks with copy buttons
- System prompt support
- Light / Dark / System theme
- "Test connection" button in Settings

## Privacy

Everything (chats, settings, your API key) is stored locally using IndexedDB + localStorage. Nothing is sent anywhere except directly to the LLM provider you chose.

## Tech

Vite + React 19 + TypeScript + Tailwind v4 + Zustand + Dexie + react-markdown.

Built as the simplest possible "bring your own LLM" chat UI.

## Development

```bash
npm run build
```

## Deployment

This project is deployed on Vercel and automatically redeploys on every push to the `main` branch.

- **Live URL**: [https://champ-ai-ten.vercel.app](https://champ-ai-ten.vercel.app)
- **GitHub**: [iliarafa/champ-ai](https://github.com/iliarafa/champ-ai)

## License

MIT — do whatever you want with it.
