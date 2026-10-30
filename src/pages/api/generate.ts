import type { APIRoute } from 'astro';
import { modelForTask } from '../../lib/groq';
import { groqChat, jsonError } from '../../lib/groq-server';
import { getSession } from '../../lib/session';
import { containsSensitiveOutput, detectPromptAttack } from '../../lib/agent-safety.mjs';
import { recordSecurityEvent, takeRateLimit } from '../../lib/security-events';

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
    const user = (await getSession(request))?.user;
    if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
    if (!(await takeRateLimit(user.id, 'agent_generation', 10))) return Response.json({ error: 'Generation limit reached. Try again in a minute.' }, { status: 429 });
    const body = await request.json();
    if (!body || typeof body !== 'object' || typeof body.description !== 'string' || body.description.trim().length < 12 || body.description.length > 12000) {
      return Response.json({ error: 'Describe the agent in a little more detail.' }, { status: 400 });
    }
    const attack = detectPromptAttack(body.description);
    if (attack.injection || attack.secretLike) {
      await recordSecurityEvent({ eventType: attack.secretLike ? 'credential_like_generation_input' : 'prompt_injection_generation_input', userId: user.id, severity: attack.secretLike ? 'high' : 'medium', detectionResult: attack.secretLike ? 'Credential pattern detected in generation request' : 'Prompt override or instruction-exfiltration pattern detected in generation request', actionTaken: 'generation_rejected' });
      return Response.json({ error: attack.secretLike ? 'Remove credentials and tokens from the description.' : 'The description contains instructions that try to override security rules. Remove those and describe the agent task directly.' }, { status: 400 });
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
    if (containsSensitiveOutput(JSON.stringify(parsed))) {
      await recordSecurityEvent({ eventType: 'sensitive_generation_output', userId: user.id, severity: 'high', detectionResult: 'Credential-like pattern detected in generated configuration', actionTaken: 'generation_output_rejected' });
      return Response.json({ error: 'Generated configuration was blocked because it appeared to contain a credential. Try again with a sanitized description.' }, { status: 502 });
    }
    await recordSecurityEvent({ eventType: 'agent_generation', userId: user.id, severity: 'info', detectionResult: 'Authenticated agent generation request completed', actionTaken: 'generation_succeeded' });
    return Response.json(parsed);
  } catch (error) {
    return jsonError(error, 'Generation failed.');
  }
};
