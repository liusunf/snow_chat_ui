# ChatUI LLM Workbench

基于 **ChatUI（[@chatui/core](https://chatui.io)）** 的通用大模型对话聊天窗口：
**统一 LLM Provider 配置 + MCP 工具 + Skill 技能系统**，全端响应式（PC / 平板 / 移动端）+ PWA 可安装。

> 需要把本 UI 接入自己的后端？见 **[接口对接文档](./docs/API.md)**（在线版 `http://<host>/api-docs.html`）——按文档实现后端接口即可驱动全部 AI 交互。

## 功能特性

| 能力 | 说明 |
|---|---|
| 💬 ChatUI 对话界面 | 阿里 ChatUI 对话式交互：气泡、打字指示、Markdown 渲染、流式输出光标、动态欢迎页（建议问题轮播） |
| 🔌 LLM Provider 统一配置 | 独立「设置中心」统一管理 OpenAI 兼容 / Anthropic Claude / Google Gemini / Ollama，支持自定义 BaseURL（DeepSeek、Moonshot、通义、vLLM 等）、流式输出、连通性测试、拉取模型 |
| 🧩 MCP 支持 | 基于官方 `@modelcontextprotocol/sdk`，支持 stdio / SSE / HTTP(Streamable) 三种传输，工具自动发现、一键测试、刷新重连、暴露为技能 |
| 🎯 Skill 技能系统 | 内置技能（时间 / 计算器 / 天气 / 网页抓取）+ MCP 工具绑定为技能；通过 function calling 自动触发，工具调用过程以卡片实时展示 |
| 🗂 供应商预设模板 | 11 家一键模板（OpenAI / DeepSeek / Moonshot / 智谱 / 通义 / Groq / OpenRouter / Claude / Gemini / Ollama / 本地 vLLM），带官方品牌图标选择弹层（`@lobehub/icons`） |
| 🧭 LobeChat 风格 ModelSelect | 聚焦即弹出模型下拉面板：品牌图标 + 当前项高亮 + 输入过滤，替代原生下拉 |
| 📡 模型自动拉取 + 白名单 | 「拉模型」自动获取可用模型（OpenAI 兼容 `/models`、Gemini `/models`、Ollama `/api/tags`），勾选生成模型白名单 |
| 🏠 独立设置中心 | 对齐 LobeChat/Dify 形态：左导航分域（模型服务 / 工具连接 / 技能 / 高级与数据）+ 顶栏返回/导出/导入/保存；对话区全屏化 |
| 📤 配置导出 / 导入 | 一键导出/导入配置 JSON，便于多端迁移与备份 |
| 📖 接口对接文档 | 完整的后端接口契约文档（`docs/API.md` + 在线 `/api-docs.html`），设置中心顶栏「接口文档」按钮直达 |
| 📱 全端支持 | 桌面「会话 + 全屏聊天」双栏；移动端单栏 + 底部导航，`100dvh` + 安全区适配 |
| 📦 PWA | `manifest.json` + Service Worker 离线壳 + 图标，可"添加到主屏幕" |
| 🔗 社交分享 | Open Graph / Twitter Card 标签 + 1200×630 分享图 |

## 架构

```
┌─────────────────────────────┐      ┌──────────────────────────────────────┐
│  client (Vite + React + TS) │      │  server (Express + TS)                │
│  ┌─────────┐ ┌───────────┐  │ /api │  ┌──────────────┐  ┌───────────────┐  │
│  │ Sidebar │ │ ChatView  │◄─┼──────┼─►│ routes/chat  │─►│ agent (工具循环) │  │
│  │ 会话列表 │ │ ChatUI+SSE│  │      │  │ (SSE 流式)   │  └──────┬────────┘  │
│  └─────────┘ └─────┬─────┘  │      │  └──────────────┘         │            │
│  ┌────────────────┐│        │      │  ┌──────────┐ ┌──────────┴────────┐   │
│  │ SettingsPage   ││        │      │  │providers/│ │ skills/ + mcp/    │   │
│  │ 设置中心(四域)  ││        │      │  │统一抽象   │ │ Skill 注册表/执行器│   │
│  └────────────────┘│        │      │  └──────────┘ └───────────────────┘   │
└─────────────────────┘        │      │  MCP SDK ◄──── npx MCP Server        │
                                │      └──────────────────────────────────────┘
```

**Agent 工具循环**（`server/src/agent/agent.ts`）：组装工具 → 调 LLM → 解析 `tool_calls` → 执行 Skill / MCP → 结果回填上下文 → 继续，直到无工具调用（最多 `maxToolRounds` 轮）。

## 快速开始

要求：Node.js ≥ 18（原生 `fetch` / `AbortController`）。

```bash
# 安装依赖
npm install

# 开发模式（前端 5173 + 后端 8787，Vite 代理 /api）
npm run dev
# 访问 http://localhost:5173

# 生产构建 + 启动（单端口 8787，前端由后端托管）
npm run build
npm start
# 访问 http://localhost:8787
```

## 配置说明

配置持久化在 `server/data/config.json`（首次启动自动生成，可被环境变量 `CONFIG_PATH` 覆盖；该目录已被 .gitignore 排除，含 API Key）。

### LLM Provider（统一配置）

| 类型 | BaseURL 默认值 | 说明 |
|---|---|---|
| `openai` | `https://api.openai.com/v1` | 兼容 OpenAI 协议：OpenAI / DeepSeek / Moonshot / 通义 / vLLM / LM Studio 等 |
| `anthropic` | `https://api.anthropic.com` | Claude 官方 |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta` | Google Gemini |
| `ollama` | `http://localhost:11434` | 本地模型 |

- 默认只保留一个本地 Provider（Ollama），其余通过「＋ 添加 Provider」从品牌弹层按需添加
- 每个 Provider：类型、名称、BaseURL、API Key、模型、Temperature、Max Tokens、启用开关、模型白名单
- 点卡片前圆点设为**默认** Provider，对话即走该模型
- 支持「测试」按钮验证连通性、「拉取模型」填充白名单

### MCP Server

```jsonc
{
  "id": "everything",
  "transport": "stdio",          // stdio | sse | http
  "command": "npx",              // stdio 时
  "args": ["-y", "@modelcontextprotocol/server-everything"],
  "url": "https://mcp.example.com/sse",   // sse/http 时
  "enabled": true
}
```

启用并勾选「暴露为技能」后，该 Server 的全部工具会以 `mcp__<serverId>__<toolName>` 注入对话。

### Skill

内置技能（`server/src/skills/registry.ts`）：`get_current_time`、`calculator`（白名单安全计算）、`get_weather`（open-meteo 免费 API）、`fetch_url`（网页正文抓取）。

技能描述自动注入 System Prompt，LLM 通过 function calling 按需触发，前端以工具卡片实时展示执行过程（运行中 → ✓/✗）。

## 接口对接文档

后端接口契约已整理成完整文档，**按文档实现后端即可驱动整套 UI**（含 LLM Provider / MCP / Skill 配置与 SSE 流式对话）：

- **在线版**：`http://<host>/api-docs.html`（设置中心顶栏「📖 接口文档」直达）
- **源码版**：`docs/API.md`

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 服务与配置概览 |
| GET/PUT | `/api/config` | 读取 / 保存统一配置（读取时 API Key 掩码） |
| POST | `/api/config/test-provider` | Provider 连通性测试 |
| POST | `/api/config/models` | 拉取 Provider 可用模型列表 |
| POST | `/api/mcp/test` · `/api/mcp/refresh` · GET `/api/mcp/tools` | MCP 测试 / 重连 / 工具列表 |
| GET | `/api/skills` | 当前生效技能（builtin + MCP） |
| POST | `/api/chat` | SSE 流式对话（`delta` / `tool_start` / `tool_result` / `info` / `done` / `error` 事件） |

## 全端与 PWA

- **响应式断点**：>1180px 双栏（会话 + 全屏聊天）；<900px 单栏 + 底部导航（会话 / 聊天 / 配置视图切换）
- **移动端**：`viewport-fit=cover` + `env(safe-area-inset-bottom)`，`user-scalable=no` 防误缩放
- **PWA**：`/manifest.json`（standalone + 图标）、`/sw.js`（预缓存壳 + 静态资源 stale-while-revalidate + API 网络优先）
- **OG**：`og:*` 与 `twitter:card` 标签 + `/icons/og-cover.png`（1200×630）

## 目录结构

```
chat_ui/
├── package.json          # 统一依赖与脚本（concurrently 起前后端）
├── docs/API.md           # 后端接口对接文档（Markdown 版）
├── client/               # Vite + React + TS 前端
│   ├── index.html        # OG / manifest / viewport
│   ├── public/           # manifest.json · sw.js · icons/ · api-docs.html
│   └── src/
│       ├── components/   # ChatView(ChatUI) · SettingsPage(设置中心) · Sidebar
│       │                 # ModelSelect(LobeChat风格) · ProviderBrand(品牌图标) · Markdown
│       ├── api.ts        # REST + SSE 流式客户端
│       └── styles/       # 全端响应式样式
└── server/               # Express + TS 后端
    ├── src/
    │   ├── agent/        # Agent 工具循环编排
    │   ├── providers/    # OpenAI/Anthropic/Gemini/Ollama 统一抽象 + 注册表
    │   ├── mcp/          # MCP 客户端（stdio/sse/http）
    │   ├── skills/       # Skill 注册表 + 内置技能 + 执行器
    │   └── routes/       # config / mcp / skills / chat(SSE)
    └── data/             # 运行时配置（gitignore）
```

## 技术栈与许可

- 核心依赖均为 **MIT** 许可（`@chatui/core`、`@lobehub/icons`、`@modelcontextprotocol/sdk`、`react`、`express`、`vite`）——可自由商用（含闭源、SaaS），唯一义务是分发时保留各依赖的版权声明（`node_modules` 中自带 LICENSE 文件）。
- 本项目基于 MIT 依赖构建，发布时建议随附各依赖的 LICENSE 声明。

## 开发备注

- 前端仅生产模式注册 Service Worker，避免开发期缓存干扰
- 流式中断：点击顶部 ■ 停止按钮会 abort 请求，后端同步中断 Agent 循环
- API Key 只存于本地 `server/data/config.json`，读取接口返回掩码
- 配置文件含中文文本，请勿用非 UTF-8 编辑器直接修改（会损坏中文）
