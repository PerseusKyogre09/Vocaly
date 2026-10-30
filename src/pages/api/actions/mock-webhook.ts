import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * POST /api/actions/mock-webhook
 * Safe, controlled mock webhook endpoint for testing and demonstrating actions
 * without contacting external third-party services.
 * Echoes back received headers, payload, and generates realistic operation confirmations.
 */
export const POST: APIRoute = async ({ request }) => {
  const headers = Object.fromEntries(request.headers.entries());
  const body = await request.json().catch(() => null);

  const customerName = body?.customer_name || body?.name || 'Valued Patient';
  const service = body?.service || 'Consultation';
  const appointmentDate = body?.appointment_date || 'Upcoming Date';
  const appointmentTime = body?.appointment_time || 'Scheduled Time';

  const bookingId = `BK-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  return Response.json({
    status: 'success',
    operation: 'appointment_created',
    bookingId,
    confirmation: {
      recipient: customerName,
      service,
      date: appointmentDate,
      time: appointmentTime,
      status: 'confirmed',
      notes: 'Record synchronized with clinic management system.'
    },
    receivedPayload: body,
    serverTimestamp: new Date().toISOString()
  }, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
