/** App：三栏布局（会话 / 聊天 / 配置）+ 全端响应式 + 配置与会话管理 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { AppConfig, ChatMessage, Conversation } from './types';
import { ChatView } from './components/ChatView';
import { Sidebar } from './components/Sidebar';
import { SettingsPage } from './components/SettingsPage';

const LS_KEY = 'chatui-workbench-conversations-v1';

type View = 'chat' | 'conversations' | 'settings';

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Conversation[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persistConversations(list: Conversation[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [view, setView] = useState<View>('chat');
  const [online, setOnline] = useState(false);
  const [skillCount, setSkillCount] = useState(0);
  const bootRef = useRef(false);

  /* 启动加载 */
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    (async () => {
      try {
        const cfg = await api.getConfig();
        setConfig(cfg);
      } catch {
        /* 服务未启动时保留空配置提示 */
      }
      try {
        const h = await api.health();
        setOnline(Boolean(h.ok));
        if (Array.isArray(h.skills)) setSkillCount(h.skills.length);
      } catch {
        setOnline(false);
      }
      try {
        const s = await api.getSkills();
        setSkillCount(s.active.length);
      } catch {
        /* noop */
      }
    })();
  }, []);

  /* 自动创建首个会话 */
  useEffect(() => {
    if (conversations.length === 0) {
      const c = makeConversation(config?.activeProviderId ?? '');
      setConversations([c]);
      setActiveConvId(c.id);
    } else if (!activeConvId) {
      setActiveConvId(conversations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length === 0]);

  const makeConversation = (providerId: string): Conversation => ({
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    providerId: providerId || config?.activeProviderId || '',
    messages: [],
  });

  const newConversation = useCallback(() => {
    const c = makeConversation(config?.activeProviderId ?? '');
    setConversations((prev) => {
      const next = [c, ...prev];
      persistConversations(next);
      return next;
    });
    setActiveConvId(c.id);
    setView('chat');
  }, [config]);

  const selectConversation = useCallback((id: string) => {
    setActiveConvId(id);
    setView('chat');
  }, []);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        persistConversations(next);
        return next;
      });
      if (activeConvId === id) {
        const rest = conversations.filter((c) => c.id !== id);
        setActiveConvId(rest[0]?.id ?? '');
      }
    },
    [activeConvId, conversations],
  );

  const updateConversationMessages = useCallback((msgs: ChatMessage[]) => {
    setConversations((prev) => {
      const next = prev.map((c) => {
        if (c.id !== activeConvId) return c;
        const firstUser = msgs.find((m) => m.role === 'user');
        const title =
          c.title !== '新对话'
            ? c.title
            : firstUser?.content
              ? firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '…' : '')
              : '新对话';
        return { ...c, messages: msgs, title, updatedAt: Date.now() };
      });
      persistConversations(next);
      return next;
    });
  }, [activeConvId]);

  const activeConv = useMemo(() => conversations.find((c) => c.id === activeConvId) ?? conversations[0], [conversations, activeConvId]);

  const activeProvider = useMemo(() => {
    if (!config) return undefined;
    const p =
      config.providers.find((x) => x.id === activeConv?.providerId) ??
      config.providers.find((x) => x.id === config.activeProviderId) ??
      config.providers.find((x) => x.enabled);
    return p;
  }, [config, activeConv]);

  const saveConfig = useCallback(async (draft: AppConfig) => {
    await api.saveConfig(draft);
    setConfig(draft);
    try {
      const h = await api.health();
      setOnline(Boolean(h.ok));
      if (Array.isArray(h.skills)) setSkillCount(h.skills.length);
    } catch {
      /* noop */
    }
    try {
      const s = await api.getSkills();
      setSkillCount(s.active.length);
    } catch {
      /* noop */
    }
  }, []);

  const openMobileConversations = useCallback(() => {
    if (window.innerWidth <= 900) setView('conversations');
    else setView(view === 'conversations' ? 'chat' : 'conversations');
  }, [view]);

  const openMobileSettings = useCallback(() => {
    if (window.innerWidth <= 900) setView('settings');
    else setView(view === 'settings' ? 'chat' : 'settings');
  }, [view]);

  const providerName = activeProvider?.name ?? (config ? '未配置' : '连接中…');
  const modelLabel = activeProvider?.model ?? '';

  if (!config) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-2)', fontSize: 14, flexDirection: 'column', gap: 12 }}>
        <span className="spinner" style={{ width: 20, height: 20 }} />
        <div>正在连接服务端（http://localhost:8787）…</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          请先运行 <code>npm run dev</code> 启动前后端
        </div>
      </div>
    );
  }

  const viewClass = view === 'conversations' ? 'view-conversations' : 'view-chat';

  if (view === 'settings') {
    return (
      <div className="app view-settings">
        <SettingsPage config={config} onSave={saveConfig} onBack={() => setView('chat')} />
      </div>
    );
  }

  return (
    <div className={`app ${viewClass}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeConv?.id ?? ''}
        online={online}
        providerName={providerName}
        skillCount={skillCount}
        onSelect={selectConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        onOpenSettings={() => setView('settings')}
      />
      {activeConv ? (
        <ChatView
          conversation={activeConv}
          providerName={providerName}
          modelLabel={modelLabel}
          onMessagesChange={updateConversationMessages}
          onOpenConversations={openMobileConversations}
          onOpenSettings={openMobileSettings}
        />
      ) : (
        <div className="chat-main">
          <div className="empty-welcome">
            <div className="w-icon">💬</div>
            <div className="w-title">暂无会话</div>
            <button className="btn btn-primary" onClick={newConversation}>
              新建对话
            </button>
          </div>
        </div>
      )}

      {/* 移动端底部导航 */}
      <nav className="mobile-nav">
        <button className={view === 'conversations' ? 'active' : ''} onClick={() => setView(view === 'conversations' ? 'chat' : 'conversations')}>
          <span className="mi">💬</span>
          会话
        </button>
        <button className={view === 'chat' ? 'active' : ''} onClick={() => setView('chat')}>
          <span className="mi">✏️</span>
          聊天
        </button>
        <button onClick={() => setView('settings')}>
          <span className="mi">⚙️</span>
          配置
        </button>
      </nav>
    </div>
  );
}
