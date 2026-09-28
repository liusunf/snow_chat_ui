/** 常见 LLM 供应商预设模板（添加 Provider 时一键填充） */

import type { ProviderConfig, ProviderType } from '../types';

export interface ProviderPreset {
  type: ProviderType;
  name: string;
  baseURL?: string;
  model: string;
  /** 提示信息 */
  hint?: string;
  /** 品牌色（用于供应商图标色块） */
  color: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { type: 'openai', name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini', hint: '官方 OpenAI', color: '#10A37F' },
  { type: 'openai', name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '高性价比中文模型', color: '#4D6BFE' },
  { type: 'openai', name: 'Moonshot Kimi', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', hint: '月之暗面 Kimi', color: '#222222' },
  { type: 'openai', name: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', hint: '智谱 AI', color: '#4852FF' },
  { type: 'openai', name: '通义千问', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', hint: '阿里云百炼', color: '#615CED' },
  { type: 'openai', name: 'Groq', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', hint: '超快推理', color: '#F55036' },
  { type: 'openai', name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', hint: '聚合多厂商', color: '#7B61FF' },
  { type: 'openai', name: '本地 vLLM', baseURL: 'http://localhost:8000/v1', model: 'your-model-name', hint: '本地推理服务', color: '#E88B2B' },
  { type: 'anthropic', name: 'Anthropic Claude', baseURL: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-latest', hint: '官方 Claude', color: '#D97757' },
  { type: 'gemini', name: 'Google Gemini', baseURL: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', hint: '官方 Gemini', color: '#4285F4' },
  { type: 'ollama', name: 'Ollama 本地', baseURL: 'http://localhost:11434', model: 'llama3.1', hint: '本地模型', color: '#9AC4E8' },
];

/** OpenAI 兼容 Provider 拉取失败时的离线候选模型（可手动选择） */
export const FALLBACK_OPENAI_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'deepseek-chat',
  'deepseek-reasoner',
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'glm-4-flash',
  'glm-4-plus',
  'qwen-plus',
  'qwen-max',
  'llama-3.3-70b-versatile',
  'openai/gpt-4o-mini',
];

export function presetToProvider(preset: ProviderPreset, idx: number): ProviderConfig {
  return {
    id: `p_${Date.now()}_${idx}`,
    type: preset.type,
    name: preset.name,
    baseURL: preset.baseURL ?? '',
    apiKey: '',
    model: preset.model,
    models: [],
    temperature: 0.7,
    maxTokens: 4096,
    enabled: true,
  };
}
