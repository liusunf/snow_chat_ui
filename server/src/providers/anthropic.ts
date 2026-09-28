/**
 * Anthropic Claude Provider：/v1/messages 流式接口，支持 tool_use。
 */

import type { LLMProvider, ProviderRequest, ChatMessage, ToolDefinition } from './types.js';
import { baseUrlOrDefault, errText, parseJSONL, requestParams } from './types.js';
import type { ProviderConfig } from '../config.js';

const DEFAULT_BASE = 'https://api.anthropic.com';

export class AnthropicProvider implements LLMProvider {
  readonly type = 'anthropic';
  constructor(private cfg: ProviderConfig) {}

  private endpoint() {
    return `${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}/v1/messages`;
  }

  async test() {
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.cfg.apiKey ?? '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: this.cfg.model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
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
    // Anthropic 官方无公开 models 列表端点，返回官方当前支持的主流模型名
    return [
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
      'claude-3-sonnet-latest',
      'claude-3-haiku-latest',
      'claude-3-7-sonnet-latest',
    ];
  }

  async chat(req: ProviderRequest) {
    const p = requestParams(this.cfg);
    const body: Record<string, unknown> = {
      model: req.model || this.cfg.model,
      max_tokens: req.maxTokens ?? p.maxTokens,
      temperature: req.temperature ?? p.temperature,
      stream: true,
      messages: toAnthropicMessages(req.messages),
    };
    if (req.tools?.length) {
      body.tools = req.tools.map(toAnthropicTool);
    }

    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.cfg.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let stopReason: string | undefined;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const json = parseJSONL(line.slice(5));
        if (!json) continue;
        const type = json.type as string;
        if (type === 'content_block_delta') {
          const delta = (json.delta ?? {}) as Record<string, unknown>;
          if (delta.type === 'text_delta' && typeof delta.text === 'string') {
            req.onEvent({ type: 'text-delta', delta: delta.text });
          }
          if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            req.onEvent({
              type: 'tool-call',
              call: { id: `input_json_${Date.now()}`, name: '', arguments: delta.partial_json },
            });
          }
        } else if (type === 'content_block_start') {
          const block = (json.content_block ?? {}) as Record<string, unknown>;
          if (block.type === 'tool_use') {
            req.onEvent({
              type: 'tool-call',
              call: {
                id: (json.index != null ? `tool_${json.index}_${Date.now()}` : `tool_${Date.now()}`),
                name: (block.name as string) || '',
                arguments: '',
              },
            });
          }
        } else if (type === 'message_delta') {
          const delta = (json.delta ?? {}) as Record<string, unknown>;
          if (typeof delta.stop_reason === 'string') stopReason = delta.stop_reason;
          if (json.usage) req.onEvent({ type: 'done', usage: json.usage });
        }
      }
    }
    req.onEvent({ type: 'done', finishReason: stopReason });
  }
}

function toAnthropicTool(t: ToolDefinition) {
  return {
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  };
}

export function toAnthropicMessages(msgs: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of msgs) {
    if (m.role === 'system') continue; // system 由调用方单独注入
    if (m.role === 'tool') {
      // tool_result 需挂到上一条 user 消息上；这里按结构简化：合并为 user 消息内容
      const last = out[out.length - 1];
      if (last && last.role === 'user') {
        const content = last.content as unknown[];
        content.push({
          type: 'tool_result',
          tool_use_id: m.toolCallId,
          content: m.content ?? '',
        });
        continue;
      }
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content ?? '' }],
      });
      continue;
    }
    if (m.role === 'assistant') {
      const content: unknown[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: safeJSON(tc.arguments),
        });
      }
      out.push({ role: 'assistant', content });
      continue;
    }
    out.push({ role: m.role, content: m.content ?? '' });
  }
  return out;
}

function safeJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
