import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { agent, conversationRecord } from '../../../lib/db/schema';
import { verifyBridgeToken } from '../../../lib/phone';

export const prerender = false;

/**
 * POST /api/actions/callback
 * Webhook callback endpoint for receiving completed conversation transcripts from external providers
 * (e.g. ElevenLabs conversational AI post-call webhooks or phone-bridge transcripts).
 * Authenticated via signed HMAC bridge token.
 */
export const POST: APIRoute = async ({ request, url }) => {
  try {
    const token = url.searchParams.get('token') || request.headers.get('x-bridge-token');
    const secret = import.meta.env.PHONE_BRIDGE_SECRET || import.meta.env.BETTER_AUTH_SECRET;

    if (!token || !secret) {
      return Response.json({ error: 'Missing authentication credentials.' }, { status: 401 });
    }

    const payload = verifyBridgeToken(token, secret, 86400);
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid payload.' }, { status: 400 });
    }

    const db = getDatabase();
    const externalConversationId = String(body.conversation_id || body.conversationId || payload.callId || crypto.randomUUID());
    const transcriptText = String(body.transcript || body.text || '').trim();

    if (!transcriptText) {
      return Response.json({ ok: true, message: 'No transcript provided in completion callback.' });
    }

    // Lookup agent by elevenLabsAgentId or internal agentId from token payload
    let targetAgentId = payload.agentId || null;
    let targetUserId = null;

    if (payload.agentId) {
      const [foundAgent] = await db.select().from(agent).where(eq(agent.id, payload.agentId)).limit(1);
      if (foundAgent) {
        targetUserId = foundAgent.userId;
      }
    }

    if (!targetUserId && payload.elevenLabsAgentId) {
      const [foundAgent] = await db.select().from(agent).where(eq(agent.elevenLabsAgentId, payload.elevenLabsAgentId)).limit(1);
      if (foundAgent) {
        targetAgentId = foundAgent.id;
        targetUserId = foundAgent.userId;
      }
    }

    if (!targetUserId) {
      return Response.json({ error: 'Could not associate conversation with an authenticated agent or user.' }, { status: 404 });
    }

    // Idempotency: check if conversation already processed
    const [existing] = await db.select().from(conversationRecord)
      .where(and(
        eq(conversationRecord.userId, targetUserId),
        eq(conversationRecord.externalConversationId, externalConversationId)
      )).limit(1);

    if (existing) {
      return Response.json({ ok: true, message: 'Conversation already recorded.', conversationId: existing.id });
    }

    const now = new Date();
    const conversationId = crypto.randomUUID();

    await db.insert(conversationRecord).values({
      id: conversationId,
      userId: targetUserId,
      agentId: targetAgentId,
      source: 'elevenlabs',
      externalConversationId,
      transcript: Array.isArray(body.messages) ? body.messages : [],
      rawTranscriptText: transcriptText,
      metadata: { provider: 'elevenlabs', callbackPayload: body },
      status: 'completed',
      createdAt: now,
      updatedAt: now
    });

    return Response.json({ ok: true, conversationId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid callback.' }, { status: 401 });
  }
};
