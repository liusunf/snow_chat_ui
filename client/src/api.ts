/** 前端 API 客户端 */

import type { AppConfig, ProviderConfig, SkillsResponse, TestResult, McpServerConfig } from './types';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getConfig: () => http<AppConfig>('/api/config'),

  saveConfig: (cfg: AppConfig) =>
    http<{ ok: boolean; error?: string }>('/api/config', { method: 'PUT', body: JSON.stringify(cfg) }),

  testProvider: (pc: ProviderConfig) =>
    http<TestResult>('/api/config/test-provider', { method: 'POST', body: JSON.stringify(pc) }),

  fetchModels: (pc: ProviderConfig) =>
    http<{ ok: boolean; models?: string[]; message?: string }>('/api/config/models', {
      method: 'POST',
      body: JSON.stringify(pc),
    }),

  testMcp: (sc: McpServerConfig) =>
    http<TestResult>('/api/mcp/test', { method: 'POST', body: JSON.stringify(sc) }),

  refreshMcp: (id: string) =>
    http<{ ok: boolean; message?: string }>('/api/mcp/refresh', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),

  getSkills: () => http<SkillsResponse>('/api/skills'),

  health: () => http<{ ok: boolean; [k: string]: unknown }>('/api/health'),
};

/** SSE 聊天流解析：POST 请求 + ReadableStream 读取 */
export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onToolStart: (data: { name: string; id: string; args?: string }) => void;
  onToolResult: (data: { name: string; id: string; result?: unknown; error?: string }) => void;
  onInfo: (text: string) => void;
  onDone: (usage?: unknown) => void;
  onError: (message: string) => void;
}

export async function streamChat(
  body: { messages: unknown[]; providerId?: string; model?: string },
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`请求失败 HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split(/\r?\n\r?\n/);
    buf = parts.pop() ?? '';

    for (const part of parts) {
      const lines = part.split(/\r?\n/);
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        else if (line.startsWith(':')) continue;
      }
      if (dataLines.length === 0) continue;
      const data = JSON.parse(dataLines.join('\n'));

      switch (event) {
        case 'delta':
          cb.onDelta(data.text ?? '');
          break;
        case 'tool_start':
          cb.onToolStart(data);
          break;
        case 'tool_result':
          cb.onToolResult(data);
          break;
        case 'info':
          cb.onInfo(data.text ?? '');
          break;
        case 'done':
          cb.onDone(data.usage);
          break;
        case 'error':
          cb.onError(data.message ?? '未知错误');
          break;
      }
    }
  }
}
