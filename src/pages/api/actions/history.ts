import type { APIRoute } from 'astro';
import { and, count, desc, eq, inArray, gte, lte } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import {
  actionDefinition,
  actionExecution,
  actionInstance,
  conversationExtraction,
  conversationRecord
} from '../../../lib/db/schema';
import { getSession } from '../../../lib/session';

export const prerender = false;

/**
 * GET /api/actions/history
 * Returns:
 * 1. Summary metrics (real aggregated numbers from the database):
 *    - totalConversations
 *    - awaitingApprovalCount
 *    - completedCount
 *    - failedCount
 *    - totalExecutions
 * 2. Execution history log with filterable parameters:
 *    - status: 'all' | 'success' | 'failed' | 'timeout'
 *    - agentId
 *    - fromDate / toDate
 *    - limit / offset
 */
export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const db = getDatabase();
  const userId = session.user.id;

  // Real database metrics
  const [{ totalConversations }] = await db.select({ totalConversations: count() })
    .from(conversationRecord).where(eq(conversationRecord.userId, userId));

  const [{ awaitingApprovalCount }] = await db.select({ awaitingApprovalCount: count() })
    .from(actionInstance).where(and(eq(actionInstance.userId, userId), eq(actionInstance.status, 'awaiting_approval')));

  const [{ completedCount }] = await db.select({ completedCount: count() })
    .from(actionInstance).where(and(eq(actionInstance.userId, userId), eq(actionInstance.status, 'completed')));

  const [{ failedCount }] = await db.select({ failedCount: count() })
    .from(actionInstance).where(and(eq(actionInstance.userId, userId), eq(actionInstance.status, 'failed')));

  const [{ totalExecutions }] = await db.select({ totalExecutions: count() })
    .from(actionExecution).where(eq(actionExecution.userId, userId));

  // History query filters
  const statusFilter = url.searchParams.get('status');
  const agentId = url.searchParams.get('agentId');
  const fromDate = url.searchParams.get('fromDate');
  const toDate = url.searchParams.get('toDate');
  const limit = Math.min(Number(url.searchParams.get('limit')) || 30, 100);

  const execConditions = [eq(actionExecution.userId, userId)];
  if (statusFilter && statusFilter !== 'all') {
    execConditions.push(eq(actionExecution.status, statusFilter));
  }
  if (fromDate) {
    execConditions.push(gte(actionExecution.startedAt, new Date(fromDate)));
  }
  if (toDate) {
    execConditions.push(lte(actionExecution.startedAt, new Date(toDate)));
  }

  const executions = await db.select().from(actionExecution)
    .where(and(...execConditions))
    .orderBy(desc(actionExecution.startedAt))
    .limit(limit);

  const instanceIds = [...new Set(executions.map(e => e.actionInstanceId))];
  let instanceMap = new Map();
  let convMap = new Map();
  let extMap = new Map();

  if (instanceIds.length > 0) {
    const instances = await db.select().from(actionInstance)
      .where(and(eq(actionInstance.userId, userId), inArray(actionInstance.id, instanceIds)));
    instanceMap = new Map(instances.map(i => [i.id, i]));

    const convIds = [...new Set(instances.map(i => i.conversationId))];
    if (convIds.length > 0) {
      const convs = await db.select().from(conversationRecord).where(inArray(conversationRecord.id, convIds));
      convMap = new Map(convs.map(c => [c.id, c]));

      const exts = await db.select().from(conversationExtraction).where(inArray(conversationExtraction.conversationId, convIds));
      extMap = new Map(exts.map(e => [e.conversationId, e]));
    }
  }

  const history = executions.map(exec => {
    const instance = instanceMap.get(exec.actionInstanceId) || null;
    const conversation = instance ? convMap.get(instance.conversationId) || null : null;
    const extraction = instance ? extMap.get(instance.conversationId) || null : null;

    return {
      ...exec,
      instance,
      conversation,
      extraction
    };
  });

  return Response.json({
    metrics: {
      totalConversations: Number(totalConversations),
      awaitingApprovalCount: Number(awaitingApprovalCount),
      completedCount: Number(completedCount),
      failedCount: Number(failedCount),
      totalExecutions: Number(totalExecutions)
    },
    history
  });
};
