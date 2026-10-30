import type { APIRoute } from 'astro';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import {
  actionDefinition,
  actionExecution,
  actionInstance,
  conversationExtraction,
  conversationRecord
} from '../../../lib/db/schema';
import { getSession } from '../../../lib/session';
import { executeWebhook, redactSecrets } from '../../../lib/action-engine';

export const prerender = false;

/**
 * GET /api/actions/instances
 * Lists action instances (filter by status e.g. 'awaiting_approval', 'approved', 'all')
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const statusFilter = url.searchParams.get('status');
  const conversationId = url.searchParams.get('conversationId');
  const db = getDatabase();

  const conditions = [eq(actionInstance.userId, session.user.id)];
  if (statusFilter && statusFilter !== 'all') {
    conditions.push(eq(actionInstance.status, statusFilter));
  }
  if (conversationId) {
    conditions.push(eq(actionInstance.conversationId, conversationId));
  }

  const instances = await db.select().from(actionInstance)
    .where(and(...conditions))
    .orderBy(desc(actionInstance.createdAt))
    .limit(100);

  const convIds = [...new Set(instances.map(i => i.conversationId))];

  let convMap = new Map();
  let extMap = new Map();

  if (convIds.length > 0) {
    const convs = await db.select().from(conversationRecord).where(inArray(conversationRecord.id, convIds));
    convMap = new Map(convs.map(c => [c.id, c]));

    const exts = await db.select().from(conversationExtraction).where(inArray(conversationExtraction.conversationId, convIds));
    extMap = new Map(exts.map(e => [e.conversationId, e]));
  }

  const enriched = instances.map(inst => ({
    ...inst,
    payload: redactSecrets(inst.payload),
    conversation: convMap.get(inst.conversationId) || null,
    extraction: extMap.get(inst.conversationId) || null
  }));

  return Response.json({ instances: enriched });
};

/**
 * POST /api/actions/instances
 * Handles approval workflow operations:
 * - 'approve': Approves an action and executes it immediately
 * - 'reject': Rejects an action with optional reason
 * - 'approve_all': Approves all pending actions
 * - 'edit_payload': Allows user to correct extracted payload fields before approval
 * - 'retry': Safely retries a failed action
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const action = body.action;
  const instanceId = typeof body.instanceId === 'string' ? body.instanceId : '';
  const db = getDatabase();

  // Approve All
  if (action === 'approve_all') {
    const pending = await db.select().from(actionInstance)
      .where(and(eq(actionInstance.userId, session.user.id), eq(actionInstance.status, 'awaiting_approval')));

    const results = [];
    for (const inst of pending) {
      const executionResult = await executeApprovedAction(inst, session.user.id, session.user.email || session.user.name);
      results.push(executionResult);
    }

    return Response.json({
      approvedCount: pending.length,
      results
    });
  }

  if (!instanceId) {
    return Response.json({ error: 'Instance ID is required.' }, { status: 400 });
  }

  const [instance] = await db.select().from(actionInstance)
    .where(and(eq(actionInstance.id, instanceId), eq(actionInstance.userId, session.user.id))).limit(1);

  if (!instance) {
    return Response.json({ error: 'Action instance not found.' }, { status: 404 });
  }

  // Reject Action
  if (action === 'reject') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : 'Rejected by user';
    const [updated] = await db.update(actionInstance).set({
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: new Date()
    }).where(and(eq(actionInstance.id, instanceId), eq(actionInstance.userId, session.user.id))).returning();

    return Response.json({ instance: updated });
  }

  // Edit Payload Before Approval
  if (action === 'edit_payload') {
    if (instance.status !== 'awaiting_approval' && instance.status !== 'draft') {
      return Response.json({ error: 'Cannot edit payload of an action that has already run or been rejected.' }, { status: 409 });
    }

    const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};
    const [updated] = await db.update(actionInstance).set({
      payload,
      updatedAt: new Date()
    }).where(and(eq(actionInstance.id, instanceId), eq(actionInstance.userId, session.user.id))).returning();

    return Response.json({ instance: updated });
  }

  // Approve & Execute Action
  if (action === 'approve') {
    if (instance.status === 'completed') {
      return Response.json({ error: 'Action has already completed successfully.' }, { status: 409 });
    }
    if (instance.status === 'running') {
      return Response.json({ error: 'Action is currently executing.' }, { status: 409 });
    }

    const result = await executeApprovedAction(instance, session.user.id, session.user.email || session.user.name);
    return Response.json(result);
  }

  // Retry Action
  if (action === 'retry') {
    if (instance.status !== 'failed') {
      return Response.json({ error: 'Only failed actions can be retried.' }, { status: 409 });
    }

    const result = await executeApprovedAction(instance, session.user.id, session.user.email || session.user.name);
    return Response.json(result);
  }

  return Response.json({ error: 'Unsupported action type.' }, { status: 400 });
};

/**
 * Executes an action instance server-side, records execution history,
 * updates action instance status, and enforces secret redaction.
 */
async function executeApprovedAction(
  instance: typeof actionInstance.$inferSelect,
  userId: string,
  approver: string
) {
  const db = getDatabase();
  const now = new Date();

  // Mark as approved & running
  await db.update(actionInstance).set({
    status: 'running',
    approvedAt: instance.approvedAt || now,
    approvedBy: instance.approvedBy || approver,
    updatedAt: now
  }).where(and(eq(actionInstance.id, instance.id), eq(actionInstance.userId, userId)));

  // Load action definition if exists to get webhook credentials/url
  let webhookUrl = 'https://httpbin.org/post';
  let method: 'GET' | 'POST' | 'PUT' | 'PATCH' = 'POST';
  let headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let timeoutMs = 8000;

  if (instance.actionDefinitionId) {
    const [def] = await db.select().from(actionDefinition)
      .where(and(eq(actionDefinition.id, instance.actionDefinitionId), eq(actionDefinition.userId, userId))).limit(1);

    if (def && def.webhookConfig) {
      const cfg = def.webhookConfig as any;
      if (cfg.url) webhookUrl = cfg.url;
      if (cfg.method) method = cfg.method;
      if (cfg.headers) headers = { ...headers, ...cfg.headers };
      if (cfg.timeoutMs) timeoutMs = cfg.timeoutMs;
    }
  }

  // Count past attempts
  const pastExecutions = await db.select().from(actionExecution)
    .where(and(eq(actionExecution.actionInstanceId, instance.id), eq(actionExecution.userId, userId)));
  const attemptNumber = pastExecutions.length + 1;

  // Execute webhook
  const execStart = new Date();
  const execResult = await executeWebhook({
    url: webhookUrl,
    method,
    headers,
    body: instance.payload,
    timeoutMs
  });
  const execEnd = new Date();

  const executionRecordId = crypto.randomUUID();
  const statusString = execResult.success ? 'success' : (execResult.error?.includes('timed out') ? 'timeout' : 'failed');

  await db.insert(actionExecution).values({
    id: executionRecordId,
    userId,
    actionInstanceId: instance.id,
    attemptNumber,
    status: statusString,
    requestUrl: execResult.requestUrl,
    requestMethod: execResult.requestMethod,
    requestHeadersRedacted: execResult.requestHeadersRedacted,
    requestPayloadRedacted: execResult.requestPayloadRedacted as any,
    responseStatus: execResult.status || null,
    responseBodySnippet: execResult.responseBodySnippet || null,
    errorMessage: execResult.error || null,
    durationMs: execResult.durationMs,
    startedAt: execStart,
    completedAt: execEnd
  });

  // Final instance status
  const finalStatus = execResult.success ? 'completed' : 'failed';
  const [finalInstance] = await db.update(actionInstance).set({
    status: finalStatus,
    updatedAt: execEnd
  }).where(and(eq(actionInstance.id, instance.id), eq(actionInstance.userId, userId))).returning();

  return {
    instance: finalInstance,
    execution: {
      id: executionRecordId,
      status: statusString,
      responseStatus: execResult.status,
      durationMs: execResult.durationMs,
      error: execResult.error,
      responseBodySnippet: execResult.responseBodySnippet,
      requestPayloadRedacted: execResult.requestPayloadRedacted
    }
  };
}
