/**
 * 统一配置模型：LLM Provider / MCP Server / Skill
 * 一份配置，全端共享（前端面板编辑，服务端持久化）。
 */

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface ProviderConfig {
  /** 唯一 ID */
  id: string;
  type: ProviderType;
  /** 显示名称 */
  name: string;
  /** OpenAI 兼容 API 地址，如 https://api.openai.com/v1 / https://api.deepseek.com/v1 */
  baseURL?: string;
  apiKey?: string;
  /** 默认模型名，如 gpt-4o-mini / deepseek-chat */
  model: string;
  /** 模型白名单（可选项，来自模型列表拉取后勾选）；为空表示不限制 */
  models?: string[];
  temperature?: number;
  maxTokens?: number;
  enabled: boolean;
}

export type McpTransport = 'stdio' | 'sse' | 'http';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  /** stdio: 启动命令，如 npx */
  command?: string;
  /** stdio: 参数，如 ["-y", "@modelcontextprotocol/server-everything"] */
  args?: string[];
  /** stdio: 附加环境变量 */
  env?: Record<string, string>;
  /** sse/http: 服务端地址 */
  url?: string;
  enabled: boolean;
}

export interface SkillConfig {
  id: string;
  /** 显示名称 */
  name: string;
  /** 给 LLM 看的说明 */
  description: string;
  type: 'builtin' | 'mcp';
  /** type=mcp 时绑定的 MCP server id */
  mcpServerId?: string;
  enabled: boolean;
}

export interface AppConfig {
  activeProviderId: string;
  providers: ProviderConfig[];
  mcpServers: McpServerConfig[];
  skills: SkillConfig[];
  /** 附加系统提示词 */
  systemPrompt?: string;
  /** 单次对话最大工具循环轮数 */
  maxToolRounds: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  activeProviderId: 'openai-demo',
  providers: [
    {
      id: 'openai-demo',
      type: 'openai',
      name: 'OpenAI 兼容',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 4096,
      enabled: true,
    },
    {
      id: 'anthropic-demo',
      type: 'anthropic',
      name: 'Anthropic Claude',
      apiKey: '',
      model: 'claude-3-5-sonnet-latest',
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false,
    },
    {
      id: 'gemini-demo',
      type: 'gemini',
      name: 'Google Gemini',
      apiKey: '',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false,
    },
    {
      id: 'ollama-demo',
      type: 'ollama',
      name: 'Ollama 本地',
      baseURL: 'http://localhost:11434',
      apiKey: '',
      model: 'llama3.1',
      temperature: 0.7,
      maxTokens: 4096,
      enabled: false,
    },
  ],
  mcpServers: [
    {
      id: 'everything',
      name: 'MCP Everything (stdio 示例)',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-everything'],
      env: {},
      enabled: false,
    },
    {
      id: 'fetch-demo',
      name: 'MCP Fetch (http 示例)',
      transport: 'http',
      url: 'https://mcp.example.com/sse',
      enabled: false,
    },
  ],
  skills: [
    {
      id: 'get_current_time',
      name: '获取当前时间',
      description: '获取当前日期与时间（含时区），当用户询问现在几点/今天日期时使用',
      type: 'builtin',
      enabled: true,
    },
    {
      id: 'calculator',
      name: '计算器',
      description: '执行精确的四则运算表达式，如 "123*456+(7-3)/2"。当用户需要数学计算时使用',
      type: 'builtin',
      enabled: true,
    },
    {
      id: 'get_weather',
      name: '天气查询',
      description: '根据经纬度查询实时天气，当用户询问某地天气时使用',
      type: 'builtin',
      enabled: true,
    },
    {
      id: 'fetch_url',
      name: '网页抓取',
      description: '抓取并返回一个 http/https 网页的正文内容，当用户要求读取某个网页/链接内容时使用',
      type: 'builtin',
      enabled: true,
    },
  ],
  systemPrompt:
    '你是一个通用 AI 助手，运行在基于 ChatUI 的对话工作台中。\n' +
    '你可以调用提供的工具（技能/MCP 服务）来完成用户的请求：优先调用合适的工具获取真实数据，不要凭空编造。\n' +
    '回答保持简洁、准确、结构化，使用 Markdown 格式。',
  maxToolRounds: 8,
};

let configPath: string | null = null;

export function setConfigPath(p: string) {
  configPath = p;
}

export function getConfigPath(): string {
  return configPath ?? 'data/config.json';
}

let cached: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const fs = await import('node:fs');
    const text = fs.readFileSync(getConfigPath(), 'utf-8');
    const parsed = JSON.parse(text) as Partial<AppConfig>;
    cached = {
      ...DEFAULT_CONFIG,
      ...parsed,
      providers: parsed.providers?.length ? parsed.providers : DEFAULT_CONFIG.providers,
      mcpServers: parsed.mcpServers ?? DEFAULT_CONFIG.mcpServers,
      skills: parsed.skills ?? DEFAULT_CONFIG.skills,
    };
  } catch {
    cached = structuredClone(DEFAULT_CONFIG);
    await saveConfig(cached);
  }
  return cached;
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  cached = cfg;
  const fs = await import('node:fs');
  const path = await import('node:path');
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), 'utf-8');
}

export function resetConfigCache() {
  cached = null;
}
