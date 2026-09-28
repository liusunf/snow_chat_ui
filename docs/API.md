# snow_chat_ui — 后端接口对接文档

> **目标**：本 UI（前端）是**纯静态产物**，所有 AI 交互（LLM Provider 统一配置、MCP 工具、Skill 技能、流式对话）都通过一组约定好的 HTTP 接口与后端对接。**只要按照本文档实现这些后端接口，并把前端构建产物托管在服务上，即可完整驱动这套 UI 的全部功能。**

- 适用前端版本：`client/dist`（构建产物，含 PWA / manifest / OG）
- 传输：HTTP/1.1 + JSON；流式对话使用 SSE（Server-Sent Events）
- 默认端口：`8787`（可通过环境变量 `PORT` 覆盖）

---

## 1. 总体架构

```
┌─────────────────────────────┐        HTTP / SSE          ┌──────────────────────────────┐
│  前端（静态产物，浏览器）     │  ───────────────────────►  │  你的后端服务                  │
│  - 对话页（ChatView）        │  GET/POST /api/*          │  - 配置持久化（任意存储）       │
│  - 设置中心（SettingsPage）  │  ◄─────────────────────   │  - LLM Provider 适配层        │
│  - 会话列表 / 全端 PWA       │      JSON / SSE 流          │  - MCP 客户端（可选）          │
└─────────────────────────────┘                            │  - 技能执行器（function call）  │
                                                           └──────────────────────────────┘
```

**后端职责**（按文档实现即可）：
1. 提供 `/api/*` 全部接口（第 3 节）。
2. 实现「统一 LLM Provider 抽象」：把 `ProviderConfig` 转成真实厂商 API 调用，并把结果统一转成 SSE 事件流（第 4 节）。
3. 实现「工具循环」：LLM 返回工具调用 → 执行对应技能/MCP 工具 → 结果回填 → 继续请求，直到 LLM 输出最终文本（第 4.3 节）。
4. 托管前端静态产物（第 2 节）。

---

## 2. 前端静态托管约定（全端支持的前提）

将前端构建产物按**以下固定路径**放置，UI 才能完整工作（含 PWA 安装、分享卡片）：

| 路径 | 内容 | 说明 |
|---|---|---|
| `/` | `index.html` | 入口页，含 OG/Twitter Card/meta 标签（已内置） |
| `/assets/*` | JS/CSS 构建产物 | 由 Vite 生成，`index.html` 自动引用 |
| `/manifest.json` | PWA 清单 | 名称 `snow_chat_ui`、图标、主题色 |
| `/sw.js` | Service Worker | PWA 离线缓存（如不想支持可省略，但需保证前端未注册 SW） |
| `/icons/icon-192.png`、`/icons/icon-512.png` | PWA 图标 | 192/512 px |
| `/icons/apple-touch-icon.png` | iOS 图标 | 180 px |
| `/icons/og-cover.png` | 分享卡片图 | 1200×630 |

**SPA 回退**：对非 `/api/` 开头的 GET 请求返回 `index.html`（前端为单页应用，路由由前端控制）。

> 前端未内置鉴权。若需要登录鉴权，可在网关层自行加（如 Cookie/Session/JWT），接口本身无状态约定；唯一注意：`GET /api/config` 返回的 `apiKey` 必须是**掩码后的**（见 3.1）。

---

## 3. 接口明细

### 3.0 通用约定

- `Content-Type: application/json`（请求与响应）；字符集 `UTF-8`。
- 错误统一格式（非流式接口）：
  ```json
  { "error": "错误描述" }
  ```
  或（带 ok 语义的接口）：
  ```json
  { "ok": false, "message": "错误描述" }
  ```
- 所有接口均允许跨域（CORS），前端与后端可部署在不同源。
- 请求体大小限制建议 ≥ 2MB（配置中含 MCP 描述等文本）。

---

### 3.1 `GET /api/config` — 读取配置

前端「设置中心」加载时调用，渲染全部 Provider / MCP / Skill 配置。

**响应 200**（`AppConfig`，`apiKey` 已掩码）：

```json
{
  "activeProviderId": "ollama-demo",
  "providers": [
    {
      "id": "ollama-demo",
      "type": "ollama",
      "name": "Ollama 本地",
      "baseURL": "http://localhost:11434",
      "apiKey": "",
      "model": "ornith-1.5:9b",
      "temperature": 0.7,
      "maxTokens": 4096,
      "enabled": true,
      "models": ["ornith-1.5:9b"]
    }
  ],
  "mcpServers": [
    {
      "id": "everything",
      "name": "MCP Everything (stdio 示例)",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "env": {},
      "enabled": false
    },
    {
      "id": "fetch-demo",
      "name": "MCP Fetch (http 示例)",
      "transport": "http",
      "url": "https://mcp.example.com/sse",
      "enabled": false
    }
  ],
  "skills": [
    {
      "id": "get_current_time",
      "name": "获取当前时间",
      "description": "获取当前日期与时间（含时区）",
      "type": "builtin",
      "enabled": true
    }
  ],
  "systemPrompt": "你是一个通用 AI 助手……",
  "maxToolRounds": 8
}
```

**数据模型（全部字段）**：

| 类型 | 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| AppConfig | `activeProviderId` | string | ✓ | 当前默认 Provider 的 id（对话不指定 provider 时使用） |
| AppConfig | `providers` | ProviderConfig[] | ✓ | LLM Provider 列表 |
| AppConfig | `mcpServers` | McpServerConfig[] | ✓ | MCP 服务器列表 |
| AppConfig | `skills` | SkillConfig[] | ✓ | 技能列表（builtin + MCP 绑定） |
| AppConfig | `systemPrompt` | string | | 附加系统提示词，后端会追加技能清单 |
| AppConfig | `maxToolRounds` | number | ✓ | 单次对话最大工具循环轮数（1~20） |
| ProviderConfig | `id` | string | ✓ | 唯一 id |
| ProviderConfig | `type` | `'openai'\|'anthropic'\|'gemini'\|'ollama'` | ✓ | Provider 类型（驱动厂商适配） |
| ProviderConfig | `name` | string | ✓ | 显示名称 |
| ProviderConfig | `baseURL` | string | | 厂商 API 地址（openai 为 OpenAI 兼容 `/v1`；ollama 为 `http://host:11434`） |
| ProviderConfig | `apiKey` | string | | API Key（**GET 时掩码**，保存时明文） |
| ProviderConfig | `model` | string | ✓ | 当前模型名 |
| ProviderConfig | `models` | string[] | | 模型白名单（可空；非空时仅这些模型可选） |
| ProviderConfig | `temperature` | number | | 采样温度（默认 0.7） |
| ProviderConfig | `maxTokens` | number | | 最大生成 token（默认 4096） |
| ProviderConfig | `enabled` | boolean | ✓ | 是否启用 |
| McpServerConfig | `id` | string | ✓ | 唯一 id |
| McpServerConfig | `name` | string | ✓ | 显示名称 |
| McpServerConfig | `transport` | `'stdio'\|'sse'\|'http'` | ✓ | MCP 传输方式 |
| McpServerConfig | `command` | string | | stdio：启动命令（如 `npx`） |
| McpServerConfig | `args` | string[] | | stdio：参数 |
| McpServerConfig | `env` | object | | stdio：附加环境变量 |
| McpServerConfig | `url` | string | | sse/http：服务地址 |
| McpServerConfig | `enabled` | boolean | ✓ | 是否启用 |
| SkillConfig | `id` | string | ✓ | 技能 id（与后端注册表对应） |
| SkillConfig | `name` | string | ✓ | 显示名称 |
| SkillConfig | `description` | string | ✓ | 给 LLM 看的说明 |
| SkillConfig | `type` | `'builtin'\|'mcp'` | ✓ | builtin=内置函数；mcp=绑定 MCP 工具 |
| SkillConfig | `mcpServerId` | string | | type=mcp 时绑定的 MCP server id |
| SkillConfig | `enabled` | boolean | ✓ | 是否启用 |

**掩码规则参考**：`apiKey` 长度 ≤8 时全部 `*`；否则 `前4位 + *×min(12, len-8) + 后4位`。

---

### 3.2 `PUT /api/config` — 保存配置

前端「设置中心」点击「保存配置」时调用。请求体为完整 `AppConfig`（第 3.1 节模型），`apiKey` 为**明文**。

**请求体**：完整 `AppConfig` JSON。

**响应 200**：`{ "ok": true }`

**响应 400**：`{ "error": "配置格式不正确：缺少 providers 数组" }`（当请求体缺少 `providers` 数组时）

> 后端保存策略建议：**整体覆盖**（前端每次提交完整配置）。需要兼容旧字段时，用默认值补齐缺失字段（参考第 6 节默认值）。

---

### 3.3 `POST /api/config/models` — 拉取模型列表

前端 Provider 卡片「拉取模型」按钮调用，把可用模型填充到白名单。

**请求体**（ProviderConfig，明文）：

```json
{ "type": "ollama", "baseURL": "http://localhost:11434", "apiKey": "", "model": "ornith-1.5:9b" }
```

**响应 200**：

```json
{ "ok": true, "models": ["ornith-1.5:9b", "qwen35-4b:latest", "gemma4:e4b"] }
```

**响应 200（失败也返回 200 + 错误文案，前端据此提示）**：

```json
{ "ok": false, "message": "无法连接到 http://localhost:11434（Ollama 服务未启动或地址不对）" }
```

> 前端超时约定 8 秒；错误文案需**人话化**，区分「网络不通」与「Key 无效」。当厂商接口不可达时可返回离线候选模型（允许兜底返回常见模型名列表，`ok: true`）。

---

### 3.4 `POST /api/config/test-provider` — 测试 Provider 连通性

前端 Provider 卡片「测试连接」按钮调用。

**请求体**：ProviderConfig（同上）。

**响应 200**：

```json
{ "ok": true, "message": "Ollama 本地 (ornith-1.5:9b) 连接成功" }
```

或

```json
{ "ok": false, "message": "无法连接到 http://localhost:11434（Ollama 服务未启动或地址不对）" }
```

---

### 3.5 `POST /api/mcp/test` — 测试 MCP 连接

前端「工具连接」页「测试」按钮调用。

**请求体**：McpServerConfig（完整，含 transport 与连接参数）。

**响应 200**：

```json
{ "ok": true, "message": "已连接，发现 N 个工具" }
```

或

```json
{ "ok": false, "message": "连接失败原因" }
```

---

### 3.6 `POST /api/mcp/refresh` — 刷新 MCP 会话

前端「工具连接」页「重连」按钮调用（MCP stdio 子进程/SSE 会话断开后重新建立）。

**请求体**：

```json
{ "id": "everything" }
```

**响应 200**：`{ "ok": true, "message": "已重新连接" }`

**响应 404**：`{ "ok": false, "message": "未找到 MCP Server: everything" }`

---

### 3.7 `GET /api/mcp/tools` — 列出已启用 MCP 的工具（可选）

返回所有已启用 MCP Server 暴露的工具名，供调试/日志。

**响应 200**：

```json
[
  {
    "serverId": "everything",
    "serverName": "MCP Everything (stdio 示例)",
    "tools": [{ "name": "mcp__everything__echo", "description": "Echo 工具" }]
  }
]
```

---

### 3.8 `GET /api/skills` — 技能列表

前端设置中心「技能」页加载时调用（展示内置技能 + 当前激活技能）。

**响应 200**：

```json
{
  "builtins": [
    {
      "id": "get_current_time",
      "name": "获取当前时间",
      "description": "获取当前日期与时间（含时区）",
      "enabled": true,
      "parameters": { "type": "object", "properties": {}, "required": [] }
    }
  ],
  "active": [
    {
      "id": "get_current_time",
      "name": "获取当前时间",
      "description": "获取当前日期与时间（含时区）",
      "kind": "builtin",
      "mcpServerId": null
    }
  ],
  "errors": []
}
```

- `builtins`：后端注册的全部内置技能（含 `parameters` 供 LLM function schema）。
- `active`：当前启用生效的技能（builtin 启用 + MCP 动态发现）。
- `errors`：MCP 连接失败等收集到的错误数组。

---

### 3.9 `GET /api/health` — 健康检查

前端启动时探测服务可用性。

**响应 200**：

```json
{
  "ok": true,
  "providers": [{ "id": "ollama-demo", "name": "Ollama 本地", "enabled": true }],
  "activeProviderId": "ollama-demo",
  "mcpServers": [{ "id": "everything", "name": "MCP Everything (stdio 示例)", "enabled": false }],
  "skills": ["获取当前时间", "计算器", "天气查询", "网页抓取"]
}
```

---

### 3.10 `POST /api/chat` — 流式对话（核心）

前端发消息、Agent 流式输出的唯一入口。**SSE（text/event-stream）**。

**请求头**：`Content-Type: application/json`

**请求体**：

```json
{
  "messages": [
    { "role": "user", "content": "现在几点？" }
  ],
  "providerId": "ollama-demo",
  "model": "ornith-1.5:9b"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `messages` | ChatMessage[] | ✓ | 历史消息（含 system/user/assistant/tool 各角色，见下） |
| `providerId` | string | | 指定 Provider；缺省用 `activeProviderId` |
| `model` | string | | 覆盖 Provider 默认模型 |

**ChatMessage**：

```json
{
  "role": "system | user | assistant | tool",
  "content": "文本内容",
  "toolCalls": [{ "id": "call_1", "name": "get_current_time", "arguments": "{}" }],
  "toolCallId": "call_1"
}
```

- `toolCalls`：仅 assistant 消息携带（多轮工具循环时回传，供厂商 API 识别）。
- `toolCallId`：仅 tool 消息携带（对应 assistant 的某次调用）。

**响应**：`Content-Type: text/event-stream; charset=utf-8`，事件格式：

```
event: <事件名>
data: <JSON>

```

服务端应设置：`Cache-Control: no-cache, no-transform`、`Connection: keep-alive`、`X-Accel-Buffering: no`，并**立即 flush 响应头**；建议每 15s 发送一行注释 `: ping` 作为心跳。

**事件协议（按时间顺序）**：

| 事件名 | data 字段 | 触发时机 |
|---|---|---|
| `info` | `{ "text": "已加载 4 个技能（4 个工具）" }` | 流程开始前/过程中的提示信息（前端居中显示） |
| `tool_start` | `{ "name": "get_current_time", "id": "call_1", "args": "{}" }` | LLM 请求调用某工具，开始执行时 |
| `tool_result` | `{ "name": "get_current_time", "id": "call_1", "result": {...}, "error": "可选" }` | 工具执行完成（`result` 与 `error` 二选一） |
| `delta` | `{ "text": "现在" }` | **LLM 流式增量文本**（逐 token 推送，前端实时渲染） |
| `done` | `{ "usage": {...} }`（可选） | 全部输出结束（正常终止，随后关闭流） |
| `error` | `{ "message": "错误描述" }` | 流程异常终止（随后关闭流） |

**一次典型对话的完整事件流**：

```
event: info
data: {"text":"已加载 4 个技能（4 个工具）"}

event: tool_start
data: {"name":"get_current_time","id":"call_1","args":"{}"}

event: tool_result
data: {"name":"get_current_time","id":"call_1","result":{"iso":"2026-09-27T14:00:00.000Z","local":"Sun Sep 27 2026 22:00:00 GMT+0800","unix":1793000000,"timezone":"Asia/Shanghai"}}

event: delta
data: {"text":"现在是"}

event: delta
data: {"text":"22:00，"}

event: delta
data: {"text":"今天是 2026 年 9 月 27 日。"}

event: done
data: {"usage":{"eval_count":64}}
```

> 前端渲染规则：`delta` 逐字追加到当前 assistant 气泡；`tool_start`/`tool_result` 渲染为工具卡片（运行中 → ✓/✗）；`info` 渲染为居中提示；`done`/`error` 结束本次流。

---

## 4. 后端核心逻辑（必须实现的「语义」）

接口只是外壳，要让 UI 真正可用，后端还需实现以下三件事：

### 4.1 统一 LLM Provider 适配层

后端定义统一接口，各厂商实现同一套方法：

| 方法 | 入参 | 出参 | 说明 |
|---|---|---|---|
| `chat(req)` | `{ model, messages, tools?, temperature?, maxTokens?, onEvent }` | 通过 `onEvent` 流式回调 | 调用厂商流式接口，逐 token 回调 `text-delta`；识别 `tool_calls` 回调 `tool-call`；结束回调 `done` |
| `test()` | — | `{ ok, message }` | 轻量连通性测试 |
| `listModels()` | — | `string[]` | 拉取模型列表 |

厂商类型：`openai`（OpenAI 兼容 `/v1/chat/completions` 流式）、`anthropic`（Messages API）、`gemini`（generateContent 流式）、`ollama`（`/api/chat` NDJSON 流式）。后端可按需扩展新类型（前端通过「＋ 添加 Provider」的预设模板支持新厂商展示，需同步 `providerPresets.ts` 的预设或由前端配置任意 baseURL）。

### 4.2 工具定义注入

每次对话请求，把「当前启用的技能」转换为 OpenAI function schema 传给 LLM：

```json
{
  "type": "function",
  "function": {
    "name": "get_current_time",
    "description": "获取当前日期与时间（含时区）",
    "parameters": { "type": "object", "properties": {}, "required": [] }
  }
}
```

启用规则：
- `skills[].type === 'builtin' && enabled` → 后端内置实现（函数）。
- `skills[].type === 'mcp' && enabled` → 该 MCP server 已启用时，动态列出其全部工具注入。
- 建议把技能清单以纯文本追加到系统提示词尾部（便于弱工具模型也能感知）。

### 4.3 Agent 工具循环

```
for round in 1..maxToolRounds:
    result = provider.chat(messages, tools)          # 流式输出 delta
    if 无 tool_calls: 结束（emit done）
    messages += assistant(toolCalls)
    for each tool_call:
        emit tool_start
        result = executeSkill(tool_call)             # builtin 函数 或 MCP 调用
        emit tool_result
        messages += tool(toolCallId, JSON(result))
    # 继续下一轮，把工具结果喂回 LLM
```

- 上限 `maxToolRounds`（默认 8），达到后 emit `info` 并结束。
- 工具结果建议截断（如 12KB）再回填，防止上下文膨胀。
- 支持用户中断：客户端断开时后端应中止厂商请求（`req.on('close')` → abort）。

---

## 5. 前端各页面调用的接口（对接自查表）

| 页面/行为 | 调用接口 |
|---|---|
| 应用启动健康探测 | `GET /api/health` |
| 设置中心加载 | `GET /api/config`、`GET /api/skills` |
| 设置中心保存 | `PUT /api/config` |
| Provider 测试连接 | `POST /api/config/test-provider` |
| Provider 拉取模型 | `POST /api/config/models` |
| MCP 测试 / 重连 | `POST /api/mcp/test`、`POST /api/mcp/refresh` |
| 技能页展示 | `GET /api/skills` |
| 发送消息 / Agent 流式 | `POST /api/chat`（SSE） |
| 前端资源 / PWA / 分享 | `/`、`/assets/*`、`/manifest.json`、`/sw.js`、`/icons/*`（静态） |

---

## 6. 默认配置参考（后端初始化示例）

后端首次启动无持久化配置时，可返回以下默认 `AppConfig`（所有名称必须是 UTF-8 中文，勿用占位符 `?`）：

```json
{
  "activeProviderId": "openai-demo",
  "providers": [
    { "id": "openai-demo", "type": "openai", "name": "OpenAI 兼容", "baseURL": "https://api.openai.com/v1", "apiKey": "", "model": "gpt-4o-mini", "temperature": 0.7, "maxTokens": 4096, "enabled": true, "models": [] },
    { "id": "ollama-demo", "type": "ollama", "name": "Ollama 本地", "baseURL": "http://localhost:11434", "apiKey": "", "model": "llama3.1", "temperature": 0.7, "maxTokens": 4096, "enabled": false, "models": [] }
  ],
  "mcpServers": [],
  "skills": [
    { "id": "get_current_time", "name": "获取当前时间", "description": "获取当前日期与时间（含时区）", "type": "builtin", "enabled": true },
    { "id": "calculator", "name": "计算器", "description": "执行精确的四则运算表达式", "type": "builtin", "enabled": true }
  ],
  "systemPrompt": "你是一个通用 AI 助手。回答保持简洁、准确、结构化，使用 Markdown 格式。",
  "maxToolRounds": 8
}
```

内置技能注册表（`get_current_time` / `calculator` / `get_weather` / `fetch_url`）需在后端实现对应函数；未实现的技能可以不在 `skills` 中启用。

---

## 7. 快速验证清单

1. `GET /api/health` 返回 `{ ok: true }`。
2. `GET /api/config` 返回完整配置，中文无乱码，`apiKey` 已掩码。
3. `PUT /api/config` 保存后重新 `GET` 一致。
4. `POST /api/chat`（messages 为 `[{role:"user",content:"你好"}]`）返回 SSE，先 `info` 后若干 `delta` 最后 `done`。
5. 浏览器打开 `/`：对话、设置中心四域（模型服务/工具连接/技能/高级与数据）、保存配置均可用；移动端底部导航正常；`/manifest.json` 可达。

---

*文档版本：v1.0 · 与当前前端构建产物（client/dist）契约一致*
