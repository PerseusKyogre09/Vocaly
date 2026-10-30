import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { createLifecycle } from './lifecycle.mjs';
import { pcmSampleRate, toElevenLabsAudio, toExotelMedia } from './protocol.mjs';
import { resamplePcm16 } from './audio.mjs';
import { createSessionStore } from './session.mjs';
import { verifyToken } from './token.mjs';

const port = Number(process.env.PORT || 8080);
const appUrl = process.env.VOXFLOW_APP_URL || process.env.PUBLIC_APP_URL;
const secret = process.env.PHONE_BRIDGE_SECRET;
if (!appUrl || !secret) throw new Error('VOXFLOW_APP_URL and PHONE_BRIDGE_SECRET are required.');

async function updateStatus(callId, status, metadata = {}) {
  await fetch(`${appUrl.replace(/\/$/, '')}/api/phone/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-voxflow-bridge-secret': secret },
    body: JSON.stringify({ callId, status, metadata })
  });
}

function diagnostic(event, metadata = {}) {
  console.info(JSON.stringify({ component: 'phone-bridge', event, ...metadata }));
}

const sessions = createSessionStore(2 * 60 * 1000, (session) => {
  void updateStatus(session.callId, 'failed', { reason: 'bridge_session_timeout' });
  diagnostic('session_timeout', { callId: session.callId, agentId: session.agentId });
});

async function signedConversationUrl(agentId, elevenLabsApiKey) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': elevenLabsApiKey }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.signed_url) throw new Error(data?.detail?.message || data?.detail || 'Could not obtain ElevenLabs signed URL.');
  return data.signed_url;
}

const server = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/sessions') {
    if (request.headers.authorization !== `Bearer ${secret}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Unauthorized.' }));
      return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (![body.callId, body.agentId, body.elevenLabsAgentId].every((value) => typeof value === 'string' && value.length > 0) || (body.elevenLabsApiKey !== undefined && typeof body.elevenLabsApiKey !== 'string')) {
        throw new Error('Incomplete bridge session.');
      }
      sessions.put({
        callId: body.callId,
        agentId: body.agentId,
        elevenLabsAgentId: body.elevenLabsAgentId,
        firstMessage: typeof body.firstMessage === 'string' ? body.firstMessage : '',
        elevenLabsApiKey: body.elevenLabsApiKey || ''
      });
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid bridge session.' }));
    }
    return;
  }
  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('VoxFlow phone bridge is running.');
});
const sockets = new WebSocketServer({ noServer: true, clientTracking: false });

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const payload = verifyToken(url.searchParams.get('token'), secret);
    const sampleRate = Number(url.searchParams.get('sample-rate') || 8000);
    if (![8000, 16000, 24000].includes(sampleRate)) throw new Error('Unsupported Exotel sample rate.');
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client, payload, sampleRate));
  } catch {
    socket.destroy();
  }
});

sockets.on('connection', async (exotel, payload, initialExotelRate) => {
  let exotelRate = initialExotelRate;
  let eleven;
  let streamSid;
  let terminal = false;
  let elevenReady = false;
  let elevenUnavailable = false;
  let elevenInitTimer;
  let queuedAudio = [];
  let elevenInputRate = null;
  let elevenOutputRate = null;
  const counts = { exotelMediaIn: 0, exotelMediaInBytes: 0, elevenAudioOut: 0, elevenAudioOutBytes: 0, elevenAudioIn: 0, elevenAudioInBytes: 0, exotelMediaOut: 0, exotelMediaOutBytes: 0 };
  const lifecycle = createLifecycle();
  let statusUpdate = Promise.resolve();
  const session = sessions.take(payload.callId, payload.agentId, payload.elevenLabsAgentId);
  if (!session) {
    exotel.close();
    return;
  }
  const finish = async (status, metadata = {}) => {
    if (!lifecycle.transition(status)) return;
    terminal = lifecycle.isTerminal();
    statusUpdate = statusUpdate.then(() => updateStatus(payload.callId, status, { ...metadata, ...counts })).catch(() => {});
    await statusUpdate;
    if (terminal) diagnostic('session_closed', { callId: payload.callId, status, ...counts });
  };
  const markElevenLabsUnavailable = async (reason, error) => {
    if (elevenUnavailable || terminal) return;
    elevenUnavailable = true;
    elevenReady = false;
    queuedAudio = [];
    clearTimeout(elevenInitTimer);
    diagnostic('elevenlabs_unavailable_call_kept_open', { callId: payload.callId, reason, ...(error ? { error } : {}) });
    await finish('agent-unavailable', { reason, ...(error ? { agentError: error } : {}) });
    if (eleven?.readyState === WebSocket.OPEN || eleven?.readyState === WebSocket.CONNECTING) eleven.close();
  };
  const sendAudioToEleven = (audioBase64, alreadyTranslated = false) => {
    if (!elevenReady || eleven?.readyState !== WebSocket.OPEN) return false;
    const pcm = Buffer.from(audioBase64, 'base64');
    if (!pcm.length) return false;
    const translated = alreadyTranslated ? audioBase64 : resamplePcm16(pcm, exotelRate, elevenInputRate).toString('base64');
    eleven.send(JSON.stringify({ user_audio_chunk: translated }), (error) => {
      if (error) {
        diagnostic('audio_forward_error', { callId: payload.callId, direction: 'exotel_to_elevenlabs', error: error.message });
        void markElevenLabsUnavailable('elevenlabs_audio_send_failed', error.message);
      }
    });
    counts.exotelMediaOut++;
    counts.exotelMediaOutBytes += Buffer.from(translated, 'base64').length;
    diagnostic('audio_forwarded_to_elevenlabs', { callId: payload.callId, packets: counts.exotelMediaOut, bytes: counts.exotelMediaOutBytes });
    return true;
  };
  const onElevenLabsMessage = (raw) => {
    if (elevenUnavailable || terminal) return;
    let event;
    try { event = JSON.parse(raw.toString()); } catch { return; }
    if (event.type === 'conversation_initiation_metadata') {
      const metadata = event.conversation_initiation_metadata_event || event;
      const inputFormat = metadata.user_input_audio_format || '';
      const outputFormat = metadata.agent_output_audio_format || '';
      elevenInputRate = pcmSampleRate(inputFormat);
      elevenOutputRate = pcmSampleRate(outputFormat);
      if (!elevenInputRate || !elevenOutputRate) {
        diagnostic('elevenlabs_unsupported_audio_format', { callId: payload.callId, inputFormat, outputFormat });
        void markElevenLabsUnavailable('elevenlabs_unsupported_audio_format');
        return;
      }
      elevenReady = true;
      clearTimeout(elevenInitTimer);
      diagnostic('elevenlabs_conversation_initialized', { callId: payload.callId, inputFormat, outputFormat });
      void finish('connected');
      for (const chunk of queuedAudio.splice(0)) sendAudioToEleven(chunk, true);
    }
    const audio = event.audio_event?.audio_base_64;
    if (event.type === 'audio' && typeof audio === 'string' && audio.length && exotel.readyState === WebSocket.OPEN && streamSid) {
      let media;
      try { media = toExotelMedia(audio, streamSid, elevenOutputRate, exotelRate); }
      catch (error) {
        diagnostic('audio_format_error', { callId: payload.callId, direction: 'elevenlabs_to_exotel', error: error.message });
        void markElevenLabsUnavailable('invalid_elevenlabs_audio', error.message);
        return;
      }
      if (!media) return;
      const bytes = Buffer.from(audio, 'base64').length;
      exotel.send(JSON.stringify(media), (error) => {
        if (error) {
          diagnostic('audio_forward_error', { callId: payload.callId, direction: 'elevenlabs_to_exotel', error: error.message });
          void markElevenLabsUnavailable('exotel_audio_send_failed', error.message);
        }
      });
      counts.elevenAudioIn++;
      counts.elevenAudioInBytes += bytes;
      counts.exotelMediaOut++;
      counts.exotelMediaOutBytes += Buffer.from(media.media.payload, 'base64').length;
      diagnostic('elevenlabs_audio_received_and_forwarded', { callId: payload.callId, packets: counts.elevenAudioIn, inputBytes: bytes, forwardedPackets: counts.exotelMediaOut, forwardedBytes: counts.exotelMediaOutBytes });
    } else if (event.type === 'interruption' && exotel.readyState === WebSocket.OPEN && streamSid) {
      exotel.send(JSON.stringify({ event: 'clear', stream_sid: streamSid }));
    } else if (event.type === 'ping') {
      setTimeout(() => {
        if (eleven?.readyState === WebSocket.OPEN) eleven.send(JSON.stringify({ type: 'pong', event_id: event.ping_event?.event_id }));
      }, Number(event.ping_event?.ping_ms || 0));
    } else if (event.type === 'error' || event.type === 'client_error') {
      void markElevenLabsUnavailable('elevenlabs_protocol_error', String(event.message || event.error || 'ElevenLabs reported a conversation error.'));
    }
  };
  try {
    diagnostic('exotel_connected', { callId: payload.callId });
    void finish('ringing');
    const connectElevenLabs = async () => {
      if (eleven || elevenUnavailable) return;
      if (!session.elevenLabsApiKey) {
        await markElevenLabsUnavailable('elevenlabs_key_missing');
        return;
      }
      diagnostic('elevenlabs_session_creation_started', { callId: payload.callId, agentId: payload.agentId, elevenLabsAgentId: payload.elevenLabsAgentId });
      eleven = new WebSocket(await signedConversationUrl(payload.elevenLabsAgentId, session.elevenLabsApiKey));
      elevenInitTimer = setTimeout(() => {
        if (!elevenReady) {
          void markElevenLabsUnavailable('elevenlabs_initialization_timeout');
        }
      }, 15000);
      eleven.on('open', () => {
        diagnostic('elevenlabs_socket_open', { callId: payload.callId });
        eleven.send(JSON.stringify({
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            agent: { first_message: session.firstMessage || 'Hello! How can I help you today?' }
          }
        }));
        void finish('agent-connecting');
      });
      eleven.on('message', onElevenLabsMessage);
      eleven.on('error', (error) => {
        diagnostic('elevenlabs_socket_error', { callId: payload.callId, error: error.message });
        void markElevenLabsUnavailable('elevenlabs_error', error.message);
      });
      eleven.on('close', (code, reason) => {
        clearTimeout(elevenInitTimer);
        diagnostic('elevenlabs_socket_closed', { callId: payload.callId, code, reason: reason.toString() });
        if (!terminal) void markElevenLabsUnavailable('elevenlabs_socket_closed');
      });
    };
    exotel.on('message', (raw) => {
      let event;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      if (event.event === 'connected') diagnostic('exotel_connected_event', { callId: payload.callId });
      if (event.event === 'start') {
        streamSid = event.start?.stream_sid || event.stream_sid;
        const advertisedRate = Number(event.start?.media_format?.sample_rate);
        if ([8000, 16000, 24000].includes(advertisedRate)) exotelRate = advertisedRate;
        diagnostic('exotel_start_received', { callId: payload.callId, streamSid, exotelCallSid: event.start?.call_sid, sampleRate: exotelRate, encoding: event.start?.media_format?.encoding, bitRate: event.start?.media_format?.bit_rate });
        void finish('in-progress', { callSid: event.start?.call_sid, streamSid });
        void connectElevenLabs().catch((error) => markElevenLabsUnavailable('elevenlabs_session_creation_failed', error instanceof Error ? error.message : 'Session creation failed.'));
      }
      if (event.event === 'media') {
        let rawPcm;
        try {
          const base64 = event.media?.payload || '';
          rawPcm = Buffer.from(toElevenLabsAudio(base64, exotelRate, exotelRate), 'base64');
        }
        catch (error) {
          diagnostic('audio_format_error', { callId: payload.callId, direction: 'exotel_to_elevenlabs', error: error.message });
          void markElevenLabsUnavailable('invalid_exotel_audio', error.message);
          return;
        }
        if (!rawPcm.length) return;
        counts.exotelMediaIn++;
        const bytes = rawPcm.length;
        counts.exotelMediaInBytes += Buffer.from(event.media.payload, 'base64').length;
        diagnostic('exotel_media_received', { callId: payload.callId, packets: counts.exotelMediaIn, bytes, totalBytes: counts.exotelMediaInBytes });
        if (elevenReady) {
          sendAudioToEleven(rawPcm.toString('base64'));
        } else if (!elevenUnavailable && session.elevenLabsApiKey && queuedAudio.length < 50) {
          queuedAudio.push(rawPcm.toString('base64'));
        } else if (queuedAudio.length >= 50) {
          diagnostic('audio_queue_overflow', { callId: payload.callId, queuedPackets: queuedAudio.length });
        }
      }
      if (event.event === 'stop') {
        void finish('completed', { reason: event.stop?.reason || 'exotel_stop', callSid: event.stop?.call_sid });
        eleven?.close();
      }
    });
    exotel.on('close', (code, reason) => { diagnostic('exotel_socket_closed', { callId: payload.callId, code, reason: reason.toString() }); eleven?.close(); void finish('completed', { reason: 'exotel_socket_closed' }); });
    exotel.on('error', (error) => {
      diagnostic('exotel_socket_error', { callId: payload.callId, error: error.message });
      eleven?.close();
      void finish('failed', { reason: 'exotel_socket_error', error: error.message });
    });
  } catch (error) {
    await finish('failed', { reason: 'bridge_setup_failed', error: error instanceof Error ? error.message : 'Bridge setup failed.' });
    exotel.close();
  }
});

server.listen(port, () => console.log(`VoxFlow phone bridge listening on ${port}`));
