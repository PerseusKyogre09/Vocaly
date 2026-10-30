import type { APIRoute } from 'astro';
import { and, eq, sql } from 'drizzle-orm';
import { getDatabase } from '../../../../lib/db';
import { agent } from '../../../../lib/db/schema';
import { getSession } from '../../../../lib/session';
import { recordSecurityEvent, recordUnauthorizedResourceAccess } from '../../../../lib/security-events';
import { detectPromptAttack } from '../../../../lib/agent-safety.mjs';

export const prerender = false;
const MAX_NODES = 250;
const MAX_EDGES = 500;
const asGraph = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const id = params.id || '';
  const body = await request.json().catch(() => null);
  const workflow = asGraph(body?.workflow);
  const nodes = workflow?.nodes;
  const edges = workflow?.edges;
  const expectedVersion = body?.expectedVersion;
  if (!id || !workflow || !Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > MAX_NODES || edges.length > MAX_EDGES || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return Response.json({ error: 'Invalid workflow payload or version.' }, { status: 400 });
  }
  if (detectPromptAttack(JSON.stringify(workflow)).secretLike) {
    await recordSecurityEvent({ eventType: 'credential_like_workflow_content', userId: session.user.id, agentId: id, severity: 'high', detectionResult: 'Credential pattern detected in workflow content', actionTaken: 'workflow_save_rejected' });
    return Response.json({ error: 'Remove credentials and tokens from workflow settings before saving.' }, { status: 400 });
  }
  const version = expectedVersion + 1;
  const saved = { version, nodes, edges, updatedAt: new Date().toISOString() };
  const versionMatches = sql`coalesce((${agent.workflow}->>'version')::integer, 0) = ${expectedVersion}`;
  const [updated] = await getDatabase().update(agent).set({ workflow: saved, updatedAt: new Date() })
    .where(and(eq(agent.id, id), eq(agent.userId, session.user.id), versionMatches)).returning({ id: agent.id });
  if (!updated) {
    const [exists] = await getDatabase().select({ id: agent.id, workflow: agent.workflow }).from(agent)
      .where(and(eq(agent.id, id), eq(agent.userId, session.user.id))).limit(1);
    if (!exists) {
      await recordUnauthorizedResourceAccess(session.user.id, id, 'unauthorized_agent_workflow_write');
      return Response.json({ error: 'Agent not found.' }, { status: 404 });
    }
    return Response.json({ error: 'Workflow changed in another session. Reload this agent before saving again.', currentVersion: Number(asGraph(exists.workflow)?.version) || 0 }, { status: 409 });
  }
  return Response.json({ ok: true, version });
};
