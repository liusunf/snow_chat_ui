/** Markdown 渲染：marked + DOMPurify 消毒，支持表格/代码块/列表 */

import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function renderMarkdown(text: string): string {
  const raw = marked.parse(text || '') as string;
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
