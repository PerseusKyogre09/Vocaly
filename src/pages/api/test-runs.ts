import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '../../lib/db';
import { testRun } from '../../lib/db/schema';
import { getSession } from '../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const currentSession = await getSession(request);
  if (!currentSession?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const runs = await getDatabase().select().from(testRun).where(eq(testRun.userId, currentSession.user.id)).orderBy(desc(testRun.createdAt)).limit(50);
  return Response.json({ testRuns: runs });
};

export const POST: APIRoute = async ({ request }) => {
  const currentSession = await getSession(request);
  if (!currentSession?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.result || typeof body.result !== 'object') {
    return Response.json({ error: 'Invalid test run payload.' }, { status: 400 });
  }
  await getDatabase().insert(testRun).values({
    id: crypto.randomUUID(),
    userId: currentSession.user.id,
    result: body.result,
    createdAt: new Date()
  });
  return Response.json({ ok: true }, { status: 201 });
};
