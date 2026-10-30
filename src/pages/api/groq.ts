import type { APIRoute } from 'astro';
import { modelForTask } from '../../lib/groq';
import { groqChat, jsonError } from '../../lib/groq-server';
import { getSession } from '../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!(await getSession(request))?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
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
