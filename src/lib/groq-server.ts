import { GROQ_MODELS, type GroqModel } from './groq';

const endpoint = 'https://api.groq.com/openai/v1/chat/completions';

export async function groqChat(
  model: GroqModel,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options: { temperature?: number; json?: boolean } = {}
) {
  const key = import.meta.env.GROQ_API_KEY;
  if (!key) {
    throw new GroqError('GROQ_API_KEY is missing. Add it to your local .env file or Vercel environment variables.', 503);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: options.temperature ?? 0.2,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      messages
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GroqError(data?.error?.message || `Groq request failed (${response.status}).`, 502);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new GroqError('Groq returned an empty response.', 502);
  }
  return { content, model };
}

export class GroqError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = 'GroqError';
  }
}

export function jsonError(error: unknown, fallback: string) {
  const status = error instanceof GroqError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return Response.json({ error: message }, { status });
}

export { GROQ_MODELS };
