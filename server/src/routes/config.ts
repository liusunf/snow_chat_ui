/**
 * 配置路由：读取 / 保存统一配置，测试 Provider 连通性。
 */

import { Router } from 'express';
import type { AppConfig, ProviderConfig } from '../config.js';
import { loadConfig, saveConfig } from '../config.js';
import { createProvider } from '../providers/registry.js';

export const configRouter = Router();

configRouter.get('/', async (_req, res) => {
  try {
    const cfg = await loadConfig();
    // 隐藏敏感信息：apiKey 仅返回掩码
    const masked = {
      ...cfg,
      providers: cfg.providers.map((p) => ({
        ...p,
        apiKey: p.apiKey ? maskKey(p.apiKey) : '',
      })),
    };
    res.json(masked);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

configRouter.put('/', async (req, res) => {
  try {
    const incoming = req.body as AppConfig;
    if (!incoming || !Array.isArray(incoming.providers)) {
      res.status(400).json({ error: '配置格式不正确：缺少 providers 数组' });
      return;
    }
    const cfg: AppConfig = {
      ...(await loadConfig()),
      ...incoming,
      providers: incoming.providers,
      mcpServers: incoming.mcpServers ?? [],
      skills: incoming.skills ?? [],
      maxToolRounds: incoming.maxToolRounds ?? 8,
    };
    await saveConfig(cfg);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

configRouter.post('/test-provider', async (req, res) => {
  try {
    const pc = req.body as ProviderConfig;
    if (!pc?.type || !pc?.model) {
      res.status(400).json({ ok: false, message: '缺少 type / model' });
      return;
    }
    const provider = createProvider(pc);
    const result = await provider.test();
    res.json(result);
  } catch (e) {
    res.json({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
});

configRouter.post('/models', async (req, res) => {
  try {
    const pc = req.body as ProviderConfig;
    if (!pc?.type) {
      res.status(400).json({ ok: false, message: '缺少 type' });
      return;
    }
    const provider = createProvider(pc);
    const models = await provider.listModels();
    res.json({ ok: true, models });
  } catch (e) {
    res.json({ ok: false, message: e instanceof Error ? e.message : String(e) });
  }
});

function maskKey(key: string): string {
  if (key.length <= 8) return '*'.repeat(key.length);
  return `${key.slice(0, 4)}${'*'.repeat(Math.min(12, key.length - 8))}${key.slice(-4)}`;
}
