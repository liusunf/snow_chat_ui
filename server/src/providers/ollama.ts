/**
 * Ollama Provider：/api/chat 流式接口，支持 tools。
 */

import type { LLMProvider, ProviderRequest, ChatMessage, ToolDefinition } from './types.js';
import { baseUrlOrDefault, errText, parseJSONL, requestParams } from './types.js';
import type { ProviderConfig } from '../config.js';

const DEFAULT_BASE = 'http://localhost:11434';

export class OllamaProvider implements LLMProvider {
  readonly type = 'ollama';
  constructor(private cfg: ProviderConfig) {}

  private endpoint() {
    return `${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}/api/chat`;
  }

  async test() {
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.cfg.model, messages: [{ role: 'user', content: 'ping' }], stream: false }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true, message: `${this.cfg.name} (${this.cfg.model}) 连接成功` };
    } catch (e) {
      return { ok: false, message: `无法连接到 ${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}（Ollama 服务未启动或地址不对）` };
    }
  }

  async listModels(): Promise<string[]> {
    let res: Response;
    try {
      res = await fetch(`${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}/api/tags`, {
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      throw new Error(`无法连接到 ${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}（Ollama 服务未启动或地址不对）`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`模型列表获取失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return (json.models ?? []).map((m) => m.name);
  }

  async chat(req: ProviderRequest) {
    const p = requestParams(this.cfg);
    const body: Record<string, unknown> = {
      model: req.model || this.cfg.model,
      messages: toOllamaMessages(req.messages),
      stream: true,
      options: {
        temperature: req.temperature ?? p.temperature,
        num_predict: req.maxTokens ?? p.maxTokens,
      },
    };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.function.name, description: t.function.description, parameters: t.function.parameters },
      }));
    }

    const res = await fetch(this.endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama API ${res.status}: ${text.slice(0, 300)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let doneReason: string | undefined;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const json = parseJSONL(line);
        if (!json) continue;
        if (json.message) {
          const msg = json.message as Record<string, unknown>;
          if (typeof msg.content === 'string' && msg.content) {
            req.onEvent({ type: 'text-delta', delta: msg.content });
          }
          const tcs = (msg.tool_calls ?? []) as Array<Record<string, unknown>>;
          for (const tc of tcs) {
            const fn = (tc.function ?? {}) as Record<string, unknown>;
            if (fn.name) {
              req.onEvent({
                type: 'tool-call',
                call: {
                  id: `ollama_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  name: fn.name as string,
                  arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
                },
              });
            }
          }
        }
        if (json.done) {
          doneReason = (json.done_reason as string) ?? 'stop';
          if (json.eval_count != null) req.onEvent({ type: 'done', usage: json });
        }
      }
    }
    req.onEvent({ type: 'done', finishReason: doneReason });
  }
}

export function toOllamaMessages(msgs: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of msgs) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: m.content ?? '' });
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', content: m.content ?? '' });
    } else if (m.role === 'assistant') {
      const base: Record<string, unknown> = { role: 'assistant', content: m.content ?? '' };
      if (m.toolCalls?.length) {
        base.tool_calls = m.toolCalls.map((tc) => ({
          function: { name: tc.name, arguments: safeJSON(tc.arguments) },
        }));
      }
      out.push(base);
    } else {
      out.push({ role: m.role, content: m.content ?? '' });
    }
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
