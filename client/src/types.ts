/** 前端类型定义（与服务端配置模型对应） */

export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama';

export interface ProviderConfig {
  id: string;
  type: ProviderType;
  name: string;
  baseURL?: string;
  apiKey?: string;
  model: string;
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
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'mcp';
  mcpServerId?: string;
  enabled: boolean;
}

export interface AppConfig {
  activeProviderId: string;
  providers: ProviderConfig[];
  mcpServers: McpServerConfig[];
  skills: SkillConfig[];
  systemPrompt?: string;
  maxToolRounds: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  parameters?: Record<string, unknown>;
}

export interface ActiveSkillInfo {
  id: string;
  name: string;
  description: string;
  kind: 'builtin' | 'mcp';
  mcpServerId?: string;
}

export interface SkillsResponse {
  builtins: SkillInfo[];
  active: ActiveSkillInfo[];
  errors: string[];
}

/** 会话（本地持久化） */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  providerId: string;
  messages: ChatMessage[];
}

export interface TestResult {
  ok: boolean;
  message: string;
}
