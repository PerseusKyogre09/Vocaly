import type { APIRoute } from 'astro';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import {
  actionDefinition,
  actionExecution,
  actionInstance,
  actionSchema,
  agent,
  conversationExtraction,
  conversationRecord
} from '../../../lib/db/schema';
import { getSession } from '../../../lib/session';
import { extractConversationData, DEFAULT_APPOINTMENT_SCHEMA_FIELDS, type FieldDefinition } from '../../../lib/conversation-extractor';
import { resolveTemplate, redactSecrets } from '../../../lib/action-engine';

export const prerender = false;

/**
 * GET /api/actions/conversations
 * Lists past conversations with their extraction summaries and action counts.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const agentId = url.searchParams.get('agentId');
  const db = getDatabase();

  const convQuery = agentId
    ? db.select().from(conversationRecord).where(and(eq(conversationRecord.userId, session.user.id), eq(conversationRecord.agentId, agentId))).orderBy(desc(conversationRecord.createdAt)).limit(50)
    : db.select().from(conversationRecord).where(eq(conversationRecord.userId, session.user.id)).orderBy(desc(conversationRecord.createdAt)).limit(50);

  const conversations = await convQuery;
  const convIds = conversations.map(c => c.id);

  if (convIds.length === 0) {
    return Response.json({ conversations: [] });
  }

  const extractions = await db.select().from(conversationExtraction)
    .where(and(eq(conversationExtraction.userId, session.user.id), inArray(conversationExtraction.conversationId, convIds)));

  const instances = await db.select().from(actionInstance)
    .where(and(eq(actionInstance.userId, session.user.id), inArray(actionInstance.conversationId, convIds)));

  const extractionMap = new Map(extractions.map(e => [e.conversationId, e]));
  const instancesMap = new Map<string, typeof instances>();
  for (const inst of instances) {
    const list = instancesMap.get(inst.conversationId) || [];
    list.push(inst);
    instancesMap.set(inst.conversationId, list);
  }

  const enriched = conversations.map(c => ({
    ...c,
    extraction: extractionMap.get(c.id) || null,
    actions: instancesMap.get(c.id) || []
  }));

  return Response.json({ conversations: enriched });
};

/**
 * POST /api/actions/process-conversation
 * Processes a conversation transcript:
 * 1. Persists conversation record
 * 2. Extracts structured information via Groq
 * 3. Evaluates action definitions and generates proposed action instances with safe template rendering
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const transcriptText = typeof body.transcript === 'string' ? body.transcript.trim() : '';
  if (!transcriptText) {
    return Response.json({ error: 'Conversation transcript is required.' }, { status: 400 });
  }

  const agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId : null;
  const source = ['manual_test', 'elevenlabs', 'phone_call'].includes(body.source) ? body.source : 'manual_test';
  const externalConversationId = typeof body.externalConversationId === 'string' ? body.externalConversationId.trim() : null;
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  const db = getDatabase();

  // If agentId provided, verify ownership
  let agentName = 'General Assistant';
  if (agentId) {
    const [ownedAgent] = await db.select().from(agent)
      .where(and(eq(agent.id, agentId), eq(agent.userId, session.user.id))).limit(1);
    if (!ownedAgent) {
      return Response.json({ error: 'Specified agent does not belong to this account.' }, { status: 404 });
    }
    agentName = ownedAgent.name;
  }

  // Find matching extraction schema for this agent or default
  let schemaFields: FieldDefinition[] = DEFAULT_APPOINTMENT_SCHEMA_FIELDS;
  let schemaId: string | null = null;

  if (agentId) {
    const [agentSchema] = await db.select().from(actionSchema)
      .where(and(eq(actionSchema.userId, session.user.id), eq(actionSchema.agentId, agentId))).limit(1);
    if (agentSchema && Array.isArray(agentSchema.fields) && agentSchema.fields.length > 0) {
      schemaFields = agentSchema.fields as FieldDefinition[];
      schemaId = agentSchema.id;
    }
  }

  if (!schemaId) {
    // Check for user-level default schema
    const [defaultSchema] = await db.select().from(actionSchema)
      .where(and(eq(actionSchema.userId, session.user.id), eq(actionSchema.isDefault, true))).limit(1);
    if (defaultSchema && Array.isArray(defaultSchema.fields) && defaultSchema.fields.length > 0) {
      schemaFields = defaultSchema.fields as FieldDefinition[];
      schemaId = defaultSchema.id;
    }
  }

  const now = new Date();
  const conversationId = crypto.randomUUID();

  // Insert conversation record
  await db.insert(conversationRecord).values({
    id: conversationId,
    userId: session.user.id,
    agentId,
    source,
    externalConversationId,
    transcript: Array.isArray(body.messages) ? body.messages : [],
    rawTranscriptText: transcriptText,
    metadata: { ...metadata, agentName },
    status: 'processing',
    createdAt: now,
    updatedAt: now
  });

  // Perform Groq extraction
  let extractionResult;
  try {
    const model = typeof body.model === 'string' ? body.model : undefined;
    extractionResult = await extractConversationData(transcriptText, schemaFields, model);
  } catch (error) {
    await db.update(conversationRecord).set({ status: 'failed', updatedAt: new Date() })
      .where(eq(conversationRecord.id, conversationId));
    return Response.json({
      error: error instanceof Error ? error.message : 'Extraction failed.',
      conversationId
    }, { status: 502 });
  }

  // Persist extraction
  const extractionId = crypto.randomUUID();
  await db.insert(conversationExtraction).values({
    id: extractionId,
    userId: session.user.id,
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

  // Prepare variable dictionary for template resolution
  const variables: Record<string, unknown> = {
    conversationId,
    agentId: agentId || '',
    agentName,
    summary: extractionResult.summary,
    intent: extractionResult.intent,
    uncertainties: extractionResult.uncertainties,
    timestamp: now.toISOString()
  };

  for (const field of extractionResult.fields) {
    variables[field.name] = field.value;
  }

  // Find all active action definitions applicable to this agent or user
  const definitions = await db.select().from(actionDefinition)
    .where(and(
      eq(actionDefinition.userId, session.user.id),
      eq(actionDefinition.enabled, true)
    ));

  const applicableDefs = definitions.filter(d => !d.agentId || d.agentId === agentId);

  // If no definitions exist yet, generate a default appointment creation action for demonstration
  let targetDefinitions = applicableDefs;
  if (targetDefinitions.length === 0) {
    const defaultDefId = crypto.randomUUID();
    const defaultDef = {
      id: defaultDefId,
      userId: session.user.id,
      agentId,
      name: 'Book Appointment & Notify Staff',
      description: 'Default automated workflow for scheduled appointments',
      actionType: 'webhook',
      requiresApproval: true,
      enabled: true,
      triggerConditions: { allRequiredPresent: true },
      webhookConfig: {
        url: 'https://httpbin.org/post', // Safe external mock echo service for testing
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyMapping: {
          event: 'voice_appointment_booked',
          customer_name: '{{customer_name}}',
          phone: '{{phone}}',
          appointment_date: '{{appointment_date}}',
          appointment_time: '{{appointment_time}}',
          service: '{{service}}',
          intent: '{{intent}}',
          notes: '{{notes}}'
        },
        timeoutMs: 8000,
        retryLimit: 1
      },
      createdAt: now,
      updatedAt: now
    };
    await db.insert(actionDefinition).values(defaultDef);
    targetDefinitions = [defaultDef as any];
  }

  // Create action instances
  const createdInstances: Array<typeof actionInstance.$inferSelect> = [];
  for (const def of targetDefinitions) {
    const instanceId = crypto.randomUUID();
    const idempotencyKey = `${conversationId}_${def.id}_${now.getTime()}`;

    const config = (def.webhookConfig as any) || {};
    const bodyMapping = config.bodyMapping || {};

    // Safely resolve mustache templates
    const resolvedPayload = resolveTemplate(bodyMapping, variables) as Record<string, unknown>;

    const status = def.requiresApproval ? 'awaiting_approval' : 'approved';

    const instRecord = {
      id: instanceId,
      userId: session.user.id,
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

  // Update conversation record to extracted
  await db.update(conversationRecord).set({ status: 'extracted', updatedAt: new Date() })
    .where(eq(conversationRecord.id, conversationId));

  return Response.json({
    conversationId,
    extraction: {
      id: extractionId,
      summary: extractionResult.summary,
      intent: extractionResult.intent,
      fields: extractionResult.fields,
      uncertainties: extractionResult.uncertainties
    },
    actions: createdInstances.map(inst => ({
      ...inst,
      payload: redactSecrets(inst.payload)
    }))
  }, { status: 201 });
};
