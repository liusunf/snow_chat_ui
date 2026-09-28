/**
 * Agent 编排：一次对话请求的处理循环。
 * 流程：组装工具 → 调 LLM → 若返回工具调用则执行 skill/MCP → 回填上下文 → 继续，
 * 直到 LLM 给出最终回答或无工具调用。
 */

import type { AppConfig } from '../config.js';
import type { ChatMessage, ToolCall } from '../providers/types.js';
import { createProvider } from '../providers/registry.js';
import { collectSkills, findSkill, runSkill, skillsToTools } from '../skills/registry.js';

export interface AgentEvent {
  type:
    | 'text-delta'
    | 'tool-start'
    | 'tool-result'
    | 'done'
    | 'error'
    | 'info';
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: string;
  result?: unknown;
  error?: string;
  usage?: unknown;
}

export interface AgentRequest {
  messages: ChatMessage[];
  providerId?: string;
  model?: string;
}

export interface AgentOptions {
  cfg: AppConfig;
  emit: (ev: AgentEvent) => void;
  signal?: AbortSignal;
}

export async function runAgent(req: AgentRequest, opts: AgentOptions): Promise<void> {
  const { cfg, emit, signal } = opts;

  // 1. Provider
  const providerCfg = cfg.providers.find((p) => p.id === req.providerId) ?? cfg.providers.find((p) => p.id === cfg.activeProviderId) ?? cfg.providers.find((p) => p.enabled);
  if (!providerCfg) {
    emit({ type: 'error', error: '未配置可用的 LLM Provider，请先在右侧配置面板中添加并启用' });
    return;
  }
  if (providerCfg.enabled === false && providerCfg.id !== req.providerId) {
    emit({ type: 'error', error: `Provider「${providerCfg.name}」未启用` });
    return;
  }
  const provider = createProvider(providerCfg);

  // 2. 技能收集
  const { skills, errors } = await collectSkills(cfg);
  for (const e of errors) emit({ type: 'info', text: e });
  const tools = skillsToTools(skills);
  emit({ type: 'info', text: `已加载 ${skills.length} 个技能（${tools.length} 个工具）` });

  // 3. System Prompt
  const skillDesc =
    skills.length > 0
      ? '\n\n可用的技能：\n' +
        skills
          .map((s) => `- ${s.id}：${s.description}`)
          .join('\n') +
        '\n需要时调用对应技能获取真实信息，工具结果返回后基于结果回答用户。'
      : '\n\n当前未启用任何技能。';

  const systemPrompt = (cfg.systemPrompt || '你是一个通用 AI 助手。') + skillDesc;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...req.messages.filter((m) => m.role !== 'system'),
  ];

  // 4. Agent Loop
  const maxRounds = Math.max(1, cfg.maxToolRounds || 8);
  let round = 0;

  try {
    for (;;) {
      if (signal?.aborted) throw new Error('请求已被中断');
      round++;
      if (round > maxRounds) {
        emit({ type: 'info', text: `已达到最大工具轮数（${maxRounds}），停止循环` });
        break;
      }

      const toolCallsThisRound: ToolCall[] = [];

      await provider.chat({
        model: req.model || providerCfg.model,
        messages,
        tools: tools.length ? tools : undefined,
        temperature: providerCfg.temperature,
        maxTokens: providerCfg.maxTokens,
        signal,
        onEvent: (ev) => {
          switch (ev.type) {
            case 'text-delta':
              emit({ type: 'text-delta', text: ev.delta });
              break;
            case 'tool-call':
              toolCallsThisRound.push(ev.call);
              break;
            case 'done':
              if (ev.usage) emit({ type: 'done', usage: ev.usage });
              break;
            case 'error':
              emit({ type: 'error', error: ev.message });
              break;
          }
        },
      });

      if (toolCallsThisRound.length === 0) {
        emit({ type: 'done', usage: undefined });
        return;
      }

      // 累积 assistant 消息（含工具调用）
      messages.push({
        role: 'assistant',
        content: '',
        toolCalls: toolCallsThisRound,
      });

      // 执行每个工具调用
      for (const tc of toolCallsThisRound) {
        emit({ type: 'tool-start', toolName: tc.name, toolCallId: tc.id, args: tc.arguments });
        const skill = findSkill(skills, tc.name);
        if (!skill) {
          const msg = `工具 ${tc.name} 不存在或未启用`;
          emit({ type: 'tool-result', toolName: tc.name, toolCallId: tc.id, error: msg });
          messages.push({ role: 'tool', toolCallId: tc.id, content: `错误：${msg}` });
          continue;
        }

        let argsObj: Record<string, unknown> = {};
        try {
          argsObj = tc.arguments ? JSON.parse(tc.arguments) : {};
        } catch {
          argsObj = { raw: tc.arguments };
        }

        try {
          const result = await runSkill(skill, argsObj, cfg);
          const summary = summarizeResult(result);
          emit({ type: 'tool-result', toolName: tc.name, toolCallId: tc.id, result: summary });
          messages.push({ role: 'tool', toolCallId: tc.id, content: JSON.stringify(summary) });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          emit({ type: 'tool-result', toolName: tc.name, toolCallId: tc.id, error: msg });
          messages.push({ role: 'tool', toolCallId: tc.id, content: `执行失败：${msg}` });
        }
      }
    }

    emit({ type: 'done', usage: undefined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (signal?.aborted) {
      emit({ type: 'error', error: '请求已被中断' });
    } else {
      emit({ type: 'error', error: msg });
    }
  }
}

/** 将工具结果压缩为给 LLM 的文本摘要 */
function summarizeResult(result: unknown): unknown {
  const s = JSON.stringify(result);
  if (!s) return result;
  if (s.length <= 12000) return result;
  // 截断并提示
  const truncated = s.slice(0, 12000);
  try {
    return JSON.parse(truncated + '"...(已截断，超出部分省略)"'.slice(1));
  } catch {
    return `${s.slice(0, 12000)}...(已截断)`;
  }
}
