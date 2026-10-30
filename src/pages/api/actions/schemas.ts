import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { actionSchema } from '../../../lib/db/schema';
import { getSession } from '../../../lib/session';
import { DEFAULT_APPOINTMENT_SCHEMA_FIELDS, type FieldDefinition } from '../../../lib/conversation-extractor';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const agentId = url.searchParams.get('agentId');
  const db = getDatabase();

  const query = agentId
    ? db.select().from(actionSchema).where(and(eq(actionSchema.userId, session.user.id), eq(actionSchema.agentId, agentId))).orderBy(desc(actionSchema.updatedAt))
    : db.select().from(actionSchema).where(eq(actionSchema.userId, session.user.id)).orderBy(desc(actionSchema.updatedAt));

  const schemas = await query;

  // Provide starter default schema if none exists
  return Response.json({
    schemas,
    defaultFields: DEFAULT_APPOINTMENT_SCHEMA_FIELDS
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'Schema name is required.' }, { status: 400 });

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const agentId = typeof body.agentId === 'string' && body.agentId ? body.agentId : null;
  const isDefault = Boolean(body.isDefault);

  const rawFields = Array.isArray(body.fields) ? body.fields : DEFAULT_APPOINTMENT_SCHEMA_FIELDS;
  const validatedFields: FieldDefinition[] = rawFields.map((f: any) => ({
    name: String(f.name || '').trim().replace(/[^a-zA-Z0-9_]/g, '_'),
    type: ['string', 'number', 'boolean', 'date', 'time', 'email', 'phone', 'object', 'array'].includes(f.type) ? f.type : 'string',
    description: String(f.description || '').trim(),
    required: Boolean(f.required),
    default: f.default !== undefined ? f.default : null
  })).filter((f: any) => f.name.length > 0);

  if (validatedFields.length === 0) {
    return Response.json({ error: 'At least one field definition is required.' }, { status: 400 });
  }

  const now = new Date();
  const id = crypto.randomUUID();

  const newRecord = {
    id,
    userId: session.user.id,
    agentId,
    name,
    description,
    fields: validatedFields,
    isDefault,
    createdAt: now,
    updatedAt: now
  };

  await getDatabase().insert(actionSchema).values(newRecord);

  return Response.json({ schema: newRecord }, { status: 201 });
};

export const PUT: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Schema ID is required.' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'Schema name is required.' }, { status: 400 });

  const rawFields = Array.isArray(body.fields) ? body.fields : [];
  const validatedFields: FieldDefinition[] = rawFields.map((f: any) => ({
    name: String(f.name || '').trim().replace(/[^a-zA-Z0-9_]/g, '_'),
    type: ['string', 'number', 'boolean', 'date', 'time', 'email', 'phone', 'object', 'array'].includes(f.type) ? f.type : 'string',
    description: String(f.description || '').trim(),
    required: Boolean(f.required),
    default: f.default !== undefined ? f.default : null
  })).filter((f: any) => f.name.length > 0);

  const [updated] = await getDatabase().update(actionSchema).set({
    name,
    description: typeof body.description === 'string' ? body.description.trim() : '',
    agentId: typeof body.agentId === 'string' && body.agentId ? body.agentId : null,
    fields: validatedFields,
    isDefault: Boolean(body.isDefault),
    updatedAt: new Date()
  }).where(and(eq(actionSchema.id, id), eq(actionSchema.userId, session.user.id))).returning();

  if (!updated) {
    return Response.json({ error: 'Schema not found.' }, { status: 404 });
  }

  return Response.json({ schema: updated });
};

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' ? body.id : '';
  if (!id) return Response.json({ error: 'Schema ID is required.' }, { status: 400 });

  const deleted = await getDatabase().delete(actionSchema)
    .where(and(eq(actionSchema.id, id), eq(actionSchema.userId, session.user.id)))
    .returning({ id: actionSchema.id });

  if (!deleted.length) {
    return Response.json({ error: 'Schema not found.' }, { status: 404 });
  }

  return Response.json({ ok: true });
};
