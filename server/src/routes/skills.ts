/**
 * 技能路由：列出全部可用技能（builtin + MCP 动态）。
 */

import { Router } from 'express';
import { loadConfig } from '../config.js';
import { BUILTIN_SKILLS, collectSkills } from '../skills/registry.js';

export const skillsRouter = Router();

skillsRouter.get('/', async (_req, res) => {
  try {
    const cfg = await loadConfig();
    const { skills, errors } = await collectSkills(cfg);
    res.json({
      builtins: BUILTIN_SKILLS.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        enabled: cfg.skills.some((sc) => sc.id === s.id && sc.enabled),
        parameters: s.parameters,
      })),
      active: skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        kind: s.kind,
        mcpServerId: s.mcpServerId,
      })),
      errors,
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});
