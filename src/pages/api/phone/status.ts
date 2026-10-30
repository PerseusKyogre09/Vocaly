import type { APIRoute } from 'astro';
import { and, eq, notInArray } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { phoneCall } from '../../../lib/db/schema';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.PHONE_BRIDGE_SECRET;
  if (!secret || request.headers.get('x-voxflow-bridge-secret') !== secret) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const callId = body && typeof body === 'object' && typeof body.callId === 'string' ? body.callId : '';
  const status = body && typeof body === 'object' && typeof body.status === 'string' ? body.status : '';
  if (!callId || !['initiating', 'ringing', 'in-progress', 'agent-connecting', 'connected', 'completed', 'failed', 'no-answer', 'busy', 'cancelled'].includes(status)) return Response.json({ error: 'Invalid call status payload.' }, { status: 400 });
  const now = new Date();
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  const exotelCallSid = typeof metadata.callSid === 'string' ? metadata.callSid : undefined;
  const [updated] = await getDatabase().update(phoneCall).set({
    status, updatedAt: now, ...(exotelCallSid ? { exotelCallSid } : {}), ...(status === 'connected' ? { startedAt: now } : {}), ...(['completed', 'failed', 'no-answer', 'busy', 'cancelled'].includes(status) ? { completedAt: now } : {}),
    providerMetadata: metadata
  }).where(and(eq(phoneCall.id, callId), notInArray(phoneCall.status, ['completed', 'failed', 'no-answer', 'busy', 'cancelled']))).returning();
  if (!updated) return Response.json({ error: 'Call not found.' }, { status: 404 });
  return Response.json({ call: updated });
};
