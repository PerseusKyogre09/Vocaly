import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { actionDefinition } from '../../../lib/db/schema';
import { getSession } from '../../../lib/session';
import { validateWebhookUrl, redactSecrets } from '../../../lib/action-engine';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const agentId = url.searchParams.get('agentId');
  const db = getDatabase();

  const query = agentId
    ? db.select().from(actionDefinition).where(and(eq(actionDefinition.userId, session.user.id), eq(actionDefinition.agentId, agentId))).orderBy(desc(actionDefinition.updatedAt))
    : db.select().from(actionDefinition).where(eq(actionDefinition.userId, session.user.id)).orderBy(desc(actionDefinition.updatedAt));

  const definitions = await query;

  // Mask sensitive headers in webhookConfig for response security
  const safeDefinitions = definitions.map(def => {
    const config = (def.webhookConfig as any) || {};
    return {
      ...def,
      webhookConfig: {
        ...config,
        headers: redactSecrets(config.headers || {})
      }
    };
  });

  return Response.json({ definitions: safeDefinitions });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'Action name is required.' }, { status: 400 });

  const actionType = ['webhook', 'internal_record', 'notification'].includes(body.actionType)
    ? body.actionType
    : 'webhook';

  const webhookConfig = body.webhookConfig && typeof body.webhookConfig === 'object' ? body.webhookConfig : {};

  // If webhook action, validate URL against SSRF
  if (actionType === 'webhook') {
    const url = typeof webhookConfig.url === 'string' ? webhookConfig.url.trim() : '';
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.valid) {
      return Response.json({ error: `Invalid webhook destination: ${urlValidation.error}` }, { status: 400 });
    }
  }

  const now = new Date();
  const id = crypto.randomUUID();

  const record = {
    id,
    userId: session.user.id,
    agentId: typeof body.agentId === 'string' && body.agentId ? body.agentId : null,
    name,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    actionType,
    requiresApproval: body.requiresApproval !== undefined ? Boolean(body.requiresApproval) : true,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
    triggerConditions: body.triggerConditions && typeof body.triggerConditions === 'object' ? body.triggerConditions : {},
    webhookConfig: {
      url: typeof webhookConfig.url === 'string' ? webhookConfig.url.trim() : '',
      method: ['GET', 'POST', 'PUT', 'PATCH'].includes(webhookConfig.method) ? webhookConfig.method : 'POST',
      headers: webhookConfig.headers && typeof webhookConfig.headers === 'object' ? webhookConfig.headers : {},
      bodyMapping: webhookConfig.bodyMapping && typeof webhookConfig.bodyMapping === 'object' ? webhookConfig.bodyMapping : {},
      timeoutMs: Number(webhookConfig.timeoutMs) || 8000,
      retryLimit: Number(webhookConfig.retryLimit) || 1
    },
    createdAt: now,
    updatedAt: now
  };

  await getDatabase().insert(actionDefinition).values(record);

  return Response.json({
    definition: {
      ...record,
      webhookConfig: {
        ...record.webhookConfig,
        headers: redactSecrets(record.webhookConfig.headers)
      }
    }
  }, { status: 201 });
};

export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Action Definition ID is required.' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'Action name is required.' }, { status: 400 });

  const actionType = ['webhook', 'internal_record', 'notification'].includes(body.actionType)
    ? body.actionType
    : 'webhook';

  const webhookConfig = body.webhookConfig && typeof body.webhookConfig === 'object' ? body.webhookConfig : {};
  if (actionType === 'webhook') {
    const url = typeof webhookConfig.url === 'string' ? webhookConfig.url.trim() : '';
    const urlValidation = validateWebhookUrl(url);
    if (!urlValidation.valid) {
      return Response.json({ error: `Invalid webhook destination: ${urlValidation.error}` }, { status: 400 });
    }
  }

  const [existing] = await getDatabase().select().from(actionDefinition)
    .where(and(eq(actionDefinition.id, id), eq(actionDefinition.userId, session.user.id))).limit(1);

  if (!existing) {
    return Response.json({ error: 'Action definition not found.' }, { status: 404 });
  }

  // Preserve existing secrets if [REDACTED] was sent back
  const existingHeaders = (existing.webhookConfig as any)?.headers || {};
  const incomingHeaders = webhookConfig.headers || {};
  const mergedHeaders: Record<string, string> = {};

  for (const [k, v] of Object.entries(incomingHeaders)) {
    if (v === '[REDACTED]' && existingHeaders[k]) {
      mergedHeaders[k] = existingHeaders[k];
    } else {
      mergedHeaders[k] = String(v);
    }
  }

  const [updated] = await getDatabase().update(actionDefinition).set({
    name,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    agentId: typeof body.agentId === 'string' && body.agentId ? body.agentId : null,
    actionType,
    requiresApproval: body.requiresApproval !== undefined ? Boolean(body.requiresApproval) : true,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : true,
    triggerConditions: body.triggerConditions && typeof body.triggerConditions === 'object' ? body.triggerConditions : {},
    webhookConfig: {
      url: typeof webhookConfig.url === 'string' ? webhookConfig.url.trim() : '',
      method: ['GET', 'POST', 'PUT', 'PATCH'].includes(webhookConfig.method) ? webhookConfig.method : 'POST',
      headers: mergedHeaders,
      bodyMapping: webhookConfig.bodyMapping && typeof webhookConfig.bodyMapping === 'object' ? webhookConfig.bodyMapping : {},
      timeoutMs: Number(webhookConfig.timeoutMs) || 8000,
      retryLimit: Number(webhookConfig.retryLimit) || 1
    },
    updatedAt: new Date()
  }).where(and(eq(actionDefinition.id, id), eq(actionDefinition.userId, session.user.id))).returning();

  return Response.json({
    definition: {
      ...updated,
      webhookConfig: {
        ...(updated.webhookConfig as any),
        headers: redactSecrets((updated.webhookConfig as any).headers)
      }
    }
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Action definition ID is required.' }, { status: 400 });

  const deleted = await getDatabase().delete(actionDefinition)
    .where(and(eq(actionDefinition.id, id), eq(actionDefinition.userId, session.user.id)))
    .returning({ id: actionDefinition.id });

  if (!deleted.length) {
    return Response.json({ error: 'Action definition not found.' }, { status: 404 });
  }

  return Response.json({ ok: true });
};
