import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '../../../../lib/db';
import { agent } from '../../../../lib/db/schema';
import { getSession } from '../../../../lib/session';
import { compileWorkflow } from '../../../../lib/workflow.mjs';
import { buildAgentInstructions, detectPromptAttack } from '../../../../lib/agent-safety.mjs';
import { recordSecurityEvent, takeRateLimit } from '../../../../lib/security-events';

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
  if (!(await takeRateLimit(currentSession.user.id, 'agent_deployment', 5))) return Response.json({ error: 'Deployment limit reached. Try again in a minute.' }, { status: 429 });
  const id = params.id;
  const body = await request.json().catch(() => null);
  const apiKey = body && typeof body === 'object' && typeof body.apiKey === 'string' ? body.apiKey : '';
  if (!id || apiKey.length < 10) return Response.json({ error: 'Agent ID and a valid ElevenLabs API key are required.' }, { status: 400 });
  const db = getDatabase();
  const [record] = await db.select().from(agent).where(and(eq(agent.id, id), eq(agent.userId, currentSession.user.id))).limit(1);
  if (!record) {
    await recordSecurityEvent({ eventType: 'unauthorized_agent_deployment', userId: currentSession.user.id, agentId: id, severity: 'high', detectionResult: 'Agent does not belong to authenticated user or does not exist', actionTaken: 'deployment_rejected' });
    return Response.json({ error: 'Agent not found.' }, { status: 404 });
  }
  const compiled = compileWorkflow(record.workflow);
  if (!compiled.ok) {
    const blocking = compiled.issues.filter((issue: any) => issue.severity === 'error');
    await recordSecurityEvent({ eventType: 'deployment_validation_failed', userId: currentSession.user.id, agentId: id, severity: 'medium', detectionResult: `${blocking.length} workflow validation error(s)`, actionTaken: 'deployment_rejected' });
    return Response.json({ error: `Workflow validation failed: ${blocking.map((issue: any) => issue.message).join(' ')}`, issues: compiled.issues }, { status: 422 });
  }
  const configuration = record.configuration as Record<string, any>;
  const prompt = `${buildAgentInstructions({ systemInstructions: record.systemInstructions, workflowInstructions: compiled.instructions, configuration, purpose: record.description, business: configuration.business })}\n\nConversation lifecycle: when the caller clearly says goodbye or indicates they are finished, respond with a brief friendly farewell and end the call.`;
  if (detectPromptAttack(JSON.stringify({ prompt, firstMessage: record.firstMessage, name: record.name })).secretLike) {
    await recordSecurityEvent({ eventType: 'credential_like_deployment_content', userId: currentSession.user.id, agentId: id, severity: 'high', detectionResult: 'Credential pattern detected in compiled agent configuration', actionTaken: 'deployment_rejected' });
    return Response.json({ error: 'Deployment blocked because the agent configuration contains a credential-like value. Remove it and deploy again.' }, { status: 422 });
  }
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
    await recordSecurityEvent({ eventType: 'agent_deployed', userId: currentSession.user.id, agentId: id, severity: 'info', detectionResult: 'Saved policy and validated workflow compiled', actionTaken: 'configuration_deployed' });
    return Response.json({ agent: updated });
  } catch (error) {
    await recordSecurityEvent({ eventType: 'agent_deployment_failed', userId: currentSession.user.id, agentId: id, severity: 'medium', detectionResult: 'ElevenLabs deployment request failed', actionTaken: 'draft_preserved' });
    await db.update(agent).set({ status: 'failed', updatedAt: new Date() })
      .where(and(eq(agent.id, id), eq(agent.userId, currentSession.user.id)));
    return Response.json({ error: error instanceof Error ? error.message : 'Deployment failed.', saved: true }, { status: 502 });
  }
};
