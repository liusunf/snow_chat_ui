/**
 * SettingsPage：独立「设置中心」页面（对齐 LobeChat / Dify 形态）
 * - 分域导航：模型服务 / 工具连接 / 技能 / 高级与数据
 * - 模型服务：LLM Provider 卡片（预设模板 / 拉模型+白名单 / 测试 / 高级参数）
 * - 工具连接：MCP Server（stdio / SSE / HTTP）+ 暴露为技能
 * - 技能：内置技能开关 + MCP 绑定
 * - 高级与数据：系统提示词 / 工具轮数 / 配置导入导出
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiBase, setApiBase } from '../api';
import type { AppConfig, McpServerConfig, ProviderConfig, ProviderType } from '../types';
import { BUILTIN_SKILL_DEFS } from './builtinSkills';
import { FALLBACK_OPENAI_MODELS, PROVIDER_PRESETS, presetToProvider, type ProviderPreset } from './providerPresets';
import { ProviderBrand, resolveProviderKey } from './ProviderBrand';
import { ModelSelect } from './ModelSelect';

interface Props {
  config: AppConfig;
  onSave: (cfg: AppConfig) => Promise<void>;
  onBack: () => void;
}

type Tab = 'providers' | 'mcp' | 'skills' | 'advanced';

const TAB_DEFS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'providers', label: '模型服务', icon: '🧠' },
  { id: 'mcp', label: '工具连接', icon: '🔌' },
  { id: 'skills', label: '技能', icon: '🎯' },
  { id: 'advanced', label: '高级与数据', icon: '⚙️' },
];

const EMPTY_PROVIDER: ProviderConfig = {
  id: `p_${Date.now()}`,
  type: 'openai',
  name: '自定义 Provider',
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  models: [],
  temperature: 0.7,
  maxTokens: 4096,
  enabled: true,
};

const EMPTY_MCP: McpServerConfig = {
  id: `mcp_${Date.now()}`,
  name: '新 MCP Server',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-everything'],
  env: {},
  url: '',
  enabled: true,
};

const TYPE_BADGE: Record<ProviderType, string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama',
};

const TYPE_COLOR: Record<ProviderType, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  gemini: '#4285F4',
  ollama: '#9AC4E8',
};

export function SettingsPage({ config, onSave, onBack }: Props) {
  const [draft, setDraft] = useState<AppConfig>(config);
  const [tab, setTab] = useState<Tab>('providers');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testMcpId, setTestMcpId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [fetchingModels, setFetchingModels] = useState<string | null>(null);
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [apiBase, setApiBaseState] = useState<string>(getApiBase());
  const importRef = useRef<HTMLInputElement | null>(null);

  const handleApiBaseChange = (v: string) => {
    setApiBaseState(v);
    setApiBase(v);
  };

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (text: string, error?: boolean) => setToast({ text, error });

  const patch = (p: Partial<AppConfig>) => setDraft((d) => ({ ...d, ...p }));

  const counts = useMemo(
    () => ({
      providers: draft.providers.filter((p) => p.enabled).length,
      mcp: draft.mcpServers.filter((m) => m.enabled).length,
      skills: draft.skills.filter((s) => s.enabled).length,
      advanced: 0,
    }),
    [draft],
  );

  /* ---------- Provider ---------- */

  const updateProvider = (id: string, p: Partial<ProviderConfig>) =>
    setDraft((d) => ({
      ...d,
      providers: d.providers.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));

  const addProvider = (preset?: ProviderPreset) => {
    const base = preset ? presetToProvider(preset, Date.now() % 1000) : { ...EMPTY_PROVIDER, id: `p_${Date.now()}` };
    setDraft((d) => ({ ...d, providers: [...d.providers, base] }));
    setPickerOpen(false);
    setSearchTerm('');
    showToast(`已添加「${base.name}」，填入 API Key 后保存`);
  };

  const removeProvider = (id: string) => {
    setDraft((d) => {
      const providers = d.providers.filter((x) => x.id !== id);
      return {
        ...d,
        providers,
        activeProviderId: d.activeProviderId === id ? (providers.find((x) => x.enabled)?.id ?? providers[0]?.id ?? '') : d.activeProviderId,
      };
    });
    setFetchedModels((m) => {
      const next = { ...m };
      delete next[id];
      return next;
    });
  };

  const testProvider = async (id: string) => {
    const pc = draft.providers.find((x) => x.id === id);
    if (!pc) return;
    setTesting(id);
    try {
      const r = await api.testProvider(pc);
      showToast(r.message, !r.ok);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setTesting(null);
    }
  };

  const fetchModels = async (id: string) => {
    const pc = draft.providers.find((x) => x.id === id);
    if (!pc) return;
    setFetchingModels(id);
    try {
      const r = await api.fetchModels(pc);
      if (r.ok && Array.isArray(r.models) && r.models.length) {
        setFetchedModels((m) => ({ ...m, [id]: r.models! }));
        if (!pc.model || !r.models.includes(pc.model)) {
          updateProvider(id, { model: r.models[0] });
        }
        showToast(`获取到 ${r.models.length} 个模型，勾选即白名单`);
      } else if (pc.type !== 'ollama') {
        const fallback =
          pc.type === 'openai'
            ? FALLBACK_OPENAI_MODELS
            : pc.type === 'anthropic'
              ? ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-3-haiku-latest']
              : ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'];
        setFetchedModels((m) => ({ ...m, [id]: fallback }));
        showToast(`在线拉取失败（${r.message ?? '未知原因'}），已提供常见模型候选`, true);
      } else {
        showToast(r.message ?? '未获取到模型', true);
      }
    } catch (e) {
      if (pc.type !== 'ollama') {
        const fallback =
          pc.type === 'openai'
            ? FALLBACK_OPENAI_MODELS
            : pc.type === 'anthropic'
              ? ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-3-haiku-latest']
              : ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'];
        setFetchedModels((m) => ({ ...m, [id]: fallback }));
        showToast(`在线拉取失败（${e instanceof Error ? e.message : String(e)}），已提供常见模型候选`, true);
      } else {
        showToast(e instanceof Error ? e.message : String(e), true);
      }
    } finally {
      setFetchingModels(null);
    }
  };

  const toggleModelAllow = (id: string, model: string, checked: boolean) => {
    const pc = draft.providers.find((x) => x.id === id);
    const cur = pc?.models ?? [];
    const next = checked ? [...cur, model] : cur.filter((m) => m !== model);
    updateProvider(id, { models: next });
  };

  /* ---------- MCP ---------- */

  const updateMcp = (id: string, m: Partial<McpServerConfig>) =>
    setDraft((d) => ({
      ...d,
      mcpServers: d.mcpServers.map((x) => (x.id === id ? { ...x, ...m } : x)),
    }));

  const addMcp = () => {
    const m: McpServerConfig = { ...EMPTY_MCP, id: `mcp_${Date.now()}` };
    setDraft((d) => ({ ...d, mcpServers: [...d.mcpServers, m] }));
  };

  const removeMcp = (id: string) => {
    setDraft((d) => ({
      ...d,
      mcpServers: d.mcpServers.filter((x) => x.id !== id),
      skills: d.skills.filter((s) => s.mcpServerId !== id),
    }));
  };

  const testMcp = async (id: string) => {
    const sc = draft.mcpServers.find((x) => x.id === id);
    if (!sc) return;
    setTestMcpId(id);
    try {
      const r = await api.testMcp(sc);
      showToast(r.message, !r.ok);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setTestMcpId(null);
    }
  };

  /* ---------- Skill ---------- */

  const toggleSkill = (id: string, enabled: boolean) =>
    setDraft((d) => ({
      ...d,
      skills: d.skills.map((s) => (s.id === id ? { ...s, enabled } : s)),
    }));

  const toggleMcpAsSkill = (mcpId: string, enabled: boolean) =>
    setDraft((d) => {
      const existing = d.skills.find((s) => s.type === 'mcp' && s.mcpServerId === mcpId);
      if (existing) {
        return { ...d, skills: d.skills.map((s) => (s.id === existing.id ? { ...s, enabled } : s)) };
      }
      const server = d.mcpServers.find((m) => m.id === mcpId);
      return {
        ...d,
        skills: [
          ...d.skills,
          {
            id: `mcp__${mcpId}`,
            name: `MCP: ${server?.name ?? mcpId}`,
            description: `调用 ${server?.name ?? mcpId} 的全部 MCP 工具`,
            type: 'mcp' as const,
            mcpServerId: mcpId,
            enabled,
          },
        ],
      };
    });

  /* ---------- 导入 / 导出 ---------- */

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatui-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('配置已导出（含 API Key，请妥善保管）');
  };

  const importConfig = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppConfig>;
      if (!Array.isArray(parsed.providers)) throw new Error('缺少 providers 数组');
      const merged: AppConfig = {
        ...draft,
        ...parsed,
        providers: parsed.providers,
        mcpServers: parsed.mcpServers ?? [],
        skills: parsed.skills ?? [],
        maxToolRounds: parsed.maxToolRounds ?? 8,
      };
      setDraft(merged);
      showToast('已载入导入配置，请点击「保存配置」生效');
    } catch (e) {
      showToast(`导入失败：${e instanceof Error ? e.message : String(e)}`, true);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      showToast('配置已保存 ✓');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <button className="icon-btn" onClick={onBack} title="返回聊天">
          ←
        </button>
        <h2 className="settings-title">设置中心</h2>
        <div className="settings-topbar-right">
          <button className="btn btn-ghost btn-sm" onClick={() => window.open('/api-docs.html', '_blank', 'noopener')} title="后端接口对接文档">
            📖 接口文档
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportConfig}>
            导出
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => importRef.current?.click()}>
            导入
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importConfig(f);
              e.target.value = '';
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存配置'}
          </button>
        </div>
      </header>

      <div className="settings-body">
        <nav className="settings-nav">
          {TAB_DEFS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="sn-icon">{t.icon}</span>
              <span>{t.label}</span>
              {counts[t.id] > 0 && <span className="sn-badge">{counts[t.id]}</span>}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          {tab === 'providers' && (
            <section className="config-section">
              <h3>
                LLM Provider <span className="badge">{counts.providers} 启用</span>
              </h3>
              {draft.providers.map((p) => {
                const models = fetchedModels[p.id] ?? [];
                const allowModels = p.models?.length ? p.models : models;
                return (
                  <div key={p.id} className={`card ${draft.activeProviderId === p.id ? 'active' : ''}`}>
                    <div className="card-head">
                      <span
                        className="radio-dot"
                        title={draft.activeProviderId === p.id ? '当前默认 Provider' : '设为默认 Provider'}
                        onClick={() => patch({ activeProviderId: p.id })}
                        style={draft.activeProviderId === p.id ? { background: TYPE_COLOR[p.type], borderColor: TYPE_COLOR[p.type] } : undefined}
                      />
                      <span
                        className="type-badge"
                        style={{ background: `${TYPE_COLOR[p.type]}18`, color: TYPE_COLOR[p.type], border: `1px solid ${TYPE_COLOR[p.type]}38` }}
                      >
                        <ProviderBrand name={p.name} type={p.type} size={13} />
                        <span>{TYPE_BADGE[p.type]}</span>
                      </span>
                      <span className="name">{p.name}</span>
                      {draft.activeProviderId === p.id && <span className="def-tag">默认</span>}
                      <span className="actions">
                        <button onClick={() => fetchModels(p.id)} disabled={fetchingModels === p.id} title="拉取模型列表">
                          {fetchingModels === p.id ? '拉取中…' : '拉模型'}
                        </button>
                        <button onClick={() => testProvider(p.id)} disabled={testing === p.id}>
                          {testing === p.id ? '测试中…' : '测试'}
                        </button>
                        <button onClick={() => removeProvider(p.id)} className="danger">
                          删除
                        </button>
                      </span>
                    </div>
                    <div className="field">
                      <label>类型</label>
                      <select value={p.type} onChange={(e) => updateProvider(p.id, { type: e.target.value as ProviderType })}>
                        {(Object.keys(TYPE_BADGE) as ProviderType[]).map((t) => (
                          <option key={t} value={t}>
                            {TYPE_BADGE[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>名称</label>
                      <input value={p.name} onChange={(e) => updateProvider(p.id, { name: e.target.value })} />
                    </div>
                    {p.type !== 'ollama' && (
                      <div className="field">
                        <label>API Key</label>
                        <input
                          type="password"
                          value={p.apiKey ?? ''}
                          placeholder={p.apiKey ? '已保存（留空保持不变）' : 'sk-...'}
                          onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    )}
                    <div className="field">
                      <label>{p.type === 'anthropic' ? 'API 地址（可留空用官方）' : 'Base URL'}</label>
                      <input
                        value={p.baseURL ?? ''}
                        placeholder={
                          p.type === 'openai'
                            ? 'https://api.openai.com/v1'
                            : p.type === 'anthropic'
                              ? 'https://api.anthropic.com'
                              : p.type === 'gemini'
                                ? 'https://generativelanguage.googleapis.com/v1beta'
                                : 'http://localhost:11434'
                        }
                        onChange={(e) => updateProvider(p.id, { baseURL: e.target.value })}
                      />
                      <div className="hint">OpenAI 兼容地址指向 …/v1；支持 DeepSeek / Moonshot / 通义 / vLLM 等</div>
                    </div>
                    <div className="field">
                      <label>模型</label>
                      <ModelSelect
                        models={allowModels}
                        value={p.model}
                        onChange={(v) => updateProvider(p.id, { model: v })}
                        brandName={p.name}
                        brandType={p.type}
                        placeholder={
                          p.type === 'ollama'
                            ? 'llama3.1'
                            : p.type === 'anthropic'
                              ? 'claude-3-5-sonnet-latest'
                              : p.type === 'gemini'
                                ? 'gemini-2.0-flash'
                                : 'gpt-4o-mini'
                        }
                      />
                    </div>

                    {models.length > 0 && (
                      <div className="field">
                        <label>模型白名单（勾选后仅显示这些模型；不勾选 = 全部）</label>
                        <div
                          style={{
                            maxHeight: 150,
                            overflowY: 'auto',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: 6,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}
                        >
                          {models.slice(0, 60).map((m) => (
                            <label
                              key={m}
                              title={m}
                              style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, cursor: 'pointer' }}
                            >
                              <input
                                type="checkbox"
                                style={{ marginTop: 1, flexShrink: 0, width: 'auto', height: 'auto' }}
                                checked={(p.models ?? []).includes(m)}
                                onChange={(e) => toggleModelAllow(p.id, m, e.target.checked)}
                              />
                              <span style={{ flex: 1, wordBreak: 'break-all', lineHeight: 1.4, minWidth: 0 }}>{m}</span>
                            </label>
                          ))}
                          {models.length > 60 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>仅展示前 60 个</div>}
                        </div>
                      </div>
                    )}

                    <details
                      style={{ marginTop: 4 }}
                      open={advancedOpen[p.id]}
                      onToggle={(e) => setAdvancedOpen((s) => ({ ...s, [p.id]: (e.target as HTMLDetailsElement).open }))}
                    >
                      <summary style={{ fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                        高级参数（Temperature / Max Tokens）
                      </summary>
                      <div style={{ marginTop: 6 }}>
                        <div className="field-row">
                          <div className="field">
                            <label>Temperature</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="2"
                              value={p.temperature ?? 0.7}
                              onChange={(e) => updateProvider(p.id, { temperature: Number(e.target.value) })}
                            />
                          </div>
                          <div className="field">
                            <label>Max Tokens</label>
                            <input
                              type="number"
                              step="256"
                              min="256"
                              value={p.maxTokens ?? 4096}
                              onChange={(e) => updateProvider(p.id, { maxTokens: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                      </div>
                    </details>

                    <div className="switch-row">
                      <span>启用</span>
                      <label className="switch">
                        <input type="checkbox" checked={p.enabled} onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })} />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>
                );
              })}

              <button className="btn btn-primary btn-block" onClick={() => setPickerOpen(true)}>
                ＋ 添加 Provider
              </button>
              {pickerOpen && (
                <div className="picker-mask" onClick={() => setPickerOpen(false)}>
                  <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="picker-head">
                      <span className="picker-title">选择供应商</span>
                      <button className="icon-btn" onClick={() => setPickerOpen(false)} title="关闭">
                        ✕
                      </button>
                    </div>
                    <input
                      className="picker-search"
                      autoFocus
                      placeholder="搜索供应商…（OpenAI / DeepSeek / Kimi / Claude…）"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <div className="picker-grid">
                      {PROVIDER_PRESETS.filter((ps) => ps.name.toLowerCase().includes(searchTerm.toLowerCase())).map((ps) => (
                        <button className="picker-item" key={ps.name} onClick={() => addProvider(ps)}>
                          <span
                            className={resolveProviderKey(ps.name, ps.type) ? 'picker-avatar brand' : 'picker-avatar'}
                            style={
                              resolveProviderKey(ps.name, ps.type)
                                ? undefined
                                : { background: `linear-gradient(135deg, ${ps.color}, ${ps.color}cc)` }
                            }
                          >
                            {resolveProviderKey(ps.name, ps.type) ? (
                              <ProviderBrand name={ps.name} type={ps.type} size={20} color={ps.color} />
                            ) : (
                              ps.name.slice(0, 1)
                            )}
                          </span>
                          <span className="picker-body">
                            <span className="picker-name">{ps.name}</span>
                            <span className="picker-hint">{ps.hint}</span>
                          </span>
                        </button>
                      ))}
                      <button className="picker-item" onClick={() => addProvider()}>
                        <span className="picker-avatar" style={{ background: 'linear-gradient(135deg,#8a8f98,#6b7280)' }}>
                          ＋
                        </span>
                        <span className="picker-body">
                          <span className="picker-name">空白自定义</span>
                          <span className="picker-hint">手动配置任意 OpenAI 兼容端点</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === 'mcp' && (
            <section className="config-section">
              <h3>
                MCP Server <span className="badge">{counts.mcp} 启用</span>
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>
                Model Context Protocol：接入外部工具服务（stdio 进程 / SSE / HTTP）。
              </p>
              {draft.mcpServers.map((m) => (
                <div key={m.id} className="card">
                  <div className="card-head">
                    <span className="name">{m.name}</span>
                    <span className="actions">
                      <button onClick={() => testMcp(m.id)} disabled={testMcpId === m.id}>
                        {testMcpId === m.id ? '连接中…' : '测试'}
                      </button>
                      <button onClick={() => removeMcp(m.id)} className="danger">
                        删除
                      </button>
                    </span>
                  </div>
                  <div className="field">
                    <label>名称</label>
                    <input value={m.name} onChange={(e) => updateMcp(m.id, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>传输方式</label>
                    <select
                      value={m.transport}
                      onChange={(e) => updateMcp(m.id, { transport: e.target.value as McpServerConfig['transport'] })}
                    >
                      <option value="stdio">stdio（本地进程）</option>
                      <option value="sse">SSE（服务端）</option>
                      <option value="http">HTTP/Streamable（服务端）</option>
                    </select>
                  </div>
                  {m.transport === 'stdio' ? (
                    <>
                      <div className="field">
                        <label>命令</label>
                        <input value={m.command ?? ''} onChange={(e) => updateMcp(m.id, { command: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>参数（逗号分隔）</label>
                        <input
                          value={(m.args ?? []).join(', ')}
                          onChange={(e) =>
                            updateMcp(m.id, {
                              args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          placeholder="例如: -y, @modelcontextprotocol/server-everything"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="field">
                      <label>服务地址</label>
                      <input
                        value={m.url ?? ''}
                        onChange={(e) => updateMcp(m.id, { url: e.target.value })}
                        placeholder="https://mcp.example.com/sse"
                      />
                    </div>
                  )}
                  <div className="switch-row">
                    <span>
                      启用
                      <div className="desc">启用后工具作为 Skill 注入对话</div>
                    </span>
                    <label className="switch">
                      <input type="checkbox" checked={m.enabled} onChange={(e) => updateMcp(m.id, { enabled: e.target.checked })} />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="switch-row">
                    <span>暴露为技能</span>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={draft.skills.some((s) => s.type === 'mcp' && s.mcpServerId === m.id && s.enabled)}
                        onChange={(e) => toggleMcpAsSkill(m.id, e.target.checked)}
                      />
                      <span className="slider" />
                    </label>
                  </div>
                </div>
              ))}
              <button className="btn btn-ghost btn-block" onClick={addMcp}>
                ＋ 添加 MCP Server
              </button>
            </section>
          )}

          {tab === 'skills' && (
            <section className="config-section">
              <h3>
                Skill 技能 <span className="badge">{counts.skills} 启用</span>
              </h3>
              {BUILTIN_SKILL_DEFS.map((s) => {
                const enabled = draft.skills.some((x) => x.id === s.id && x.enabled);
                return (
                  <div key={s.id} className="switch-row">
                    <span>
                      {s.name}
                      <div className="desc">{s.description}</div>
                    </span>
                    <label className="switch">
                      <input type="checkbox" checked={enabled} onChange={(e) => toggleSkill(s.id, e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>
                );
              })}
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
                MCP 工具通过「工具连接」页的「暴露为技能」开关注入，此处统一显示启用状态。
              </div>
            </section>
          )}

          {tab === 'advanced' && (
            <section className="config-section">
              <h3>系统提示词</h3>
              <div className="field">
                <textarea rows={5} value={draft.systemPrompt ?? ''} onChange={(e) => patch({ systemPrompt: e.target.value })} />
                <div className="hint">注入到每次对话的系统消息中，技能列表会自动追加。</div>
              </div>
              <h3 style={{ marginTop: 18 }}>工具循环</h3>
              <div className="field">
                <label>最大工具循环轮数</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.maxToolRounds ?? 8}
                  onChange={(e) => patch({ maxToolRounds: Number(e.target.value) })}
                />
              </div>
              <h3 style={{ marginTop: 18 }}>后端服务</h3>
              <div className="field">
                <label>后端 API 地址</label>
                <input
                  type="text"
                  value={apiBase}
                  onChange={(e) => handleApiBaseChange(e.target.value)}
                  placeholder="留空 = 同源部署（当前站点 /api）"
                  spellCheck={false}
                />
                <div className="hint">
                  前端独立部署时填写后端完整地址（如 http://192.168.1.10:8787），全部 API 请求将指向该服务；留空则请求当前站点 /api/*。修改后立即生效，并保存于本机。
                </div>
              </div>
              <h3 style={{ marginTop: 18 }}>数据管理</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={exportConfig}>
                  ⬇ 导出配置 JSON
                </button>
                <button className="btn btn-ghost" onClick={() => importRef.current?.click()}>
                  ⬆ 导入配置 JSON
                </button>
                <button className="btn btn-ghost" onClick={() => window.open('/api-docs.html', '_blank', 'noopener')}>
                  📖 接口对接文档
                </button>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                导出包含 API Key，请妥善保管；导入后需点击「保存配置」生效。
              </div>
            </section>
          )}
        </div>
      </div>

      {toast && (
        <div className="settings-toast">
          <span className={`msg-toast ${toast.error ? 'error' : ''}`}>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
