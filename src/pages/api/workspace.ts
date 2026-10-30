import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../../lib/db';
import { workspace } from '../../lib/db/schema';
import { getSession } from '../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const currentSession = await getSession(request);
  if (!currentSession?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const [record] = await getDatabase().select().from(workspace).where(eq(workspace.userId, currentSession.user.id)).limit(1);
  return Response.json({ workspace: record ?? null });
};

export const PUT: APIRoute = async ({ request }) => {
  const currentSession = await getSession(request);
  if (!currentSession?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.agent || !Array.isArray(body.flowNodes) || !Array.isArray(body.flowEdges)) {
    return Response.json({ error: 'Invalid workspace payload.' }, { status: 400 });
  }
  const now = new Date();
  const existing = await getDatabase().select({ id: workspace.id }).from(workspace).where(eq(workspace.userId, currentSession.user.id)).limit(1);
  if (existing[0]) {
    await getDatabase().update(workspace).set({
      agent: body.agent,
      name: typeof body.workspaceName === 'string' ? body.workspaceName.trim().slice(0, 120) : undefined,
      flowNodes: body.flowNodes,
      flowEdges: body.flowEdges,
      lastLabResult: body.lastLabResult ?? null,
      updatedAt: now
    }).where(eq(workspace.id, existing[0].id));
  } else {
    await getDatabase().insert(workspace).values({
      id: crypto.randomUUID(),
      userId: currentSession.user.id,
      name: typeof body.workspaceName === 'string' ? body.workspaceName.trim().slice(0, 120) : `${currentSession.user.name}'s workspace`,
      agent: body.agent,
      flowNodes: body.flowNodes,
      flowEdges: body.flowEdges,
      lastLabResult: body.lastLabResult ?? null,
      createdAt: now,
      updatedAt: now
    });
  }
  return Response.json({ ok: true });
};
