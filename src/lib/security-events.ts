import { sql } from 'drizzle-orm';
import { getDatabase } from './db';
import { securityEvent, userRateLimit } from './db/schema';

type SecurityEventInput = {
  eventType: string;
  userId?: string | null;
  agentId?: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  detectionResult: string;
  actionTaken: string;
};

export async function recordSecurityEvent(input: SecurityEventInput) {
  const eventType = input.eventType.slice(0, 80);
  const detectionResult = input.detectionResult.slice(0, 240);
  const actionTaken = input.actionTaken.slice(0, 240);
  await getDatabase().insert(securityEvent).values({
    id: crypto.randomUUID(), eventType, userId: input.userId || null, agentId: input.agentId || null,
    severity: input.severity, detectionResult, actionTaken, createdAt: new Date()
  });
  console.info(JSON.stringify({ component: 'security', event: eventType, userId: input.userId || null, agentId: input.agentId || null, severity: input.severity, detectionResult, actionTaken }));
}

export async function takeRateLimit(userId: string, scope: string, maximum: number) {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [bucket] = await getDatabase().insert(userRateLimit).values({
    id: crypto.randomUUID(), userId, scope, windowStart, hits: 1
  }).onConflictDoUpdate({
    target: [userRateLimit.userId, userRateLimit.scope],
    set: {
      hits: sql`case when ${userRateLimit.windowStart} < ${windowStart} then 1 else ${userRateLimit.hits} + 1 end`,
      windowStart
    }
  }).returning({ hits: userRateLimit.hits });
  const allowed = (bucket?.hits || 0) <= maximum;
  if (!allowed && bucket?.hits === maximum + 1) {
    await recordSecurityEvent({ eventType: 'rate_limit_exceeded', userId, severity: 'medium', detectionResult: `${scope} exceeded ${maximum} requests in one minute`, actionTaken: 'request_rejected' });
  }
  return allowed;
}

export async function recordUnauthorizedResourceAccess(userId: string | null, agentId: string | null, eventType = 'unauthorized_agent_access') {
  await recordSecurityEvent({ eventType, userId, agentId, severity: 'high', detectionResult: 'Requested resource is not owned by authenticated user', actionTaken: 'request_rejected' });
}
