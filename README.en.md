# ChatUI LLM Workbench

[**中文**](README.md) · English

> Full Chinese version at [README.md](README.md)

A universal LLM chat window built on **ChatUI ([@chatui/core](https://chatui.io))**:
**unified LLM Provider config + MCP tools + Skill system**, fully responsive (PC / tablet / mobile) + installable PWA.

> Want to plug this UI into your own backend? See the **[Backend API docs](./docs/API.md)** (online at `http://<host>/api-docs.html`) — implement the endpoints as documented and all AI interactions work.

## Features

| Capability | Description |
|---|---|
| 💬 ChatUI interface | Alibaba ChatUI conversation UI: bubbles, typing indicator, Markdown rendering, streaming cursor, dynamic welcome page (rotating suggestions) |
| 🔌 Unified LLM Provider config | Independent Settings hub manages OpenAI-compatible / Anthropic Claude / Google Gemini / Ollama; custom BaseURL (DeepSeek, Moonshot, Qwen, vLLM…), streaming, connectivity test, fetch models |
| 🧩 MCP support | Based on official `@modelcontextprotocol/sdk`; stdio / SSE / HTTP(Streamable) transports, auto tool discovery, one-click test, refresh/reconnect, expose as Skill |
| 🎯 Skill system | Built-in skills (time / calculator / weather / fetch URL) + MCP tools bound as skills; triggered via function calling, tool execution shown live as cards |
| 🗂 Provider presets | 11 one-click templates (OpenAI / DeepSeek / Moonshot / Zhipu / Qwen / Groq / OpenRouter / Claude / Gemini / Ollama / local vLLM) with an official-brand-icon picker (`@lobehub/icons`) |
| 🧭 LobeChat-style ModelSelect | Focus opens a model dropdown panel: brand icon + current-item highlight + filter input, replacing the native select |
| 📡 Auto fetch models + whitelist | "Fetch models" pulls available models (OpenAI-compatible `/models`, Gemini `/models`, Ollama `/api/tags`); checkboxes build the whitelist |
| 🏠 Standalone Settings hub | LobeChat/Dify-like layout: left-nav domains (Models / Tools / Skills / Advanced) + top bar back/export/import/save; chat area full-screen |
| 📤 Config export / import | One-click JSON export/import for migration and backup |
| 📖 Backend API docs | Full backend contract (`docs/API.md` + online `/api-docs.html`), reachable from the Settings top bar "API Docs" button |
| 🌐 Backend API URL config | Settings → Advanced → Backend service sets the backend URL (localStorage-persisted); frontend can be deployed standalone against any backend; blank = same-origin `/api/*` |
| 🌏 Language switch | Top bar 🌐 toggles 简体中文 / English (chat page + Settings hub); preference persisted; every UI string updates instantly |
| 📱 All-device support | Desktop dual-pane (conversations + full-screen chat); mobile single-pane with bottom nav, `100dvh` + safe-area insets |
| 📦 PWA | `manifest.json` + Service Worker offline shell + icons; "Add to home screen" |
| 🔗 Social sharing | Open Graph / Twitter Card tags + 1200×630 share image |

## Architecture

```
┌─────────────────────────────┐      ┌──────────────────────────────────────┐
│  client (Vite + React + TS) │      │  server (Express + TS)                │
│  ┌─────────┐ ┌───────────┐  │ /api │  ┌──────────────┐  ┌───────────────┐  │
│  │ Sidebar │ │ ChatView  │◄─┼──────┼─►│ routes/chat  │─►│ agent (tool loop)│ │
│  │ sessions│ │ ChatUI+SSE│  │      │  │ (SSE stream) │  └──────┬────────┘  │
│  └─────────┘ └─────┬─────┘  │      │  └──────────────┘         │            │
│  ┌────────────────┐│        │      │  ┌──────────┐ ┌──────────┴────────┐   │
│  │ SettingsPage   ││        │      │  │providers/│ │ skills/ + mcp/    │   │
│  │ 4 domains      ││        │      │  │ unified  │ │ Skill registry/    │   │
│  └────────────────┘│        │      │  └──────────┘ │ executor           │   │
└─────────────────────┘        │      │  MCP SDK ◄──── npx MCP Server        │
                                │      └──────────────────────────────────────┘
```

**Agent tool loop** (`server/src/agent/agent.ts`): assemble tools → call LLM → parse `tool_calls` → execute Skill / MCP → feed results back → repeat until no tool calls (max `maxToolRounds` rounds).

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

Skill descriptions are auto-appended to the System Prompt; the LLM triggers them via function calling and the frontend shows execution live as tool cards (running → ✓/✗).

## Backend API Docs

The full backend contract is documented — **implement the endpoints and you can drive the entire UI** (LLM Provider / MCP / Skill config + SSE streaming chat):

- **Online**: `http://<host>/api-docs.html` (reachable via the Settings top bar "📖 API Docs" button; **🌐 in-page language switch**, shares the UI language preference)
- **Source**: `docs/API.md`

## Language Switch

The UI supports **简体中文 / English** with one click (lightweight i18n, zero third-party deps, `client/src/i18n.tsx`):

- Entry points: 🌐 button in the chat top bar and in the Settings top bar
- Preference persisted in browser localStorage (key `chatui_lang`); defaults to the browser language, Chinese if undetected
- Coverage: all chat page & Settings hub strings (provider preset hints, built-in skill names, dynamic welcome suggestions…), plus the online API docs page `/api-docs.html` (independent bilingual implementation reading the same preference)
- Adding strings: add one key to both the `zh` and `en` dictionaries in `i18n.tsx`

## Backend API URL Config

The frontend requests same-origin `/api/*` by default (backend hosts `client/dist` or proxies `/api`). To **deploy the frontend standalone** (Nginx / CDN / static hosting), enter the backend URL (e.g. `http://192.168.1.10:8787`) in Settings → Advanced → Backend service:

- Stored in localStorage (key `chatui_api_base`); takes effect immediately, no rebuild needed
- Leave blank to restore same-origin relative paths
- For cross-origin deployments the backend must enable CORS (this project's Express server already includes the `cors()` middleware)

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

## All-Device & PWA

- **Breakpoints**: >1180px dual-pane (conversations + full-screen chat); <900px single-pane with bottom nav (conversations / chat / settings views)
- **Mobile**: `viewport-fit=cover` + `env(safe-area-inset-bottom)`, `user-scalable=no` prevents zoom
- **PWA**: `/manifest.json` (standalone + icons), `/sw.js` (precached shell + stale-while-revalidate static assets + network-first API)
- **OG**: `og:*` and `twitter:card` tags + `/icons/og-cover.png` (1200×630)

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
