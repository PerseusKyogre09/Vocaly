import type { APIRoute } from 'astro';
import { and, desc, eq } from 'drizzle-orm';
import { getDatabase } from '../../../lib/db';
import { agent, phoneCall } from '../../../lib/db/schema';
import { normalizePhoneNumber, signBridgeToken } from '../../../lib/phone';
import { getSession } from '../../../lib/session';
import { recordUnauthorizedResourceAccess, takeRateLimit } from '../../../lib/security-events';

export const prerender = false;

const exotelBase = (import.meta.env.EXOTEL_API_HOST || 'https://api.exotel.com/v1').replace(/\/$/, '');

class ExotelError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly providerBody: unknown
  ) {
    super(message);
    this.name = 'ExotelError';
  }
}

function config(name: string): string {
  const value = import.meta.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value.trim();
}

async function exotelCall(destination: string, streamUrl: string, statusCallback: string) {
  const accountSid = config('EXOTEL_ACCOUNT_SID');
  const credentials = `${config('EXOTEL_API_KEY')}:${config('EXOTEL_API_TOKEN')}`;
  const body = new URLSearchParams({
    From: destination,
    CallerId: config('EXOTEL_CALLER_ID'),
    StreamUrl: streamUrl,
    StreamType: 'bidirectional',
    StatusCallback: statusCallback
  });
  const response = await fetch(`${exotelBase}/Accounts/${encodeURIComponent(accountSid)}/Calls/connect`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  console.error(JSON.stringify({
    component: 'phone-call',
    event: 'exotel_response',
    url: `${exotelBase}/Accounts/[account]/Calls/connect`,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    body: sanitizeProviderBody(data)
  }));
  if (!response.ok) {
    const restException = data?.RestException;
    throw new ExotelError(
      restException?.Message || data?.message || data?.error || `Exotel returned ${response.status}`,
      response.status,
      restException?.Code || data?.code || null,
      data
    );
  }
  return data;
}

function bridgeSessionUrl(publicBridgeUrl: string, internalBridgeUrl?: string): string {
  const candidate = (internalBridgeUrl || publicBridgeUrl.replace(/^wss:/, 'https:')).replace(/\/$/, '');
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PHONE_BRIDGE_INTERNAL_URL must use http:// or https://.');
  }
  return `${parsed.origin}/sessions`;
}

function sanitizeBridgeResponse(text: string): string {
  return text
    .replace(/(authorization|api[-_ ]?key|token|secret|signed[_ -]?url)\s*["'=:[^,}\s]*/gi, '$1=[REDACTED]')
    .slice(0, 500);
}

function sanitizeProviderBody(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeBridgeResponse(value);
  if (!value || typeof value !== 'object') return value;
  const copy = JSON.parse(JSON.stringify(value));
  const redact = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(redact);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).map(([key, child]) => {
      if (/authorization|api[-_ ]?key|token|secret|signed[_ -]?url/i.test(key)) return [key, '[REDACTED]'];
      return [key, redact(child)];
    }));
  };
  return redact(copy);
}

async function provisionBridgeSession(publicBridgeUrl: string, internalBridgeUrl: string | undefined, callId: string, selectedAgent: typeof agent.$inferSelect, apiKey: string, secret: string) {
  const sessionUrl = bridgeSessionUrl(publicBridgeUrl, internalBridgeUrl);
  const response = await fetch(sessionUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      callId,
      agentId: selectedAgent.id,
      elevenLabsAgentId: selectedAgent.elevenLabsAgentId,
      firstMessage: selectedAgent.firstMessage,
      ...(apiKey ? { elevenLabsApiKey: apiKey } : {})
    })
  });
  const responseText = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let data: { error?: string } | null = null;
  try {
    data = JSON.parse(responseText);
  } catch {
    // The response details are included in the diagnostic below.
  }
  if (!response.ok || !data || data.error) {
    console.error(JSON.stringify({
      component: 'phone-call',
      event: 'bridge_session_provisioning_failed',
      url: sessionUrl,
      status: response.status,
      contentType,
      body: sanitizeBridgeResponse(responseText)
    }));
    throw new Error(data?.error || `Phone bridge returned ${response.status} while provisioning the session.`);
  }
  console.info(JSON.stringify({
    component: 'phone-call',
    event: 'bridge_session_provisioned',
    url: sessionUrl,
    status: response.status,
    contentType
  }));
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const calls = await getDatabase().select().from(phoneCall).where(eq(phoneCall.userId, session.user.id)).orderBy(desc(phoneCall.createdAt)).limit(50);
  return Response.json({ calls });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  if (!(await takeRateLimit(session.user.id, 'outbound_phone_call', 10))) return Response.json({ error: 'Call limit reached. Try again in a minute.' }, { status: 429 });
  const body = await request.json().catch(() => null);
  const agentId = body && typeof body === 'object' && typeof body.agentId === 'string' ? body.agentId : '';
  const elevenLabsApiKey = body && typeof body === 'object' && typeof body.elevenLabsApiKey === 'string' ? body.elevenLabsApiKey.trim() : '';
  try {
    if (elevenLabsApiKey && elevenLabsApiKey.length < 10) return Response.json({ error: 'The ElevenLabs API key is invalid. Reconnect it or place the call without agent audio.' }, { status: 400 });
    const destination = normalizePhoneNumber(body && typeof body === 'object' ? body.destination : '');
    const [selectedAgent] = await getDatabase().select().from(agent)
      .where(and(eq(agent.id, agentId), eq(agent.userId, session.user.id))).limit(1);
    if (!selectedAgent) {
      await recordUnauthorizedResourceAccess(session.user.id, agentId, 'unauthorized_agent_phone_call');
      return Response.json({ error: 'Agent not found.' }, { status: 404 });
    }
    if (selectedAgent.status !== 'deployed' || !selectedAgent.elevenLabsAgentId) {
      return Response.json({ error: 'Select a deployed agent before placing a call.' }, { status: 409 });
    }
    const bridgeSecret = config('PHONE_BRIDGE_SECRET');
    const callId = crypto.randomUUID();
    const token = signBridgeToken({ callId, agentId: selectedAgent.id, elevenLabsAgentId: selectedAgent.elevenLabsAgentId }, bridgeSecret);
    const bridgeUrl = config('PHONE_BRIDGE_PUBLIC_URL').replace(/\/$/, '');
    if (!bridgeUrl.startsWith('wss://')) throw new Error('PHONE_BRIDGE_PUBLIC_URL must be a public wss:// URL.');
    // Exotel accepts linear PCM16 mono and supports 8/16/24 kHz. Use 16 kHz
    // end-to-end with ElevenLabs' PCM16 telephony format to avoid needless resampling.
    const streamUrl = `${bridgeUrl}/ws?token=${encodeURIComponent(token)}&sample-rate=16000`;
    const appUrl = config('PUBLIC_APP_URL').replace(/\/$/, '');
    const callbackToken = signBridgeToken({ callId, agentId: selectedAgent.id, elevenLabsAgentId: selectedAgent.elevenLabsAgentId }, bridgeSecret, 86400);
    const statusCallback = `${appUrl}/api/phone/webhook?token=${encodeURIComponent(callbackToken)}`;
    const now = new Date();
    await getDatabase().insert(phoneCall).values({
      id: callId, userId: session.user.id, agentId: selectedAgent.id, destination,
      status: 'initiating', providerMetadata: {}, createdAt: now, updatedAt: now
    });
    try {
      await provisionBridgeSession(
        bridgeUrl,
        import.meta.env.PHONE_BRIDGE_INTERNAL_URL,
        callId,
        selectedAgent,
        elevenLabsApiKey,
        bridgeSecret
      );
      const providerResponse = await exotelCall(destination, streamUrl, statusCallback);
      const exotelCallSid = providerResponse?.Call?.Sid || providerResponse?.Call?.sid || providerResponse?.call?.sid || providerResponse?.CallSid || providerResponse?.call_sid || null;
      const [updated] = await getDatabase().update(phoneCall).set({
        exotelCallSid, providerMetadata: providerResponse, status: providerResponse?.Call?.Status === 'in-progress' ? 'in-progress' : 'ringing', updatedAt: new Date()
      }).where(and(eq(phoneCall.id, callId), eq(phoneCall.userId, session.user.id))).returning();
      return Response.json({ call: updated }, { status: 201 });
    } catch (error) {
      const providerError = error instanceof ExotelError
        ? { error: error.message, providerStatus: error.status, providerCode: error.code, providerBody: sanitizeProviderBody(error.providerBody) }
        : { error: error instanceof Error ? error.message : 'Exotel request failed.' };
      await getDatabase().update(phoneCall).set({ status: 'failed', providerMetadata: providerError, updatedAt: new Date(), completedAt: new Date() })
        .where(and(eq(phoneCall.id, callId), eq(phoneCall.userId, session.user.id)));
      return Response.json({
        error: error instanceof Error ? error.message : 'Exotel request failed.',
        ...(error instanceof ExotelError ? { providerStatus: error.status, providerCode: error.code, providerBody: sanitizeProviderBody(error.providerBody) } : {}),
        callId
      }, { status: 502 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not initiate phone call.' }, { status: 400 });
  }
};
