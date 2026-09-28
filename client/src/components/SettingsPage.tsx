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
import { useI18n } from '../i18n';
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

const EMPTY_PROVIDER: ProviderConfig = {
  id: `p_${Date.now()}`,
  type: 'openai',
  name: '',
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
  name: '',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-everything'],
  env: {},
  url: '',
  enabled: true,
};

const TYPE_COLOR: Record<ProviderType, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  gemini: '#4285F4',
  ollama: '#9AC4E8',
};

export function SettingsPage({ config, onSave, onBack }: Props) {
  const { t, lang, setLang } = useI18n();
  const TAB_DEFS: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'providers', label: t('settings.tabProviders'), icon: '🧠' },
    { id: 'mcp', label: t('settings.tabMcp'), icon: '🔌' },
    { id: 'skills', label: t('settings.tabSkills'), icon: '🎯' },
    { id: 'advanced', label: t('settings.tabAdvanced'), icon: '⚙️' },
  ];
  const TYPE_BADGE: Record<ProviderType, string> = {
    openai: t('settings.typeOpenai'),
    anthropic: 'Claude',
    gemini: 'Gemini',
    ollama: 'Ollama',
  };
  const SKILL_NAME: Record<string, string> = {
    get_current_time: t('skill.time.name'),
    calculator: t('skill.calc.name'),
    get_weather: t('skill.weather.name'),
    fetch_url: t('skill.fetch.name'),
  };
  const SKILL_DESC: Record<string, string> = {
    get_current_time: t('skill.time.desc'),
    calculator: t('skill.calc.desc'),
    get_weather: t('skill.weather.desc'),
    fetch_url: t('skill.fetch.desc'),
  };
  const PRESET_HINT: Record<string, string> = {
    'OpenAI': t('preset.openai'),
    'DeepSeek': t('preset.deepseek'),
    'Moonshot Kimi': t('preset.kimi'),
    '智谱 GLM': t('preset.glm'),
    '通义千问': t('preset.qwen'),
    'Groq': t('preset.groq'),
    'OpenRouter': t('preset.openrouter'),
    '本地 vLLM': t('preset.vllm'),
    'Anthropic Claude': t('preset.claude'),
    'Google Gemini': t('preset.gemini'),
    'Ollama 本地': t('preset.ollama'),
  };
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
    if (!base.name) base.name = t('settings.customProviderName');
    setDraft((d) => ({ ...d, providers: [...d.providers, base] }));
    setPickerOpen(false);
    setSearchTerm('');
    showToast(t('settings.toastAdded', [base.name]));
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
        showToast(t('settings.toastFetched', [r.models.length]));
      } else if (pc.type !== 'ollama') {
        const fallback =
          pc.type === 'openai'
            ? FALLBACK_OPENAI_MODELS
            : pc.type === 'anthropic'
              ? ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest', 'claude-3-haiku-latest']
              : ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'];
        setFetchedModels((m) => ({ ...m, [id]: fallback }));
        showToast(t('settings.toastFetchFail', [r.message ?? t('settings.toastNoModels')]), true);
      } else {
        showToast(r.message ?? t('settings.toastNoModels'), true);
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
        showToast(t('settings.toastFetchFail', [e instanceof Error ? e.message : String(e)]), true);
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
    const m: McpServerConfig = { ...EMPTY_MCP, id: `mcp_${Date.now()}`, name: t('settings.newMcpName') };
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
            description: t('settings.mcpSkillDesc', [server?.name ?? mcpId]),
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
    showToast(t('settings.toastExported'));
  };

  const importConfig = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AppConfig>;
      if (!Array.isArray(parsed.providers)) throw new Error(t('settings.missingProviders'));
      const merged: AppConfig = {
        ...draft,
        ...parsed,
        providers: parsed.providers,
        mcpServers: parsed.mcpServers ?? [],
        skills: parsed.skills ?? [],
        maxToolRounds: parsed.maxToolRounds ?? 8,
      };
      setDraft(merged);
      showToast(t('settings.toastImported'));
    } catch (e) {
      showToast(t('settings.toastImportFail', [e instanceof Error ? e.message : String(e)]), true);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      showToast(t('settings.toastSaved'));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <button className="icon-btn" onClick={onBack} title={t('settings.back')}>
          ←
        </button>
        <h2 className="settings-title">{t('settings.title')}</h2>
        <div className="settings-topbar-right">
          <button
            className="btn btn-ghost btn-sm lang-btn"
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            title={t('common.langTitle')}
            style={{ fontWeight: 600 }}
          >
            🌐 {t('common.langBtn')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => window.open('/api-docs.html', '_blank', 'noopener')} title={t('settings.apiDocsTitle')}>
            {t('settings.apiDocs')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={exportConfig}>
            {t('settings.export')}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => importRef.current?.click()}>
            {t('settings.import')}
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
            {saving ? t('settings.saving') : t('settings.save')}
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
                LLM Provider <span className="badge">{t('settings.enabled', [counts.providers])}</span>
              </h3>
              {draft.providers.map((p) => {
                const models = fetchedModels[p.id] ?? [];
                const allowModels = p.models?.length ? p.models : models;
                return (
                  <div key={p.id} className={`card ${draft.activeProviderId === p.id ? 'active' : ''}`}>
                    <div className="card-head">
                      <span
                        className="radio-dot"
                        title={draft.activeProviderId === p.id ? t('settings.defaultProviderTitle') : t('settings.setDefaultTitle')}
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
                      {draft.activeProviderId === p.id && <span className="def-tag">{t('settings.defaultTag')}</span>}
                      <span className="actions">
                        <button onClick={() => fetchModels(p.id)} disabled={fetchingModels === p.id} title={t('settings.fetchModels')}>
                          {fetchingModels === p.id ? t('settings.fetching') : t('settings.fetchModels')}
                        </button>
                        <button onClick={() => testProvider(p.id)} disabled={testing === p.id}>
                          {testing === p.id ? t('settings.testing') : t('settings.test')}
                        </button>
                        <button onClick={() => removeProvider(p.id)} className="danger">
                          {t('settings.delete')}
                        </button>
                      </span>
                    </div>
                    <div className="field">
                      <label>{t('settings.type')}</label>
                      <select value={p.type} onChange={(e) => updateProvider(p.id, { type: e.target.value as ProviderType })}>
                        {(Object.keys(TYPE_BADGE) as ProviderType[]).map((t) => (
                          <option key={t} value={t}>
                            {TYPE_BADGE[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>{t('settings.name')}</label>
                      <input value={p.name} onChange={(e) => updateProvider(p.id, { name: e.target.value })} />
                    </div>
                    {p.type !== 'ollama' && (
                      <div className="field">
                        <label>{t('settings.apiKey')}</label>
                        <input
                          type="password"
                          value={p.apiKey ?? ''}
                          placeholder={p.apiKey ? t('settings.apiKeySaved') : 'sk-...'}
                          onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                          autoComplete="off"
                        />
                      </div>
                    )}
                    <div className="field">
                      <label>{p.type === 'anthropic' ? t('settings.baseUrlAnthropic') : t('settings.baseUrl')}</label>
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
                      <div className="hint">{t('settings.baseUrlHint')}</div>
                    </div>
                    <div className="field">
                      <label>{t('settings.model')}</label>
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
                        <label>{t('settings.whitelistLabel')}</label>
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
                          {models.length > 60 && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('settings.showFirst60')}</div>}
                        </div>
                      </div>
                    )}

                    <details
                      style={{ marginTop: 4 }}
                      open={advancedOpen[p.id]}
                      onToggle={(e) => setAdvancedOpen((s) => ({ ...s, [p.id]: (e.target as HTMLDetailsElement).open }))}
                    >
                      <summary style={{ fontSize: 12, color: 'var(--text-2)', cursor: 'pointer', userSelect: 'none' }}>
                        {t('settings.advancedParams')}
                      </summary>                      <div style={{ marginTop: 6 }}>
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
                      <span>{t('settings.enable')}</span>
                      <label className="switch">
                        <input type="checkbox" checked={p.enabled} onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })} />
                        <span className="slider" />
                      </label>
                    </div>
                  </div>
                );
              })}

              <button className="btn btn-primary btn-block" onClick={() => setPickerOpen(true)}>
                {t('settings.addProvider')}
              </button>
              {pickerOpen && (
                <div className="picker-mask" onClick={() => setPickerOpen(false)}>
                  <div className="picker-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="picker-head">
                      <span className="picker-title">{t('settings.pickerTitle')}</span>
                      <button className="icon-btn" onClick={() => setPickerOpen(false)} title={t('settings.close')}>
                        ✕
                      </button>
                    </div>
                    <input
                      className="picker-search"
                      autoFocus
                      placeholder={t('settings.searchProvider')}
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
                            <span className="picker-hint">{PRESET_HINT[ps.name] ?? ps.hint}</span>
                          </span>
                        </button>
                      ))}
                      <button className="picker-item" onClick={() => addProvider()}>
                        <span className="picker-avatar" style={{ background: 'linear-gradient(135deg,#8a8f98,#6b7280)' }}>
                          ＋
                        </span>
                        <span className="picker-body">
                          <span className="picker-name">{t('settings.custom')}</span>
                          <span className="picker-hint">{t('settings.customHint')}</span>
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
                MCP Server <span className="badge">{t('settings.enabled', [counts.mcp])}</span>
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 8px' }}>
                {t('settings.mcpDesc')}
              </p>
              {draft.mcpServers.map((m) => (
                <div key={m.id} className="card">
                  <div className="card-head">
                    <span className="name">{m.name}</span>
                    <span className="actions">
                      <button onClick={() => testMcp(m.id)} disabled={testMcpId === m.id}>
                        {testMcpId === m.id ? t('settings.connecting') : t('settings.test')}
                      </button>
                      <button onClick={() => removeMcp(m.id)} className="danger">
                        {t('settings.delete')}
                      </button>
                    </span>
                  </div>
                  <div className="field">
                    <label>{t('settings.name')}</label>
                    <input value={m.name} onChange={(e) => updateMcp(m.id, { name: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>{t('settings.mcpTransport')}</label>
                    <select
                      value={m.transport}
                      onChange={(e) => updateMcp(m.id, { transport: e.target.value as McpServerConfig['transport'] })}
                    >
                      <option value="stdio">{t('settings.mcpStdio')}</option>
                      <option value="sse">{t('settings.mcpSse')}</option>
                      <option value="http">{t('settings.mcpHttp')}</option>
                    </select>
                  </div>
                  {m.transport === 'stdio' ? (
                    <>
                      <div className="field">
                        <label>{t('settings.mcpCommand')}</label>
                        <input value={m.command ?? ''} onChange={(e) => updateMcp(m.id, { command: e.target.value })} />
                      </div>
                      <div className="field">
                        <label>{t('settings.mcpArgs')}</label>
                        <input
                          value={(m.args ?? []).join(', ')}
                          onChange={(e) =>
                            updateMcp(m.id, {
                              args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          placeholder={t('settings.mcpArgsPlaceholder')}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="field">
                      <label>{t('settings.mcpUrl')}</label>
                      <input
                        value={m.url ?? ''}
                        onChange={(e) => updateMcp(m.id, { url: e.target.value })}
                        placeholder="https://mcp.example.com/sse"
                      />
                    </div>
                  )}
                  <div className="switch-row">
                    <span>
                      {t('settings.enable')}
                      <div className="desc">{t('settings.mcpEnabledDesc')}</div>
                    </span>
                    <label className="switch">
                      <input type="checkbox" checked={m.enabled} onChange={(e) => updateMcp(m.id, { enabled: e.target.checked })} />
                      <span className="slider" />
                    </label>
                  </div>
                  <div className="switch-row">
                    <span>{t('settings.mcpExpose')}</span>
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
                {t('settings.addMcp')}
              </button>
            </section>
          )}

          {tab === 'skills' && (
            <section className="config-section">
              <h3>
                {t('settings.tabSkills')} <span className="badge">{t('settings.enabled', [counts.skills])}</span>
              </h3>
              {BUILTIN_SKILL_DEFS.map((s) => {
                const enabled = draft.skills.some((x) => x.id === s.id && x.enabled);
                return (
                  <div key={s.id} className="switch-row">
                    <span>
                      {SKILL_NAME[s.id] ?? s.name}
                      <div className="desc">{SKILL_DESC[s.id] ?? s.description}</div>
                    </span>
                    <label className="switch">
                      <input type="checkbox" checked={enabled} onChange={(e) => toggleSkill(s.id, e.target.checked)} />
                      <span className="slider" />
                    </label>
                  </div>
                );
              })}
              <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
                {t('settings.mcpInjectedHint')}
              </div>
            </section>
          )}

          {tab === 'advanced' && (
            <section className="config-section">
              <h3>{t('settings.systemPrompt')}</h3>
              <div className="field">
                <textarea rows={5} value={draft.systemPrompt ?? ''} onChange={(e) => patch({ systemPrompt: e.target.value })} />
                <div className="hint">{t('settings.systemPromptHint')}</div>
              </div>
              <h3 style={{ marginTop: 18 }}>{t('settings.toolLoop')}</h3>
              <div className="field">
                <label>{t('settings.maxToolRounds')}</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={draft.maxToolRounds ?? 8}
                  onChange={(e) => patch({ maxToolRounds: Number(e.target.value) })}
                />
              </div>
              <h3 style={{ marginTop: 18 }}>{t('settings.backendService')}</h3>
              <div className="field">
                <label>{t('settings.backendApi')}</label>
                <input
                  type="text"
                  value={apiBase}
                  onChange={(e) => handleApiBaseChange(e.target.value)}
                  placeholder={t('settings.backendPlaceholder')}
                  spellCheck={false}
                />
                <div className="hint">
                  {t('settings.backendHint')}
                </div>
              </div>
              <h3 style={{ marginTop: 18 }}>{t('settings.dataMgmt')}</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" onClick={exportConfig}>
                  {t('settings.exportJson')}
                </button>
                <button className="btn btn-ghost" onClick={() => importRef.current?.click()}>
                  {t('settings.importJson')}
                </button>
                <button className="btn btn-ghost" onClick={() => window.open('/api-docs.html', '_blank', 'noopener')}>
                  {t('settings.docsBtn')}
                </button>
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {t('settings.dataHint')}
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
