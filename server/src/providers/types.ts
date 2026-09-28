/**
 * LLM Provider 统一抽象：所有 Provider（OpenAI 兼容 / Anthropic / Gemini / Ollama）
 * 都实现同一套 Chat 接口，向上输出统一的流式事件。
 */

import type { ProviderConfig } from '../config.js';

/** 统一对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  /** assistant 消息中的工具调用 */
  toolCalls?: ToolCall[];
  /** tool 消息对应的调用 ID */
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  /** JSON 字符串参数 */
  arguments: string;
}

/** 统一工具定义（OpenAI function schema，各 Provider 自行转换） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ProviderEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'tool-call'; call: ToolCall }
  | { type: 'done'; finishReason?: string; usage?: unknown }
  | { type: 'error'; message: string };

export interface ProviderRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onEvent: (ev: ProviderEvent) => void;
}

export interface LLMProvider {
  readonly type: string;
  chat(req: ProviderRequest): Promise<void>;
  /** 轻量连通性测试 */
  test(): Promise<{ ok: boolean; message: string }>;
  /** 拉取可用模型列表 */
  listModels(): Promise<string[]>;
}

/** 读取流中增量，统一 JSON 解析（兼容 BOM / 多空格） */
export function parseJSONL(line: string): Record<string, unknown> | null {
  const t = line.trim().replace(/^\uFEFF/, '');
  if (!t) return null;
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** 由 ProviderConfig 解析出带默认值的请求参数 */
export function requestParams(cfg: ProviderConfig) {
  return {
    temperature: cfg.temperature ?? 0.7,
    maxTokens: cfg.maxTokens ?? 4096,
  };
}

export function baseUrlOrDefault(cfg: ProviderConfig, fallback: string): string {
  return (cfg.baseURL || fallback).replace(/\/+$/, '');
}

/** 统一的网络错误信息提取 */
export function errText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
