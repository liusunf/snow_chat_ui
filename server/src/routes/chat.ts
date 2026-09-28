/**
 * 聊天路由：POST /api/chat，SSE 流式输出。
 * 请求体：{ messages: ChatMessage[], providerId?, model? }
 */

import { Router, type Request, type Response } from 'express';
import { loadConfig } from '../config.js';
import { runAgent, type AgentEvent } from '../agent/agent.js';
import type { ChatMessage } from '../providers/types.js';

export const chatRouter = Router();

function writeSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

chatRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as { messages?: ChatMessage[]; providerId?: string; model?: string };
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    res.status(400).json({ error: 'messages 不能为空' });
    return;
  }

  const cfg = await loadConfig();

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // 心跳，防止代理/客户端超时断开
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  const abortController = new AbortController();
  req.on('close', () => {
    abortController.abort();
    clearInterval(heartbeat);
  });

  try {
    await runAgent(
      { messages, providerId: body?.providerId, model: body?.model },
      {
        cfg,
        signal: abortController.signal,
        emit: (ev: AgentEvent) => {
          switch (ev.type) {
            case 'text-delta':
              writeSSE(res, 'delta', { text: ev.text });
              break;
            case 'tool-start':
              writeSSE(res, 'tool_start', {
                name: ev.toolName,
                id: ev.toolCallId,
                args: ev.args,
              });
              break;
            case 'tool-result':
              writeSSE(res, 'tool_result', {
                name: ev.toolName,
                id: ev.toolCallId,
                result: ev.result,
                error: ev.error,
              });
              break;
            case 'info':
              writeSSE(res, 'info', { text: ev.text });
              break;
            case 'done':
              writeSSE(res, 'done', { usage: ev.usage });
              res.end();
              clearInterval(heartbeat);
              break;
            case 'error':
              writeSSE(res, 'error', { message: ev.error });
              res.end();
              clearInterval(heartbeat);
              break;
          }
        },
      },
    );
  } catch (e) {
    writeSSE(res, 'error', { message: e instanceof Error ? e.message : String(e) });
    res.end();
    clearInterval(heartbeat);
  }
});
