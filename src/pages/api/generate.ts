import type { APIRoute } from 'astro';
import { modelForTask } from '../../lib/groq';
import { groqChat, jsonError } from '../../lib/groq-server';
import { getSession } from '../../lib/session';

export const prerender = false;

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    business: { type: 'string' },
    purpose: { type: 'string' },
    language: { type: 'string' },
    firstMessage: { type: 'string' },
    systemPrompt: { type: 'string' },
    tone: { type: 'string' },
    requiredFields: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    fallback: { type: 'string' }
  },
  required: ['name', 'business', 'purpose', 'language', 'firstMessage', 'systemPrompt', 'tone', 'requiredFields', 'actions', 'fallback'],
  additionalProperties: false
};

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!(await getSession(request))?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
    const body = await request.json();
    if (!body || typeof body !== 'object' || typeof body.description !== 'string' || body.description.trim().length < 12) {
      return Response.json({ error: 'Describe the agent in a little more detail.' }, { status: 400 });
    }

    const result = await groqChat(
      modelForTask('agent-generation', body.model),
      [
        {
          role: 'system',
          content: `Create a safe, practical voice agent configuration from the user's brief. Return ONLY JSON matching this schema: ${JSON.stringify(schema)}. Include explicit boundaries, required fields, fallback and safe handoff. For healthcare, never diagnose or offer treatment advice. Never invent real integrations.`
        },
        { role: 'user', content: body.description }
      ],
      { temperature: 0.25, json: true }
    );
    const parsed = JSON.parse(result.content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Groq returned invalid agent JSON.');
    return Response.json(parsed);
  } catch (error) {
    return jsonError(error, 'Generation failed.');
  }
};
