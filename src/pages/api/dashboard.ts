import type { APIRoute } from 'astro';
import { and, count, eq } from 'drizzle-orm';
import { getDatabase } from '../../lib/db';
import { actionInstance, agent, conversationRecord, testRun, workspace } from '../../lib/db/schema';
import { getSession } from '../../lib/session';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const currentSession = await getSession(request);
  if (!currentSession?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const db = getDatabase();
  const userId = currentSession.user.id;

  const [storedWorkspace] = await db.select().from(workspace).where(eq(workspace.userId, userId)).limit(1);
  const [{ agentCount }] = await db.select({ agentCount: count() }).from(agent).where(eq(agent.userId, userId));
  const [{ deployedCount }] = await db.select({ deployedCount: count() }).from(agent).where(and(eq(agent.userId, userId), eq(agent.status, 'deployed')));
  const [{ draftCount }] = await db.select({ draftCount: count() }).from(agent).where(and(eq(agent.userId, userId), eq(agent.status, 'draft')));
  const [{ testRunCount }] = await db.select({ testRunCount: count() }).from(testRun).where(eq(testRun.userId, userId));

  const [{ totalConversations }] = await db.select({ totalConversations: count() }).from(conversationRecord).where(eq(conversationRecord.userId, userId));
  const [{ pendingActionsCount }] = await db.select({ pendingActionsCount: count() }).from(actionInstance).where(and(eq(actionInstance.userId, userId), eq(actionInstance.status, 'awaiting_approval')));
  const [{ executedActionsCount }] = await db.select({ executedActionsCount: count() }).from(actionInstance).where(and(eq(actionInstance.userId, userId), eq(actionInstance.status, 'completed')));

  const runs = await db.select({ result: testRun.result }).from(testRun).where(eq(testRun.userId, userId));
  const scores = runs.map((run) => (run.result as { overallScore?: unknown })?.overallScore).filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
  const readinessScore = scores.length > 0 ? Math.round(scores.reduce((total, value) => total + value, 0) / scores.length) : null;

  return Response.json({
    user: { name: currentSession.user.name, email: currentSession.user.email },
    workspace: { name: storedWorkspace?.name || `${currentSession.user.name}'s workspace` },
    agents: { total: Number(agentCount), deployed: Number(deployedCount), drafts: Number(draftCount) },
    conversations: { count: Number(totalConversations), available: true },
    actions: {
      pending: Number(pendingActionsCount),
      completed: Number(executedActionsCount)
    },
    readiness: { score: readinessScore, testRuns: Number(testRunCount) },
    integration: { elevenLabs: false }
  });
};

