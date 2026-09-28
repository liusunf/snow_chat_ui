/**
 * Provider 注册表：根据配置创建对应 Provider 实例。
 */

import type { ProviderConfig } from '../config.js';
import type { LLMProvider } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { GeminiProvider } from './gemini.js';
import { OllamaProvider } from './ollama.js';

export function createProvider(cfg: ProviderConfig): LLMProvider {
  switch (cfg.type) {
    case 'openai':
      return new OpenAIProvider(cfg);
    case 'anthropic':
      return new AnthropicProvider(cfg);
    case 'gemini':
      return new GeminiProvider(cfg);
    case 'ollama':
      return new OllamaProvider(cfg);
    default:
      throw new Error(`不支持的 Provider 类型: ${(cfg as { type?: string }).type}`);
  }
}

export function resolveProvider(providers: ProviderConfig[], id?: string): { provider: LLMProvider; cfg: ProviderConfig } {
  const cfg = providers.find((p) => p.id === id) ?? providers.find((p) => p.enabled) ?? providers[0];
  if (!cfg) throw new Error('未配置任何 LLM Provider，请先在配置面板中添加');
  if (!cfg.enabled) {
    // 允许显式指定未启用的 provider，但提示
    if (cfg.id !== id) throw new Error(`Provider "${cfg.name}" 未启用`);
  }
  return { provider: createProvider(cfg), cfg };
}

export { OpenAIProvider, AnthropicProvider, GeminiProvider, OllamaProvider };
