/**
 * Skill 系统：
 * - builtin：内置函数型技能（可安全执行）
 * - mcp：绑定 MCP Server，将其全部工具暴露为技能
 * 统一对外提供：工具定义（供 LLM function calling）+ 执行器。
 */

import type { AppConfig, SkillConfig, McpServerConfig } from '../config.js';
import { listMcpTools, callMcpTool } from '../mcp/client.js';
import type { ToolDefinition } from '../providers/types.js';

export interface SkillContext {
  cfg: AppConfig;
}

export type SkillHandler = (args: Record<string, unknown>, ctx: SkillContext) => unknown | Promise<unknown>;

export interface Skill {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  kind: 'builtin' | 'mcp';
  mcpServerId?: string;
  handler?: SkillHandler;
}

/* ---------------- 内置技能 ---------------- */

function getCurrentTimeHandler(_args: Record<string, unknown>): unknown {
  const now = new Date();
  return {
    iso: now.toISOString(),
    local: now.toString(),
    unix: Math.floor(now.getTime() / 1000),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

/** 安全计算器：只允许数字、四则运算、括号、小数点 */
function safeCalc(expr: string): number {
  const cleaned = expr.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().%]+$/.test(cleaned)) {
    throw new Error('表达式包含不支持的字符');
  }
  // 通过 Function 构造，但输入已被白名单过滤
  const fn = new Function(`"use strict"; return (${cleaned});`) as () => number;
  const result = fn();
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('计算结果非法');
  }
  return Math.round(result * 1e10) / 1e10;
}

function calculatorHandler(args: Record<string, unknown>): unknown {
  const expr = String(args.expression ?? '');
  if (!expr) throw new Error('缺少 expression 参数');
  return { expression: expr, result: safeCalc(expr) };
}

/** 天气查询：open-meteo（免费、无需 key） */
async function getWeatherHandler(args: Record<string, unknown>): Promise<unknown> {
  const lat = Number(args.latitude ?? args.lat ?? NaN);
  const lon = Number(args.longitude ?? args.lon ?? NaN);
  if (Number.isNaN(lat) || Number.isNaN(lon)) throw new Error('缺少有效的 latitude / longitude');
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`天气服务返回 HTTP ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  return data.current ?? data;
}

/** 网页抓取：提取正文文本 */
async function fetchUrlHandler(args: Record<string, unknown>): Promise<unknown> {
  const url = String(args.url ?? '');
  if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 链接');
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': 'Mozilla/5.0 (ChatUI-Workbench/1.0)' },
  });
  if (!res.ok) throw new Error(`抓取失败 HTTP ${res.status}`);
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('json')) return await res.json();
  const text = await res.text();
  // 去除脚本/样式标签，压缩空白
  const cleaned = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title: extractTitle(text), text: cleaned.slice(0, 20000), length: cleaned.length };
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim().slice(0, 200) : '';
}

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'get_current_time',
    name: '获取当前时间',
    description: '获取当前日期、时间与时区信息。当用户询问现在几点、今天几号、当前时间时使用。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
    kind: 'builtin',
    handler: getCurrentTimeHandler,
  },
  {
    id: 'calculator',
    name: '计算器',
    description:
      '执行精确的四则运算。参数 expression 为数学表达式（支持 + - * / ( ) . %）。当用户需要数值计算时使用。',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '数学表达式，如 (12.5*6+3)/2' },
      },
      required: ['expression'],
    },
    kind: 'builtin',
    handler: calculatorHandler,
  },
  {
    id: 'get_weather',
    name: '天气查询',
    description: '根据经纬度查询某地实时天气（温度、湿度、体感、风速）。当用户询问某城市/地点天气时先调用本工具。',
    parameters: {
      type: 'object',
      properties: {
        latitude: { type: 'number', description: '纬度，如 39.9042' },
        longitude: { type: 'number', description: '经度，如 116.4074' },
      },
      required: ['latitude', 'longitude'],
    },
    kind: 'builtin',
    handler: getWeatherHandler,
  },
  {
    id: 'fetch_url',
    name: '网页抓取',
    description: '抓取并返回一个 http/https 网页的正文文本或 JSON 内容。当用户要求读取某个网页/链接时使用。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要抓取的完整 URL' },
      },
      required: ['url'],
    },
    kind: 'builtin',
    handler: fetchUrlHandler,
  },
];

/* ---------------- 注册与解析 ---------------- */

/** 组装当前生效的可用技能（builtin 按配置启用；mcp 动态发现工具） */
export async function collectSkills(
  cfg: AppConfig,
): Promise<{ skills: Skill[]; errors: string[] }> {
  const skills: Skill[] = [];
  const errors: string[] = [];

  for (const sc of cfg.skills) {
    if (!sc.enabled) continue;
    if (sc.type === 'builtin') {
      const builtin = BUILTIN_SKILLS.find((b) => b.id === sc.id);
      if (builtin) skills.push(builtin);
      continue;
    }
    if (sc.type === 'mcp' && sc.mcpServerId) {
      const serverCfg = cfg.mcpServers.find((m) => m.id === sc.mcpServerId && m.enabled);
      if (!serverCfg) {
        errors.push(`技能「${sc.name}」绑定的 MCP Server 未启用或不存在`);
        continue;
      }
      try {
        const tools = await listMcpTools(serverCfg);
        for (const t of tools) {
          skills.push({
            id: t.fullName,
            name: t.name,
            description: t.description ?? `MCP 工具 ${t.name}（来自 ${serverCfg.name}）`,
            parameters: t.inputSchema as Record<string, unknown>,
            kind: 'mcp',
            mcpServerId: serverCfg.id,
          });
        }
      } catch (e) {
        errors.push(`技能「${sc.name}」MCP 连接失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { skills, errors };
}

/** 把技能列表转换为 LLM 工具定义 */
export function skillsToTools(skills: Skill[]): ToolDefinition[] {
  return skills.map((s) => ({
    type: 'function',
    function: {
      name: s.id,
      description: s.description,
      parameters: s.parameters as Record<string, unknown>,
    },
  }));
}

/** 根据工具名查找技能 */
export function findSkill(skills: Skill[], toolName: string): Skill | undefined {
  return skills.find((s) => s.id === toolName);
}

/** 执行技能 */
export async function runSkill(skill: Skill, args: Record<string, unknown>, cfg: AppConfig): Promise<unknown> {
  if (skill.kind === 'builtin') {
    if (!skill.handler) throw new Error(`技能 ${skill.id} 没有处理器`);
    return await skill.handler(args, { cfg });
  }
  if (skill.kind === 'mcp' && skill.mcpServerId) {
    const serverCfg: McpServerConfig | undefined = cfg.mcpServers.find(
      (m) => m.id === skill.mcpServerId && m.enabled,
    );
    if (!serverCfg) throw new Error(`技能 ${skill.id} 绑定的 MCP Server 不可用`);
    // fullName: mcp__<serverId>__<toolName>
    const toolName = skill.id.split('__').slice(2).join('__') || skill.id;
    return await callMcpTool(serverCfg, toolName, args);
  }
  throw new Error(`未知技能类型: ${skill.id}`);
}

/** 根据配置中的 SkillConfig 判断某技能是否启用（供 API 展示） */
export function isSkillEnabled(cfg: AppConfig, skillId: string): boolean {
  return cfg.skills.some((s) => s.id === skillId && s.enabled);
}
