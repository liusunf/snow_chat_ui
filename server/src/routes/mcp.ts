/**
 * MCP 路由：测试连接、刷新会话、查看可用工具。
 */

import { Router } from 'express';
import type { McpServerConfig } from '../config.js';
import { loadConfig } from '../config.js';
import { listMcpTools, refreshMcpServer, testMcpServer } from '../mcp/client.js';

export const mcpRouter = Router();

mcpRouter.post('/test', async (req, res) => {
  try {
    const sc = req.body as McpServerConfig;
    if (!sc?.transport) {
      res.status(400).json({ ok: false, message: '缺少 transport' });
      return;
    }
    const result = await testMcpServer(sc);
    res.json(result);
  } catch (e) {
    res.json({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
});

mcpRouter.post('/refresh', async (req, res) => {
  try {
    const { id } = req.body as { id?: string };
    const cfg = await loadConfig();
    if (!id) {
      res.status(400).json({ ok: false, message: '缺少 id' });
      return;
    }
    const sc = cfg.mcpServers.find((m) => m.id === id);
    if (!sc) {
      res.status(404).json({ ok: false, message: `未找到 MCP Server: ${id}` });
      return;
    }
    await refreshMcpServer(sc);
    res.json({ ok: true, message: '已重新连接' });
  } catch (e) {
    res.json({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
});

mcpRouter.get('/tools', async (_req, res) => {
  try {
    const cfg = await loadConfig();
    const out: Array<{ serverId: string; serverName: string; tools: Array<{ name: string; description?: string }> }> =
      [];
    for (const sc of cfg.mcpServers) {
      if (!sc.enabled) continue;
      try {
        const tools = await listMcpTools(sc);
        out.push({
          serverId: sc.id,
          serverName: sc.name,
          tools: tools.map((t) => ({ name: t.fullName, description: t.description })),
        });
      } catch (e) {
        out.push({
          serverId: sc.id,
          serverName: sc.name,
          tools: [],
        });
      }
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});
