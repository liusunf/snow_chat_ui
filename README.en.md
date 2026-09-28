<p align="center">
<a href="https://github.com/liusunf/snow_chat_ui" target="_blank">
 <img src="client/public/icons/icon-192.png" height="80" alt="ChatUI LLM Workbench"/>
</a>
</p>
<div align="center">
<a href="https://github.com/liusunf/snow_chat_ui">⭐ Stars</a> ·
<a href="https://github.com/liusunf/snow_chat_ui">🍴 Forks</a> ·
<a href="https://github.com/liusunf/snow_chat_ui">📄 MIT License</a> ·
<a>⚛️ React 18</a> ·
<a>🟦 TypeScript 5</a> ·
<a>⚡ Vite 5</a> ·
<a>🚀 Express 4</a> ·
<a>💬 ChatUI 3.8</a> ·
<a>🔌 MCP</a> ·
<a>📱 PWA</a>
</div>

# ChatUI LLM Workbench

[**中文**](README.md) · English　|　Full Chinese version at [README.md](README.md)

## Introduction

ChatUI LLM Workbench is a universal LLM chat window built on **ChatUI ([@chatui/core](https://chatui.io))**. Key strengths: **unified LLM Provider config, MCP tools and Skill system out of the box**, friendly LobeChat / Dify-style UI, decoupled frontend/backend and easy deployment. Works across all web devices (PC / tablet / phone) + installable PWA.

> Want to plug this UI into your own backend? See the **[Backend API docs](./docs/API.md)** (online at `http://<host>/api-docs.html`) — implement the endpoints as documented and all AI interactions work.

### Demo & Links

* Local run: `npm start`, then open `http://localhost:8787`
* Online API docs: `http://<host>/api-docs.html` (reachable via the Settings top bar "📖 API Docs" button)
* Backend API contract (Markdown): [docs/API.md](./docs/API.md)
* Source repo: https://github.com/liusunf/snow_chat_ui

### Feature Modules

#### Chat & Models

| Module | Description |
|  ----  | ----  |
| 💬 ChatUI interface | Alibaba ChatUI conversation UI: bubbles, typing indicator, Markdown rendering, streaming cursor, dynamic welcome page (rotating suggestions) |
| 🔌 Unified LLM Provider config | Independent Settings hub manages OpenAI-compatible / Anthropic Claude / Google Gemini / Ollama; custom BaseURL (DeepSeek, Moonshot, Qwen, vLLM…) |
| 🗂 Provider presets | 11 one-click templates (OpenAI / DeepSeek / Moonshot / Zhipu / Qwen / Groq / OpenRouter / Claude / Gemini / Ollama / local vLLM) with an official-brand-icon picker |
| 🧭 LobeChat-style ModelSelect | Focus opens a model dropdown panel: brand icon + current-item highlight + filter input |
| 📡 Auto fetch models + whitelist | "Fetch models" pulls available models (OpenAI-compatible `/models`, Gemini `/models`, Ollama `/api/tags`); checkboxes build the whitelist |
| 🌊 Streaming output | SSE per-token real-time output, abortable anytime via the "■" stop button |

#### Tools & Skills

| Module | Description |
|  ----  | ----  |
| 🧩 MCP support | Based on official `@modelcontextprotocol/sdk`; stdio / SSE / HTTP(Streamable) transports, auto tool discovery, one-click test, refresh/reconnect |
| 🎯 Skill system | Built-in skills (time / calculator / weather / fetch URL) + MCP tools bound as skills; triggered via function calling, execution shown live as tool cards (running → ✓/✗) |

#### Deployment & Experience

| Module | Description |
|  ----  | ----  |
| 🏠 Standalone Settings hub | LobeChat/Dify-like layout: left-nav domains (Models / Tools / Skills / Advanced), full-screen chat area |
| 📤 Config export / import | One-click JSON export/import for migration and backup |
| 🌐 Backend API URL config | Settings hub can set the backend API URL (localStorage-persisted); frontend deployable standalone against any backend; blank = same-origin `/api/*` |
| 🌏 Language switch | Top bar 🌐 toggles 简体中文 / English; preference persisted; covers all UI strings and the online API docs page |
| 📱 All-device support | Desktop dual-pane (conversations + full-screen chat); mobile single-pane with bottom nav, `100dvh` + safe-area insets |
| 📦 PWA | `manifest.json` + Service Worker offline shell + icons; "Add to home screen" |
| 🔗 Social sharing | Open Graph / Twitter Card tags + 1200×630 share image |

### Showcase

<p align="center">
 <img src="client/public/icons/og-cover.png" alt="ChatUI LLM Workbench share image" width="640"/>
</p>

## Quick Start

Requirements: Node.js ≥ 18 (native `fetch` / `AbortController`).

```bash
# Install dependencies
npm install

# Development (frontend 5173 + backend 8787, Vite proxies /api)
npm run dev
# Open http://localhost:5173

# Production build + start (single port 8787, backend serves frontend)
npm run build
npm start
# Open http://localhost:8787
```

## Configuration

Config persists to `server/data/config.json` (auto-created on first start; path overridable via `CONFIG_PATH`; gitignored, contains API Keys).

### LLM Provider (unified config)

| Type | Default BaseURL | Description |
|---|---|---|
| `openai` | `https://api.openai.com/v1` | OpenAI-protocol compatible: OpenAI / DeepSeek / Moonshot / Qwen / vLLM / LM Studio… |
| `anthropic` | `https://api.anthropic.com` | Official Claude |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta` | Google Gemini |
| `ollama` | `http://localhost:11434` | Local models |

- By default only one local Provider (Ollama) is kept; add the rest via "＋ Add Provider" from the brand picker
- Each Provider: type, name, BaseURL, API Key, model, Temperature, Max Tokens, enabled switch, model whitelist
- Click the radio dot to set the **default** Provider; chat then uses that model
- "Test" verifies connectivity; "Fetch models" fills the whitelist

### MCP Server

```jsonc
{
  "id": "everything",
  "transport": "stdio",          // stdio | sse | http
  "command": "npx",              // stdio only
  "args": ["-y", "@modelcontextprotocol/server-everything"],
  "url": "https://mcp.example.com/sse",   // sse/http only
  "enabled": true
}
```

When enabled and "Expose as Skill" is checked, all tools of that server are injected into chat as `mcp__<serverId>__<toolName>`.

### Skill

Built-in skills (`server/src/skills/registry.ts`): `get_current_time`, `calculator` (whitelisted safe math), `get_weather` (free open-meteo API), `fetch_url` (web page text extraction).

Skill descriptions are auto-appended to the System Prompt; the LLM triggers them via function calling and the frontend shows execution live as tool cards.

## Backend API Docs

The full backend contract is documented — **implement the endpoints and you can drive the entire UI** (LLM Provider / MCP / Skill config + SSE streaming chat):

- **Online**: `http://<host>/api-docs.html` (**🌐 in-page language switch**, shares the UI language preference)
- **Source**: `docs/API.md`

## API Overview

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Service & config overview |
| GET/PUT | `/api/config` | Read / save unified config (API Key masked on read) |
| POST | `/api/config/test-provider` | Provider connectivity test |
| POST | `/api/config/models` | Fetch provider model list |
| POST | `/api/mcp/test` · `/api/mcp/refresh` · GET `/api/mcp/tools` | MCP test / reconnect / tool list |
| GET | `/api/skills` | Active skills (builtin + MCP) |
| POST | `/api/chat` | SSE streaming chat (`delta` / `tool_start` / `tool_result` / `info` / `done` / `error` events) |

## Directory Structure

```
chat_ui/
├── package.json          # Unified deps & scripts (concurrently runs frontend+backend)
├── docs/API.md           # Backend API docs (Markdown)
├── client/               # Vite + React + TS frontend
│   ├── index.html        # OG / manifest / viewport
│   ├── public/           # manifest.json · sw.js · icons/ · api-docs.html
│   └── src/
│       ├── components/   # ChatView(ChatUI) · SettingsPage(settings hub) · Sidebar
│       │                 # ModelSelect(LobeChat style) · ProviderBrand(icons) · Markdown
│       ├── api.ts        # REST + SSE streaming client
│       └── styles/       # Responsive styles for all devices
└── server/               # Express + TS backend
    ├── src/
    │   ├── agent/        # Agent tool-loop orchestration
    │   ├── providers/    # OpenAI/Anthropic/Gemini/Ollama unified abstraction + registry
    │   ├── mcp/          # MCP client (stdio/sse/http)
    │   ├── skills/       # Skill registry + built-in skills + executor
    │   └── routes/       # config / mcp / skills / chat(SSE)
    └── data/             # Runtime config (gitignored)
```

## Tech Stack & License

- All core dependencies are **MIT** licensed (`@chatui/core`, `@lobehub/icons`, `@modelcontextprotocol/sdk`, `react`, `express`, `vite`) — free for commercial use (including closed-source/SaaS); the only obligation is retaining each dependency's copyright notice (LICENSE files ship inside `node_modules`).
- This project is built on MIT dependencies; it is recommended to include the dependency LICENSE notices when distributing.

## Dev Notes

- The Service Worker registers only in production to avoid dev-cache interference
- Stream abort: clicking the top ■ stop button aborts the request; the backend cancels the agent loop accordingly
- API Keys live only in local `server/data/config.json`; read endpoints return masked values
- The config file contains Chinese text — do not edit it with non-UTF-8 editors (would corrupt the Chinese)
