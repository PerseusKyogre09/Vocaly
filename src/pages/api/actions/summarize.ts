import type { APIRoute } from 'astro';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import {
  agent,
  callSummary,
  conversationRecord,
  conversationExtraction,
  actionInstance
} from '../../../lib/db/schema';
import { getSession } from '../../../lib/session';
import { generateCallSummary } from '../../../lib/call-summarizer';
import { GROQ_MODELS } from '../../../lib/groq';

export const prerender = false;

/**
 * GET /api/actions/summarize
 * Returns call summaries. Supports ?conversationId for a specific summary,
 * or ?agentId to list summaries scoped to an agent.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const db = getDatabase();
  const userId = session.user.id;
  const conversationId = url.searchParams.get('conversationId');
  const agentId = url.searchParams.get('agentId');
  const limitParam = Math.min(Number(url.searchParams.get('limit')) || 30, 100);

  if (conversationId) {
    // Single summary by conversation
    const [summary] = await db.select().from(callSummary)
      .where(and(eq(callSummary.userId, userId), eq(callSummary.conversationId, conversationId)))
      .limit(1);

    if (!summary) {
      return Response.json({ error: 'No summary found for this conversation.' }, { status: 404 });
    }

    // Enrich with conversation record for full transcript
    const [conv] = await db.select().from(conversationRecord)
      .where(and(eq(conversationRecord.id, conversationId), eq(conversationRecord.userId, userId)))
      .limit(1);

    const [extraction] = await db.select().from(conversationExtraction)
      .where(and(eq(conversationExtraction.conversationId, conversationId), eq(conversationExtraction.userId, userId)))
      .limit(1);

    const actions = await db.select().from(actionInstance)
      .where(and(eq(actionInstance.conversationId, conversationId), eq(actionInstance.userId, userId)));

    return Response.json({
      summary,
      conversation: conv || null,
      extraction: extraction || null,
      actions
    });
  }

  // List recent summaries (optionally scoped to agent)
  const baseConditions = [eq(callSummary.userId, userId)];
  if (agentId) baseConditions.push(eq(callSummary.agentId, agentId));

  const summaries = await db.select().from(callSummary)
    .where(and(...baseConditions))
    .orderBy(desc(callSummary.createdAt))
    .limit(limitParam);

  const convIds = summaries.map(s => s.conversationId);
  let extractions: any[] = [];
  let actionsByConv = new Map<string, any[]>();

  if (convIds.length > 0) {
    extractions = await db.select().from(conversationExtraction)
      .where(and(eq(conversationExtraction.userId, userId), inArray(conversationExtraction.conversationId, convIds)));

    const instances = await db.select().from(actionInstance)
      .where(and(eq(actionInstance.userId, userId), inArray(actionInstance.conversationId, convIds)));

    for (const inst of instances) {
      const list = actionsByConv.get(inst.conversationId) || [];
      list.push(inst);
      actionsByConv.set(inst.conversationId, list);
    }
  }

  const extractionMap = new Map(extractions.map(e => [e.conversationId, e]));

  const enriched = summaries.map(s => ({
    ...s,
    extraction: extractionMap.get(s.conversationId) || null,
    actions: actionsByConv.get(s.conversationId) || []
  }));

  return Response.json({ summaries: enriched });
};

/**
 * POST /api/actions/summarize
 * Triggers AI summarization for an existing conversation record.
 * Idempotent: returns existing summary if already processed.
 * Body: { conversationId: string, model?: string }
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
  if (!conversationId) {
    return Response.json({ error: 'conversationId is required.' }, { status: 400 });
  }

  const db = getDatabase();
  const userId = session.user.id;

  // Verify conversation ownership
  const [conv] = await db.select().from(conversationRecord)
    .where(and(eq(conversationRecord.id, conversationId), eq(conversationRecord.userId, userId)))
    .limit(1);

  if (!conv) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  // Idempotency: if a completed summary already exists, return it
  const [existing] = await db.select().from(callSummary)
    .where(and(eq(callSummary.conversationId, conversationId), eq(callSummary.userId, userId)))
    .limit(1);

  if (existing && existing.status === 'completed') {
    return Response.json({ summary: existing, cached: true });
  }

  if (!conv.rawTranscriptText || !conv.rawTranscriptText.trim()) {
    return Response.json({ error: 'Conversation has no transcript available for summarization.' }, { status: 400 });
  }

  const model = typeof body.model === 'string' && body.model ? body.model : GROQ_MODELS.primary;

  let summaryResult;
  try {
    summaryResult = await generateCallSummary(conv.rawTranscriptText, model);
  } catch (error) {
    // Persist failed record so we don't retry endlessly on bad data
    const failedId = existing?.id || crypto.randomUUID();
    const now = new Date();
    const failedRecord = {
      id: failedId,
      userId,
      conversationId,
      agentId: conv.agentId || null,
      title: 'Summarization Failed',
      executiveSummary: 'Summarization encountered an error. Transcript was recorded.',
      customerIntent: '[Unavailable]',
      keyDiscussionPoints: [] as any,
      customerRequirements: [] as any,
      callOutcome: '[Error during AI processing]',
      importantCommitments: [] as any,
      followUpTasks: [] as any,
      unresolvedIssues: ['Summarization failed due to processing error.'] as any,
      extractedEntities: [] as any,
      groqModel: model,
      rawModelOutput: error instanceof Error ? error.message : String(error),
      status: 'failed' as const,
      createdAt: now,
      updatedAt: now
    };
    if (existing) {
      await db.update(callSummary).set({ ...failedRecord }).where(eq(callSummary.id, existing.id));
    } else {
      await db.insert(callSummary).values(failedRecord);
    }
    return Response.json({
      error: error instanceof Error ? error.message : 'Summarization failed.',
      conversationId
    }, { status: 502 });
  }

  const now = new Date();
  const summaryId = existing?.id || crypto.randomUUID();

  const summaryRecord = {
    id: summaryId,
    userId,
    conversationId,
    agentId: conv.agentId || null,
    title: summaryResult.title,
    executiveSummary: summaryResult.executiveSummary,
    customerIntent: summaryResult.customerIntent,
    keyDiscussionPoints: summaryResult.keyDiscussionPoints as any,
    customerRequirements: summaryResult.customerRequirements as any,
    callOutcome: summaryResult.callOutcome,
    importantCommitments: summaryResult.importantCommitments as any,
    followUpTasks: summaryResult.followUpTasks as any,
    unresolvedIssues: summaryResult.unresolvedIssues as any,
    extractedEntities: summaryResult.extractedEntities as any,
    groqModel: summaryResult.groqModel,
    rawModelOutput: summaryResult.rawModelOutput,
    status: 'completed' as const,
    createdAt: now,
    updatedAt: now
  };

  if (existing) {
    await db.update(callSummary).set(summaryRecord).where(eq(callSummary.id, existing.id));
  } else {
    await db.insert(callSummary).values(summaryRecord);
  }

  return Response.json({ summary: summaryRecord, cached: false }, { status: 201 });
};
