/** 基于 @lobehub/icons 的供应商品牌图标组件（MIT，官方品牌 SVG）
 *  只导入各品牌的 Mono 组件（纯 SVG，仅依赖 react），避免引入 @lobehub/ui/antd 依赖链
 */
import type { ComponentType, CSSProperties } from 'react';
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono';
import Anthropic from '@lobehub/icons/es/Anthropic/components/Mono';
import Gemini from '@lobehub/icons/es/Gemini/components/Mono';
import Ollama from '@lobehub/icons/es/Ollama/components/Mono';
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono';
import Moonshot from '@lobehub/icons/es/Moonshot/components/Mono';
import Qwen from '@lobehub/icons/es/Qwen/components/Mono';
import Groq from '@lobehub/icons/es/Groq/components/Mono';
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Mono';
import Zhipu from '@lobehub/icons/es/Zhipu/components/Mono';
import Vllm from '@lobehub/icons/es/Vllm/components/Mono';

type BrandIcon = ComponentType<{ size?: number | string; style?: CSSProperties }>;

/** 供应商名称 → 品牌图标（小写匹配） */
const NAME_ICON: Record<string, BrandIcon> = {
  openai: OpenAI,
  deepseek: DeepSeek,
  'moonshot kimi': Moonshot,
  kimi: Moonshot,
  '智谱 glm': Zhipu,
  通义千问: Qwen,
  groq: Groq,
  openrouter: OpenRouter,
  '本地 vllm': Vllm,
  'anthropic claude': Anthropic,
  'google gemini': Gemini,
  'ollama 本地': Ollama,
  ollama: Ollama,
};

/** Provider 类型兜底图标 */
const TYPE_ICON: Record<string, BrandIcon> = {
  openai: OpenAI,
  anthropic: Anthropic,
  gemini: Gemini,
  ollama: Ollama,
};

export function resolveProviderKey(name: string, type: string): boolean {
  return Boolean(NAME_ICON[name.toLowerCase()] ?? TYPE_ICON[type]);
}

export interface ProviderBrandProps {
  name: string;
  type: string;
  size?: number | string;
  /** 图标着色（默认继承 currentColor） */
  color?: string;
  style?: CSSProperties;
}

/** 渲染供应商品牌图标（mono，currentColor 着色）；未命中映射返回 null（调用方自行 fallback） */
export function ProviderBrand({ name, type, size = 16, color, style }: ProviderBrandProps) {
  const Icon = NAME_ICON[name.toLowerCase()] ?? TYPE_ICON[type];
  if (!Icon) return null;
  return <Icon size={size} style={{ ...style, color: color ?? style?.color ?? 'currentColor' }} />;
}
