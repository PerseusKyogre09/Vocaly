import type { APIRoute } from 'astro';
import { modelForTask } from '../../lib/groq';
import { groqChat, jsonError } from '../../lib/groq-server';
import { getSession } from '../../lib/session';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    if (!(await getSession(request))?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
    const body = await request.json();
    if (!body || typeof body !== 'object' || !body.agent || !Array.isArray(body.scenarios) || body.scenarios.length === 0) {
      return Response.json({ error: 'A valid agent and at least one scenario are required.' }, { status: 400 });
    }

    const prompt = `You are a rigorous voice-agent QA evaluator. Evaluate this configuration against the scenarios. Do not claim a live ElevenLabs call happened. This is an instruction-level simulation. Agent: ${JSON.stringify(body.agent)}. Scenarios: ${JSON.stringify(body.scenarios)}. Return JSON with overallScore (0-100), results array with id,title,status (pass|warning|fail), finding, recommendation, and patch (a concise instruction text or empty string). Be critical. Check missing-field collection, no false booking confirmation, medical boundaries, fallback and handoff.`;
    const result = await groqChat(modelForTask('reality-lab', body.model), [{ role: 'user', content: prompt }], { temperature: 0.2, json: true });
    const parsed = JSON.parse(result.content);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.overallScore !== 'number' || !Array.isArray(parsed.results)) {
      throw new Error('Groq returned invalid Reality Lab JSON.');
    }
    return Response.json(parsed);
  } catch (error) {
    return jsonError(error, 'Evaluation failed.');
  }
};
