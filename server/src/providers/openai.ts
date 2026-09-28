/**
 * OpenAI 兼容 Provider（OpenAI / DeepSeek / Moonshot / 通义 / 本地 vLLM 等）
 * 通过 /chat/completions 流式接口，支持 function calling。
 */

import type { LLMProvider, ProviderRequest, ChatMessage, ToolDefinition, ToolCall } from './types.js';
import { baseUrlOrDefault, errText, parseJSONL, requestParams } from './types.js';
import type { ProviderConfig } from '../config.js';

const DEFAULT_BASE = 'https://api.openai.com/v1';

export class OpenAIProvider implements LLMProvider {
  readonly type = 'openai';
  constructor(private cfg: ProviderConfig) {}

  private endpoint() {
    return `${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}/chat/completions`;
  }

  async test() {
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.cfg.apiKey ? `Bearer ${this.cfg.apiKey}` : '',
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 8,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true, message: `${this.cfg.name} (${this.cfg.model}) 连接成功` };
    } catch (e) {
      return { ok: false, message: `无法连接到 ${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}（网络不通或服务未启动）` };
    }
  }

  async listModels(): Promise<string[]> {
    let res: Response;
    try {
      res = await fetch(`${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}/models`, {
        headers: {
          Authorization: this.cfg.apiKey ? `Bearer ${this.cfg.apiKey}` : '',
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      throw new Error(`无法连接到 ${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}（网络不通或服务未启动）`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('API Key 无效或未填写（HTTP 401/403）');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`模型列表获取失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: Array<{ id: string }> };
    return (json.data ?? []).map((m) => m.id);
  }

  async chat(req: ProviderRequest) {
    const p = requestParams(this.cfg);
    const body: Record<string, unknown> = {
      model: req.model || this.cfg.model,
      messages: toOpenAIMessages(req.messages),
      stream: true,
      temperature: req.temperature ?? p.temperature,
      max_tokens: req.maxTokens ?? p.maxTokens,
    };
    if (req.tools?.length) {
      body.tools = req.tools;
      body.tool_choice = 'auto';
    }

    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.cfg.apiKey ? `Bearer ${this.cfg.apiKey}` : '',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI API ${res.status}: ${text.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let finishReason: string | undefined;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const json = parseJSONL(data);
        if (!json) continue;
        const choices = json.choices as Array<Record<string, unknown>> | undefined;
        const choice = choices?.[0];
        if (!choice) continue;
        const delta = (choice.delta ?? {}) as Record<string, unknown>;
        const content = delta.content as string | undefined;
        if (content) req.onEvent({ type: 'text-delta', delta: content });
        const toolCalls = (delta.tool_calls ?? []) as Array<Record<string, unknown>>;
        for (const tc of toolCalls) {
          const fn = (tc.function ?? {}) as Record<string, unknown>;
          if (tc.id || fn.name || fn.arguments) {
            req.onEvent({
              type: 'tool-call',
              call: {
                id: (tc.id as string) || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: (fn.name as string) || '',
                arguments: (fn.arguments as string) || '',
              },
            });
          }
        }
        if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
        if (json.usage) req.onEvent({ type: 'done', usage: json.usage }); // 非流式时
      }
    }
    req.onEvent({ type: 'done', finishReason });
  }
}

export function toOpenAIMessages(msgs: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of msgs) {
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' });
    } else if (m.role === 'assistant') {
      const base: Record<string, unknown> = { role: 'assistant', content: m.content ?? '' };
      if (m.toolCalls?.length) {
        base.tool_calls = m.toolCalls.map((tc: ToolCall) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments || '{}' },
        }));
      }
      out.push(base);
    } else {
      out.push({ role: m.role, content: m.content ?? '' });
    }
  }
  return out;
}
