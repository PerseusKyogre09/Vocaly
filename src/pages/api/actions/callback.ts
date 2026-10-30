import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { agent, callSummary, conversationExtraction, conversationRecord, actionSchema, actionDefinition, actionInstance } from '../../../lib/db/schema';
import { verifyBridgeToken } from '../../../lib/phone';
import { extractConversationData, DEFAULT_APPOINTMENT_SCHEMA_FIELDS, type FieldDefinition } from '../../../lib/conversation-extractor';
import { generateCallSummary } from '../../../lib/call-summarizer';
import { resolveTemplate, redactSecrets } from '../../../lib/action-engine';
import { GROQ_MODELS } from '../../../lib/groq';

export const prerender = false;

/**
 * POST /api/actions/callback
 * Webhook callback endpoint for receiving completed conversation transcripts from external providers
 * (e.g. ElevenLabs conversational AI post-call webhooks or phone-bridge transcripts).
 * Authenticated via signed HMAC bridge token.
 *
 * After recording the conversation, concurrently runs:
 *   1. AI call summarization
 *   2. Structured field extraction
 * Each persists independently. Action generation depends only on extraction completing.
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
    let targetUserId: string | null = null;

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
      status: 'processing',
      createdAt: now,
      updatedAt: now
    });

    // Resolve schema fields
    let schemaFields: FieldDefinition[] = DEFAULT_APPOINTMENT_SCHEMA_FIELDS;
    let schemaId: string | null = null;

    if (targetAgentId) {
      const [agentSchema] = await db.select().from(actionSchema)
        .where(and(eq(actionSchema.userId, targetUserId), eq(actionSchema.agentId, targetAgentId))).limit(1);
      if (agentSchema && Array.isArray(agentSchema.fields) && agentSchema.fields.length > 0) {
        schemaFields = agentSchema.fields as FieldDefinition[];
        schemaId = agentSchema.id;
      }
    }
    if (!schemaId) {
      const [defaultSchema] = await db.select().from(actionSchema)
        .where(and(eq(actionSchema.userId, targetUserId), eq(actionSchema.isDefault, true))).limit(1);
      if (defaultSchema && Array.isArray(defaultSchema.fields) && defaultSchema.fields.length > 0) {
        schemaFields = defaultSchema.fields as FieldDefinition[];
        schemaId = defaultSchema.id;
      }
    }

    const model = GROQ_MODELS.primary;

    // --- CONCURRENT PROCESSING: Summarization + Extraction run in parallel ---
    const [extractionOutcome, summaryOutcome] = await Promise.allSettled([
      extractConversationData(transcriptText, schemaFields, model),
      generateCallSummary(transcriptText, model)
    ]);

    // Persist extraction independently
    let extractionResult: any = null;
    let extractionId: string | null = null;

    if (extractionOutcome.status === 'fulfilled') {
      extractionResult = extractionOutcome.value;
      extractionId = crypto.randomUUID();
      await db.insert(conversationExtraction).values({
        id: extractionId,
        userId: targetUserId,
        conversationId,
        schemaId,
        extractedFields: extractionResult.fields,
        summary: extractionResult.summary,
        intent: extractionResult.intent,
        uncertainties: extractionResult.uncertainties,
        groqModel: extractionResult.groqModel,
        rawModelOutput: extractionResult.rawModelOutput,
        status: 'completed',
        createdAt: new Date()
      });
    } else {
      console.error('[callback] Extraction failed:', extractionOutcome.reason);
    }

    // Persist call summary independently
    let savedSummary: any = null;
    if (summaryOutcome.status === 'fulfilled') {
      const sr = summaryOutcome.value;
      const summaryId = crypto.randomUUID();
      const ts = new Date();
      const summaryRecord = {
        id: summaryId,
        userId: targetUserId,
        conversationId,
        agentId: targetAgentId || null,
        title: sr.title,
        executiveSummary: sr.executiveSummary,
        customerIntent: sr.customerIntent,
        keyDiscussionPoints: sr.keyDiscussionPoints as any,
        customerRequirements: sr.customerRequirements as any,
        callOutcome: sr.callOutcome,
        importantCommitments: sr.importantCommitments as any,
        followUpTasks: sr.followUpTasks as any,
        unresolvedIssues: sr.unresolvedIssues as any,
        extractedEntities: sr.extractedEntities as any,
        groqModel: sr.groqModel,
        rawModelOutput: sr.rawModelOutput,
        status: 'completed' as const,
        createdAt: ts,
        updatedAt: ts
      };
      await db.insert(callSummary).values(summaryRecord);
      savedSummary = summaryRecord;
    } else {
      console.error('[callback] Summarization failed:', summaryOutcome.reason);
    }

    // Generate action instances if extraction succeeded
    let createdInstances: any[] = [];
    if (extractionResult) {
      const variables: Record<string, unknown> = {
        conversationId,
        agentId: targetAgentId || '',
        summary: extractionResult.summary,
        intent: extractionResult.intent,
        timestamp: now.toISOString()
      };
      for (const field of extractionResult.fields) {
        variables[field.name] = field.value;
      }

      const definitions = await db.select().from(actionDefinition)
        .where(and(eq(actionDefinition.userId, targetUserId), eq(actionDefinition.enabled, true)));

      const applicableDefs = definitions.filter(d => !d.agentId || d.agentId === targetAgentId);

      for (const def of applicableDefs) {
        const instanceId = crypto.randomUUID();
        const idempotencyKey = `${conversationId}_${def.id}_${now.getTime()}`;
        const config = (def.webhookConfig as any) || {};
        const bodyMapping = config.bodyMapping || {};
        const resolvedPayload = resolveTemplate(bodyMapping, variables) as Record<string, unknown>;
        const status = def.requiresApproval ? 'awaiting_approval' : 'approved';

        const instRecord = {
          id: instanceId,
          userId: targetUserId,
          conversationId,
          actionDefinitionId: def.id,
          name: def.name,
          actionType: def.actionType,
          status,
          requiresApproval: def.requiresApproval,
          payload: resolvedPayload,
          idempotencyKey,
          rejectionReason: null,
          approvedAt: def.requiresApproval ? null : now,
          approvedBy: def.requiresApproval ? null : 'system_auto_policy',
          createdAt: now,
          updatedAt: now
        };

        await db.insert(actionInstance).values(instRecord);
        createdInstances.push(instRecord);
      }
    }

    // Mark conversation status
    const finalStatus = extractionResult ? 'extracted' : (savedSummary ? 'completed' : 'failed');
    await db.update(conversationRecord).set({ status: finalStatus, updatedAt: new Date() })
      .where(eq(conversationRecord.id, conversationId));

    return Response.json({
      ok: true,
      conversationId,
      extractionId,
      summaryId: savedSummary?.id || null,
      actionsCreated: createdInstances.length
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid callback.' }, { status: 401 });
  }
};
