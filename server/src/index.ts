/**
 * snow_chat_ui — 服务端入口
 * 提供：统一 LLM Provider 配置 / MCP / Skill / SSE 聊天接口 + 前端静态托管
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, setConfigPath } from './config.js';
import { configRouter } from './routes/config.js';
import { mcpRouter } from './routes/mcp.js';
import { chatRouter } from './routes/chat.js';
import { skillsRouter } from './routes/skills.js';
import { closeAll } from './mcp/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

// 配置文件路径（支持环境变量覆盖，便于部署）
setConfigPath(process.env.CONFIG_PATH || path.join(__dirname, '..', 'data', 'config.json'));

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api/config', configRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/chat', chatRouter);

app.get('/api/health', async (_req, res) => {
  try {
    const cfg = await loadConfig();
    res.json({
      ok: true,
      providers: cfg.providers.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled })),
      activeProviderId: cfg.activeProviderId,
      mcpServers: cfg.mcpServers.map((m) => ({ id: m.id, name: m.name, enabled: m.enabled })),
      skills: cfg.skills.filter((s) => s.enabled).map((s) => s.name),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

// 生产模式：托管前端构建产物
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

app.listen(PORT, HOST, async () => {
  try {
    const cfg = await loadConfig();
    console.log(`[snow_chat_ui] server 已启动: http://localhost:${PORT}`);
    console.log(`[snow_chat_ui] 可用 Provider: ${cfg.providers.filter((p) => p.enabled).map((p) => p.name).join(', ') || '无（请在配置面板添加）'}`);
    console.log(`[snow_chat_ui] 已启用技能: ${cfg.skills.filter((s) => s.enabled).map((s) => s.name).join(', ') || '无'}`);
    console.log(`[snow_chat_ui] MCP Server: ${cfg.mcpServers.filter((m) => m.enabled).map((m) => m.name).join(', ') || '无'}`);
  } catch (e) {
    console.error('[snow_chat_ui] 配置加载失败:', e);
  }
});

process.on('SIGINT', async () => {
  await closeAll();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeAll();
  process.exit(0);
});
