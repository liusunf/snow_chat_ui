/**
 * ChatView：基于 @chatui/core 的对话主界面
 * - ChatUI 渲染消息气泡（assistant 用 Markdown）
 * - SSE 流式接收，增量更新气泡
 * - 工具调用（Skill/MCP）以卡片形式实时展示
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Chat, { Bubble, useMessages } from '@chatui/core';
import '@chatui/core/dist/index.css';
import { streamChat } from '../api';
import type { ChatMessage, Conversation } from '../types';
import { Markdown } from './Markdown';

interface Props {
  conversation: Conversation;
  providerName: string;
  modelLabel: string;
  onMessagesChange: (msgs: ChatMessage[]) => void;
  onOpenConversations?: () => void;
  onOpenSettings?: () => void;
}

type UiMessage = NonNullable<Parameters<typeof useMessages>[0]>[number];

function toUiMessages(msgs: ChatMessage[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      out.push({ _id: `u_${out.length}_${Date.now()}`, type: 'text', content: { text: m.content ?? '' }, position: 'right' });
    } else if (m.role === 'assistant' && m.content) {
      out.push({ _id: `a_${out.length}_${Date.now()}`, type: 'text', content: { text: m.content }, position: 'left' });
    }
  }
  return out;
}

export function ChatView({ conversation, providerName, modelLabel, onMessagesChange, onOpenConversations, onOpenSettings }: Props) {
  const { messages, appendMsg, updateMsg, deleteMsg, resetList } = useMessages([]);

  const [streaming, setStreaming] = useState(false);
  const [typing, setTyping] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const ctxRef = useRef<ChatMessage[]>([]);
  const assistantIdRef = useRef<string | null>(null);
  const textBufRef = useRef('');
  const toolMapRef = useRef<Map<string, string>>(new Map()); // toolCallId -> msgId
  const toolStateRef = useRef<Map<string, { name: string; args?: string }>>(new Map()); // toolCallId -> info

  // 会话切换：重置 UI 与上下文
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    ctxRef.current = conversation.messages ?? [];
    resetList(toUiMessages(conversation.messages ?? []));
    assistantIdRef.current = null;
    textBufRef.current = '';
    toolMapRef.current = new Map();
    toolStateRef.current = new Map();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  const finalizeContext = useCallback(() => {
    const finalText = textBufRef.current;
    if (finalText) {
      ctxRef.current.push({ role: 'assistant', content: finalText });
    }
    onMessagesChange(ctxRef.current);
    textBufRef.current = '';
  }, [onMessagesChange]);

  const handleSend = useCallback(
    async (type: string, val: string) => {
      if (type !== 'text') return;
      const text = (val || '').trim();
      if (!text) return;
      if (abortRef.current) return; // 流式进行中

      // 用户消息
      appendMsg({ type: 'text', content: { text }, position: 'right' });
      ctxRef.current.push({ role: 'user', content: text });

      // 初始化流式状态
      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);
      setTyping(true);
      assistantIdRef.current = null;
      textBufRef.current = '';
      toolMapRef.current = new Map();
      toolStateRef.current = new Map();

      const pushAssistant = () => {
        if (!assistantIdRef.current) {
          const id = appendMsg({ type: 'text', content: { text: '' }, position: 'left', status: 'sent' });
          assistantIdRef.current = id;
        }
        return assistantIdRef.current;
      };

      const pushTool = (toolCallId: string, name: string, args?: string) => {
        const msgId = appendMsg({
          type: 'tool',
          content: { tool: { name, args, state: 'running' as const } },
          position: 'left',
        });
        toolMapRef.current.set(toolCallId, msgId);
        toolStateRef.current.set(toolCallId, { name, args });
      };

      const updateTool = (toolCallId: string, state: 'ok' | 'err', result?: string) => {
        const msgId = toolMapRef.current.get(toolCallId);
        if (!msgId) return;
        const info = toolStateRef.current.get(toolCallId);
        const name = info?.name ?? 'tool';
        const args = info?.args;
        updateMsg(msgId, {
          type: 'tool',
          content: { tool: { name, args, state, result } },
          position: 'left',
        });
      };

      try {
        await streamChat(
          { messages: ctxRef.current, providerId: conversation.providerId },
          {
            onDelta: (delta) => {
              textBufRef.current += delta;
              pushAssistant();
              updateMsg(assistantIdRef.current!, {
                type: 'text',
                content: { text: textBufRef.current },
                position: 'left',
                status: 'sent',
              });
            },
            onToolStart: (data) => {
              setTyping(false);
              pushAssistant(); // 保证有 assistant 载体
              pushTool(data.id, data.name, data.args);
            },
            onToolResult: (data) => {
              const resultStr = data.error
                ? `错误：${data.error}`
                : typeof data.result === 'string'
                  ? data.result
                  : JSON.stringify(data.result, null, 2).slice(0, 2000);
              updateTool(data.id, data.error ? 'err' : 'ok', resultStr);
            },
            onInfo: (text) => {
              appendMsg({ type: 'text', content: { text }, position: 'center' });
            },
            onDone: () => {
              if (!assistantIdRef.current && !textBufRef.current) {
                // 无文本输出
                const id = appendMsg({ type: 'text', content: { text: '（完成）' }, position: 'left' });
                assistantIdRef.current = id;
                textBufRef.current = '（完成）';
              }
              setTyping(false);
              finalizeContext();
            },
            onError: (message) => {
              setTyping(false);
              const errText = `⚠️ ${message}`;
              if (assistantIdRef.current) {
                updateMsg(assistantIdRef.current, {
                  type: 'text',
                  content: { text: textBufRef.current || errText },
                  position: 'left',
                  status: 'fail',
                });
                if (!textBufRef.current) textBufRef.current = errText;
              } else {
                appendMsg({ type: 'text', content: { text: errText }, position: 'left', status: 'fail' });
              }
              finalizeContext();
            },
          },
          ac.signal,
        );
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          setTyping(false);
          const msg = e instanceof Error ? e.message : String(e);
          appendMsg({ type: 'text', content: { text: `⚠️ ${msg}` }, position: 'left', status: 'fail' });
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setTyping(false);
      }
    },
    [appendMsg, updateMsg, setTyping, finalizeContext, conversation.providerId],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleDelete = useCallback(
    (msgId: string) => {
      deleteMsg(msgId);
    },
    [deleteMsg],
  );

  const renderMessageContent = useCallback(
    (msg: UiMessage) => {
      const content = msg.content as Record<string, unknown>;
      if (msg.type === 'tool') {
        const tool = content.tool as { name: string; args?: string; state?: string; result?: string };
        const state = tool.state ?? 'running';
        return (
          <div className="tool-card">
            <div className="tool-line">
              <span>🔧</span>
              <span className="tool-name">{tool.name}</span>
              <span className={`tool-state ${state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'running'}`}>
                {state === 'running' ? '运行中…' : state === 'ok' ? '✓ 完成' : '✗ 失败'}
              </span>
            </div>
            {tool.args && <div className="tool-args">{tool.args}</div>}
            {tool.result && <div className="tool-result">{tool.result}</div>}
          </div>
        );
      }
      if (msg.type === 'text') {
        const text = (content.text as string) ?? '';
        if (msg.position === 'right') {
          return <Bubble content={text} />;
        }
        if (msg.position === 'center') {
          return (
            <div className="thinking-block">
              <span className="spinner" />
              <span>{text}</span>
            </div>
          );
        }
        const isCurrent = streaming && assistantIdRef.current === msg._id;
        return (
          <div className={`msg-wrap${isCurrent ? ' streaming' : ''}`}>
            <Bubble>
              <Markdown text={text} />
            </Bubble>
          </div>
        );
      }
      return null;
    },
    [streaming],
  );

  const empty = messages.length === 0 && !streaming;

  // 动态欢迎页：建议问题轮播（空状态时每 6s 切换一组）
  const SUGGEST_GROUPS = [
    ['现在几点？', '计算 (123*456+789)/3', '北京现在天气如何？'],
    ['解释什么是 MCP 协议，并各举一个例子', '用 Python 画一个简单的饼图', '把这段 JSON 转成表格'],
    ['写一份本周工作周报的提纲', '把这句翻译成英文：今天天气不错', '帮我总结一下这篇文章的要点'],
  ];
  const [suggestIdx, setSuggestIdx] = useState(0);
  useEffect(() => {
    if (!empty) return;
    const t = setInterval(() => setSuggestIdx((i) => (i + 1) % SUGGEST_GROUPS.length), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty]);
  const suggestGroup = SUGGEST_GROUPS[suggestIdx % SUGGEST_GROUPS.length];

  return (
    <div className="chat-main">
      <div className="chat-toolbar">
        <button className="icon-btn desktop-only-nav-btn" onClick={onOpenConversations} title="会话列表">
          ☰
        </button>
        <div className="title">{conversation.title || '新对话'}</div>
        <span className="model-tag" title={`${providerName} · ${modelLabel}`}>
          {modelLabel || providerName}
        </span>
        <button className="icon-btn desktop-only-nav-btn" onClick={onOpenSettings} title="配置">
          ⚙
        </button>
        {streaming ? (
          <button className="icon-btn" onClick={handleStop} title="停止生成" style={{ color: '#d93025' }}>
            ■
          </button>
        ) : null}
      </div>
      <div className="chat-body">
        {empty && (
          <div className="empty-welcome">
            <div className="w-icon">💬</div>
            <div className="w-title">ChatUI LLM Workbench</div>
            <div className="w-sub">
              支持统一配置任意 LLM Provider（OpenAI 兼容 / Claude / Gemini / Ollama），
              并通过 MCP 与 Skill 调用工具。在「设置中心」完成配置后即可开始对话。
            </div>
            <div className="w-suggest" key={suggestIdx}>
              {suggestGroup.map((q) => (
                <button key={q} onClick={() => handleSend('text', q)}>
                  {q}
                </button>
              ))}
            </div>
            <div className="w-dots">
              {SUGGEST_GROUPS.map((_, i) => (
                <span key={i} className={i === suggestIdx ? 'on' : ''} />
              ))}
            </div>
          </div>
        )}
        <div className="chatui-shell">
          <Chat
            placeholder="输入消息，Enter 发送，Shift+Enter 换行…"
            messages={messages}
            renderMessageContent={renderMessageContent}
            onSend={handleSend}
            isTyping={typing}
            wideBreakpoint="900px"
          />
        </div>
      </div>
    </div>
  );
}
