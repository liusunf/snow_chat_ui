/**
 * Google Gemini Provider：streamGenerateContent 流式接口，支持 function calling。
 */

import type { LLMProvider, ProviderRequest, ChatMessage, ToolDefinition, ToolCall } from './types.js';
import { baseUrlOrDefault, errText, requestParams } from './types.js';
import type { ProviderConfig } from '../config.js';

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiProvider implements LLMProvider {
  readonly type = 'gemini';
  constructor(private cfg: ProviderConfig) {}

  private endpoint(stream: boolean) {
    const base = baseUrlOrDefault(this.cfg, DEFAULT_BASE);
    const key = this.cfg.apiKey ?? '';
    return `${base}/models/${encodeURIComponent(this.cfg.model)}:${stream ? 'streamGenerateContent' : 'generateContent'}?alt=sse&key=${encodeURIComponent(key)}`;
  }

  async test() {
    try {
      const res = await fetch(this.endpoint(false), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, message: `HTTP ${res.status}: ${body.slice(0, 200)}` };
      }
      return { ok: true, message: `${this.cfg.name} (${this.cfg.model}) 连接成功` };
    } catch (e) {
      return { ok: false, message: `无法连接到 ${baseUrlOrDefault(this.cfg, DEFAULT_BASE)}（网络不通）` };
    }
  }

  async listModels(): Promise<string[]> {
    const base = baseUrlOrDefault(this.cfg, DEFAULT_BASE);
    const key = this.cfg.apiKey ?? '';
    let res: Response;
    try {
      res = await fetch(`${base}/models?key=${encodeURIComponent(key)}`, {
        signal: AbortSignal.timeout(8000),
      });
    } catch (e) {
      throw new Error(`无法连接到 ${base}（网络不通）`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('API Key 无效或未填写（HTTP 401/403）');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`模型列表获取失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return (json.models ?? []).map((m) => m.name.replace(/^models\//, ''));
  }

  async chat(req: ProviderRequest) {
    const p = requestParams(this.cfg);
    const body: Record<string, unknown> = {
      contents: toGeminiContents(req.messages),
      generationConfig: {
        temperature: req.temperature ?? p.temperature,
        maxOutputTokens: req.maxTokens ?? p.maxTokens,
      },
    };
    if (req.tools?.length) {
      body.tools = [{ functionDeclarations: req.tools.map((t) => t.function) }];
    }

    const res = await fetch(this.endpoint(true), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
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
        const json = parseGemini(line.slice(5));
        if (!json) continue;
        const candidates = (json.candidates ?? []) as Array<Record<string, unknown>>;
        const cand = candidates[0];
        if (!cand) continue;
        if (typeof cand.finishReason === 'string') finishReason = cand.finishReason;
        const parts = ((cand.content ?? {}) as { parts?: unknown[] }).parts ?? [];
        for (const part of parts) {
          const pt = part as Record<string, unknown>;
          if (typeof pt.text === 'string' && pt.text) req.onEvent({ type: 'text-delta', delta: pt.text });
          const fc = pt.functionCall as Record<string, unknown> | undefined;
          if (fc && fc.name) {
            const args = typeof fc.args === 'string' ? fc.args : JSON.stringify(fc.args ?? {});
            req.onEvent({
              type: 'tool-call',
              call: {
                id: `gemini_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                name: fc.name as string,
                arguments: args,
              },
            });
          }
        }
      }
    }
    req.onEvent({ type: 'done', finishReason });
  }
}

function parseGemini(data: string): Record<string, unknown> | null {
  const t = data.trim().replace(/^\uFEFF/, '');
  if (!t) return null;
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toGeminiContents(msgs: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of msgs) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      // Gemini 的 functionResponse 挂在 user 消息里，与下一条用户消息合并
      const parts: unknown[] = [{ functionResponse: { name: 'fn', response: { result: m.content ?? '' } } }];
      const last = out[out.length - 1];
      if (last && (last.role === 'user' || last.role === 'model')) {
        // 追加到已有 user 消息
        const existing = (last.parts as unknown[]) ?? [];
        existing.push(...parts);
        out.push({ role: 'user', parts: existing.slice(0, 1) } as never);
        // Gemini 要求 functionResponse 独立成 user 消息
      }
      out.push({ role: 'user', parts });
      continue;
    }
    if (m.role === 'assistant') {
      const parts: unknown[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: safeJSON(tc.arguments) } });
      }
      out.push({ role: 'model', parts });
      continue;
    }
    out.push({ role: m.role === 'user' ? 'user' : m.role, parts: [{ text: m.content ?? '' }] });
  }
  // 修正顺序：Gemini 要求 model 与 user 交替；把连续 functionResponse 后强制补一条 user 占位避免错误
  return out;
}

function safeJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// 供类型检查使用（保持 ToolCall 引用，避免未使用告警）
export type { ToolCall };
