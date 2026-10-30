export function createSessionStore(ttlMs = 10 * 60 * 1000, onExpire = () => {}) {
  const sessions = new Map();

  function put(session) {
    const expiresAt = Date.now() + ttlMs;
    const timer = setTimeout(() => {
      sessions.delete(session.callId);
      onExpire(session);
    }, ttlMs);
    timer.unref?.();
    sessions.set(session.callId, { ...session, expiresAt, timer });
  }

  function take(callId, agentId, elevenLabsAgentId) {
    const session = sessions.get(callId);
    if (!session || session.expiresAt <= Date.now() || session.agentId !== agentId || session.elevenLabsAgentId !== elevenLabsAgentId) {
      return null;
    }
    clearTimeout(session.timer);
    sessions.delete(callId);
    return session;
  }

  return { put, take };
}
