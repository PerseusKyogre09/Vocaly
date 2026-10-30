import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '../../../../lib/db';
import { agent } from '../../../../lib/db/schema';
import { getSession } from '../../../../lib/session';
import { compileWorkflow } from '../../../../lib/workflow.mjs';

export const prerender = false;
const base = 'https://api.elevenlabs.io/v1';

async function elevenLabs(path: string, apiKey: string, init: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', ...(init.headers || {}) }
  });
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { detail: text }; }
  if (!response.ok) throw new Error(data?.detail?.message || data?.detail || data?.message || `ElevenLabs returned ${response.status}`);
  return data;
}

export const POST: APIRoute = async ({ request, params }) => {
  const currentSession = await getSession(request);
  if (!currentSession?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const id = params.id;
  const body = await request.json().catch(() => null);
  const apiKey = body && typeof body === 'object' && typeof body.apiKey === 'string' ? body.apiKey : '';
  if (!id || apiKey.length < 10) return Response.json({ error: 'Agent ID and a valid ElevenLabs API key are required.' }, { status: 400 });
  const db = getDatabase();
  const [record] = await db.select().from(agent).where(and(eq(agent.id, id), eq(agent.userId, currentSession.user.id))).limit(1);
  if (!record) return Response.json({ error: 'Agent not found.' }, { status: 404 });
  const compiled = compileWorkflow(record.workflow);
  if (!compiled.ok) {
    const blocking = compiled.issues.filter((issue: any) => issue.severity === 'error');
    return Response.json({ error: `Workflow validation failed: ${blocking.map((issue: any) => issue.message).join(' ')}`, issues: compiled.issues }, { status: 422 });
  }
  const prompt = `${record.systemInstructions}\n\n${compiled.instructions}\n\nRuntime limits: VoxFlow compiles workflow steps into conversation instructions. No external integration or calendar/CRM operation is executed unless an actual ElevenLabs tool or connected integration is configured. Never claim a requested external action succeeded without a tool result. If a workflow requests a human handoff but no telephony transfer tool is configured, explain the handoff limitation and follow its configured fallback. When the caller clearly says goodbye or indicates they are finished, respond with a brief friendly farewell and end the call.`;
  const payload = {
    name: record.name,
    conversation_config: {
      agent: { prompt: { prompt }, first_message: record.firstMessage, language: record.language.toLowerCase().startsWith('en') ? 'en' : record.language.slice(0, 2) },
      tts: record.voiceId ? { voice_id: record.voiceId } : {}
    },
    platform_settings: { auth: { enable_auth: true } }
  };
  try {
    const result = await elevenLabs(record.elevenLabsAgentId ? `/convai/agents/${encodeURIComponent(record.elevenLabsAgentId)}` : '/convai/agents/create', apiKey, {
      method: record.elevenLabsAgentId ? 'PATCH' : 'POST', body: JSON.stringify(payload)
    });
    const elevenLabsAgentId = record.elevenLabsAgentId || result.agent_id || result.agentId;
    if (!elevenLabsAgentId) throw new Error('ElevenLabs did not return an agent ID.');
    const [updated] = await db.update(agent).set({ elevenLabsAgentId, status: 'deployed', lastDeployedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agent.id, id), eq(agent.userId, currentSession.user.id))).returning();
    return Response.json({ agent: updated });
  } catch (error) {
    await db.update(agent).set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(agent.id, id), eq(agent.userId, currentSession.user.id)));
    return Response.json({ error: error instanceof Error ? error.message : 'Deployment failed.', saved: true }, { status: 502 });
  }
};
