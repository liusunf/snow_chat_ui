/** Markdown 渲染：marked + DOMPurify 消毒，支持表格/代码块/列表 */

import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** 预处理：收紧模型输出的常见冗余空行 */
function normalizeMarkdown(text: string): string {
  let s = text || '';
  // 1) 连续 3 个及以上空行压成 1 个空行
  s = s.replace(/\n{3,}/g, '\n\n');
  // 2) 列表项之间的空行合并（- / * / + 开头的连续行），避免 loose list 每行隔一行
  s = s.replace(/(\n[ \t]*[-*+][ \t]+[^\n]*)\n\n(?=[ \t]*[-*+][ \t]+)/g, '$1\n');
  // 3) 有序列表同理
  s = s.replace(/(\n[ \t]*\d+\.[ \t]+[^\n]*)\n\n(?=[ \t]*\d+\.[ \t]+)/g, '$1\n');
  return s;
}

export function renderMarkdown(text: string): string {
  let raw = marked.parse(normalizeMarkdown(text)) as string;
  // 清理 marked 输出中 li/ul 内的换行文本节点（loose list 会在 li 底部产生一行空白）
  raw = raw.replace(/\n\s*<\/(li|ul|ol)>/g, '</$1>');
  // 删除列表标签相邻的换行（li 之间 / ul 开头结尾），消除匿名行框撑出的空隙
  raw = raw.replace(/\n(?=<\/?(?:li|ul|ol)[ >])/g, '');
  // DOMPurify 默认不信任 target=_blank 等；追加安全配置
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel'],
  });
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    <div
      className="md-body"
      dangerouslySetInnerHTML={{ __html: html }}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}
