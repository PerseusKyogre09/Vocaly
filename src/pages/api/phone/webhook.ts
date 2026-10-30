import type { APIRoute } from 'astro';
import { and, eq, notInArray } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { phoneCall } from '../../../lib/db/schema';
import { verifyBridgeToken } from '../../../lib/phone';

export const prerender = false;

const terminal = ['completed', 'failed', 'no-answer', 'busy', 'cancelled'];

function mapStatus(value: unknown): string | null {
  const status = String(value || '').toLowerCase().replace(/_/g, '-');
  if (['completed', 'failed', 'no-answer', 'busy', 'cancelled', 'canceled'].includes(status)) return status === 'canceled' ? 'cancelled' : status;
  if (['in-progress', 'in progress', 'answered'].includes(status)) return 'in-progress';
  if (['queued', 'ringing', 'initiating'].includes(status)) return status === 'queued' ? 'ringing' : status;
  return null;
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const payload = verifyBridgeToken(url.searchParams.get('token'), import.meta.env.PHONE_BRIDGE_SECRET, 86400);
    const contentType = request.headers.get('content-type') || '';
    const body = contentType.includes('application/x-www-form-urlencoded')
      ? Object.fromEntries(new URLSearchParams(await request.text()))
      : await request.json().catch(() => null);
    const status = mapStatus(body?.Status || body?.status || body?.EventType);
    if (!status) return Response.json({ error: 'Unsupported Exotel status.' }, { status: 400 });
    const callSid = body?.CallSid || body?.call_sid || body?.Call?.Sid;
    const now = new Date();
    const [updated] = await getDatabase().update(phoneCall).set({
      status,
      updatedAt: now,
      ...(typeof callSid === 'string' ? { exotelCallSid: callSid } : {}),
      ...(terminal.includes(status) ? { completedAt: now } : {}),
      providerMetadata: body && typeof body === 'object' ? body : {}
    }).where(and(eq(phoneCall.id, String(payload.callId)), notInArray(phoneCall.status, terminal))).returning();
    return Response.json({ ok: true, updated: Boolean(updated) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid Exotel callback.' }, { status: 401 });
  }
};
