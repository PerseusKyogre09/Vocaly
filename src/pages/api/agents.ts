import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { getDatabase } from '../../lib/db';
import { agent } from '../../lib/db/schema';
import { getSession } from '../../lib/session';

export const prerender = false;

const MAX_TEXT = 10000;
const allowedStatuses = new Set(['draft', 'deployed', 'failed']);
const asText = (value: unknown, fallback = '') => typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : fallback;
const asObject = (value: unknown, fallback: Record<string, unknown> = {}) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fallback;

function agentPayload(body: Record<string, unknown>) {
  const config = asObject(body.configuration);
  const workflow = asObject(body.workflow, { nodes: [], edges: [] });
  const name = asText(body.name);
  const instructions = asText(body.systemInstructions);
  const firstMessage = asText(body.firstMessage);
  if (!name || !instructions || !firstMessage) throw new Error('Name, system instructions, and first message are required.');
  const status = asText(body.status, 'draft');
  if (!allowedStatuses.has(status) || status === 'deployed') throw new Error('Agents can only be saved as draft or failed through this endpoint.');
  return {
    name,
    description: asText(body.description),
    systemInstructions: instructions,
    firstMessage,
    voiceId: asText(body.voiceId),
    voiceConfig: asObject(body.voiceConfig),
    language: asText(body.language, 'English'),
    configuration: config,
    workflow,
    status
  };
}

async function authenticated(request: Request) {
  const currentSession = await getSession(request);
  return currentSession?.user ?? null;
}

export const GET: APIRoute = async ({ request }) => {
  const currentUser = await authenticated(request);
  if (!currentUser) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const rows = await getDatabase().select().from(agent)
    .where(eq(agent.userId, currentUser.id)).orderBy(desc(agent.updatedAt));
  return Response.json({ agents: rows });
};

export const POST: APIRoute = async ({ request }) => {
  const currentUser = await authenticated(request);
  if (!currentUser) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid agent payload.' }, { status: 400 });
  try {
    const now = new Date();
    const id = crypto.randomUUID();
    const record = { id, userId: currentUser.id, ...agentPayload(body as Record<string, unknown>), createdAt: now, updatedAt: now };
    await getDatabase().insert(agent).values(record);
    return Response.json({ agent: record }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save agent.' }, { status: 400 });
  }
};

export const PUT: APIRoute = async ({ request }) => {
  const currentUser = await authenticated(request);
  if (!currentUser) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = body && typeof body === 'object' && typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Agent ID is required.' }, { status: 400 });
  try {
    const values = agentPayload(body as Record<string, unknown>);
    const [updated] = await getDatabase().update(agent).set({ ...values, updatedAt: new Date() })
      .where(and(eq(agent.id, id), eq(agent.userId, currentUser.id))).returning();
    if (!updated) return Response.json({ error: 'Agent not found.' }, { status: 404 });
    return Response.json({ agent: updated });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not update agent.' }, { status: 400 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const currentUser = await authenticated(request);
  if (!currentUser) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = body && typeof body === 'object' && typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Agent ID is required.' }, { status: 400 });
  const deleted = await getDatabase().delete(agent).where(and(eq(agent.id, id), eq(agent.userId, currentUser.id))).returning({ id: agent.id });
  if (!deleted.length) return Response.json({ error: 'Agent not found.' }, { status: 404 });
  return Response.json({ ok: true });
};
