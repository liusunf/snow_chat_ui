/**
 * MCP (Model Context Protocol) 客户端管理：
 * 管理多个 MCP Server 的连接、工具发现与工具调用。
 * 支持 stdio / sse / http(streamable) 三种传输。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServerConfig } from '../config.js';

export interface McpTool {
  /** 全局唯一工具名：mcp__<serverId>__<toolName> */
  fullName: string;
  serverId: string;
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface Session {
  client: Client;
  tools: McpTool[];
  connecting: boolean;
}

const sessions = new Map<string, Session>();

function buildTransport(cfg: McpServerConfig) {
  switch (cfg.transport) {
    case 'stdio': {
      let command = cfg.command || 'npx';
      // Windows 上 npx 实际是 npx.cmd
      if (process.platform === 'win32' && command === 'npx' && !command.endsWith('.cmd')) {
        command = 'npx.cmd';
      }
      return new StdioClientTransport({
        command,
        args: cfg.args ?? [],
        env: { ...(process.env as Record<string, string>), ...(cfg.env ?? {}) },
        stderr: 'pipe',
      });
    }
    case 'sse': {
      if (!cfg.url) throw new Error(`MCP Server "${cfg.name}" 未配置 url`);
      return new SSEClientTransport(new URL(cfg.url));
    }
    case 'http': {
      if (!cfg.url) throw new Error(`MCP Server "${cfg.name}" 未配置 url`);
      return new StreamableHTTPClientTransport(new URL(cfg.url));
    }
    default:
      throw new Error(`不支持的 MCP 传输类型: ${cfg.transport}`);
  }
}

async function ensureSession(cfg: McpServerConfig): Promise<Session> {
  const existing = sessions.get(cfg.id);
  if (existing && !existing.connecting) {
    return existing;
  }
  if (existing?.connecting) {
    // 等待正在建立的连接
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (sessions.get(cfg.id) && !sessions.get(cfg.id)!.connecting) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
    return sessions.get(cfg.id)!;
  }

  const client = new Client({ name: 'chatui-workbench', version: '1.0.0' });
  const transport = buildTransport(cfg);
  const session: Session = { client, tools: [], connecting: true };
  sessions.set(cfg.id, session);

  try {
    await client.connect(transport);
    session.connecting = false;
    return session;
  } catch (e) {
    sessions.delete(cfg.id);
    try {
      await client.close();
    } catch {
      /* noop */
    }
    throw e;
  }
}

/** 列出某 MCP Server 的所有工具（带缓存） */
export async function listMcpTools(cfg: McpServerConfig): Promise<McpTool[]> {
  const session = await ensureSession(cfg);
  if (session.tools.length > 0) return session.tools;

  const result = await session.client.listTools();
  session.tools = (result.tools ?? []).map((t) => ({
    fullName: `mcp__${cfg.id}__${t.name}`,
    serverId: cfg.id,
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
  }));
  return session.tools;
}

/** 调用 MCP 工具 */
export async function callMcpTool(
  cfg: McpServerConfig,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const session = await ensureSession(cfg);
  const result = await session.client.callTool({ name: toolName, arguments: args });
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((c) => (c as { text?: string }).text ?? JSON.stringify(c)).join('\n')
      : String(result.content);
    throw new Error(`MCP 工具 ${toolName} 执行失败: ${text}`);
  }
  return result.content;
}

/** 测试 MCP 连接（尝试连接并列出工具） */
export async function testMcpServer(cfg: McpServerConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const tools = await listMcpTools(cfg);
    return { ok: true, message: `连接成功，发现 ${tools.length} 个工具` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** 刷新（重连）某 MCP Server */
export async function refreshMcpServer(cfg: McpServerConfig): Promise<void> {
  const old = sessions.get(cfg.id);
  if (old) {
    sessions.delete(cfg.id);
    try {
      await old.client.close();
    } catch {
      /* noop */
    }
  }
  await ensureSession(cfg);
}

/** 关闭所有 MCP 会话（进程退出时） */
export async function closeAll(): Promise<void> {
  for (const [id, s] of sessions) {
    sessions.delete(id);
    try {
      await s.client.close();
    } catch {
      /* noop */
    }
  }
}
