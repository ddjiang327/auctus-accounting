import type { IncomingMessage, ServerResponse } from 'node:http';
import { getCurrentUser } from '../auth/currentUser.js';
import { readJsonBody } from '../http/request.js';
import { sendJson } from '../http/response.js';
import type { ApiContext } from '../types.js';
import { parseTransactionText, type ParseContext } from './service.js';

export const parseTransaction = async (
  request: IncomingMessage,
  response: ServerResponse,
  context: ApiContext,
  _params: Record<string, string>,
): Promise<void> => {
  const user = await getCurrentUser(request, context);
  if (!user) {
    sendJson(response, 401, { error: 'unauthorized' });
    return;
  }

  const body = await readJsonBody(request) as { text?: unknown; context?: unknown; existingDraft?: unknown };

  if (typeof body.text !== 'string' || !body.text.trim()) {
    sendJson(response, 400, { error: 'text_required' });
    return;
  }

  if (!body.context || typeof body.context !== 'object') {
    sendJson(response, 400, { error: 'context_required' });
    return;
  }

  if (!context.env.anthropicApiKey) {
    sendJson(response, 503, { error: 'ai_not_configured', message: 'ANTHROPIC_API_KEY is not set on the server' });
    return;
  }

  try {
    const draft = await parseTransactionText(
      body.text,
      body.context as ParseContext,
      context.env,
      body.existingDraft && typeof body.existingDraft === 'object' ? body.existingDraft : undefined,
    );
    sendJson(response, 200, { draft });
  } catch (error) {
    sendJson(response, 502, {
      error: 'ai_parse_failed',
      message: error instanceof Error ? error.message : 'AI parse failed',
    });
  }
};
