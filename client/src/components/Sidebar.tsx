/** Sidebar：会话列表 + 新建/切换/删除 + 连接状态 */

import type { Conversation } from '../types';
import { useI18n } from '../i18n';

interface Props {
  conversations: Conversation[];
  activeId: string;
  online: boolean;
  providerName: string;
  skillCount: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ conversations, activeId, online, providerName, skillCount, onSelect, onNew, onDelete, onOpenSettings }: Props) {
  const { t } = useI18n();
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-dot">AI</span>
          <span>{t('common.workbench')}</span>
        </div>
        <button className="new-chat-btn" onClick={onNew}>
          ＋ {t('common.newChat')}
        </button>
      </div>
      <div className="conv-list">
        {conversations.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            {t('common.noConversations')}
          </div>
        )}
        {conversations.map((c) => (
          <div key={c.id} className={`conv-item ${c.id === activeId ? 'active' : ''}`} onClick={() => onSelect(c.id)}>
            <span>💬</span>
            <span className="conv-title">{c.title || t('common.noTitle')}</span>
            <button
              className="conv-del"
              title={t('common.deleteConv')}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(c.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="sidebar-footer">
        <span className={`status-badge ${online ? 'online' : ''}`}>
          <span className="dot" />
          <span className="label">{online ? providerName || t('common.online') : t('common.offline')}</span>
        </span>
        <span>{t('common.skillCount', [skillCount])}</span>
      </div>
      <button className="sidebar-settings-btn" onClick={onOpenSettings}>
        <span>⚙</span> {t('common.settings')}
      </button>
    </aside>
  );
}
