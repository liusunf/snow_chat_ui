/** Sidebar：会话列表 + 新建/切换/删除 + 连接状态 */

import type { Conversation } from '../types';

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
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="logo-dot">AI</span>
          <span>对话工作台</span>
        </div>
        <button className="new-chat-btn" onClick={onNew}>
          ＋ 新对话
        </button>
      </div>
      <div className="conv-list">
        {conversations.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            暂无会话，点击「新对话」开始
          </div>
        )}
        {conversations.map((c) => (
          <div key={c.id} className={`conv-item ${c.id === activeId ? 'active' : ''}`} onClick={() => onSelect(c.id)}>
            <span>💬</span>
            <span className="conv-title">{c.title || '新对话'}</span>
            <button
              className="conv-del"
              title="删除会话"
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
          <span className="label">{online ? providerName || '服务在线' : '服务未连接'}</span>
        </span>
        <span>{skillCount} 技能</span>
      </div>
      <button className="sidebar-settings-btn" onClick={onOpenSettings}>
        <span>⚙</span> 设置
      </button>
    </aside>
  );
}
