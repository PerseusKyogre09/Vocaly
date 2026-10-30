import type { APIRoute } from 'astro';
import { modelForTask } from '../../lib/groq';
import { groqChat, jsonError } from '../../lib/groq-server';
import { getSession } from '../../lib/session';
import { takeRateLimit } from '../../lib/security-events';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const user = (await getSession(request))?.user;
    if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
    if (!(await takeRateLimit(user.id, 'groq_connection_test', 20))) return Response.json({ error: 'Connection test limit reached. Try again in a minute.' }, { status: 429 });
    const body = await request.json();
    if (!body || typeof body !== 'object' || body.action !== 'test') {
      return Response.json({ error: 'Unsupported Groq action.' }, { status: 400 });
    }
    const model = modelForTask('quick-edit', body.model);
    const result = await groqChat(model, [{ role: 'user', content: 'Reply with exactly: Groq connection successful.' }], { temperature: 0 });
    return Response.json({ ok: result.content.includes('Groq connection successful'), model });
  } catch (error) {
    return jsonError(error, 'Groq connection test failed.');
  }
};
