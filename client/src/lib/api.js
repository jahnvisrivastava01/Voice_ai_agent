const BASE = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, { network = false } = {}) {
    super(message);
    this.network = network;
  }
}

/**
 * POST the conversation to the backend and call onDelta with each streamed piece of text.
 * The backend relays server-sent events: `data: {"delta": "..."}` ... `data: [DONE]`.
 */
export async function streamChat({ messages, signal, onDelta }) {
  let res;
  try {
    res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Can’t reach the server. Check your connection and that the backend is running.', { network: true });
  }

  if (!res.ok) {
    let message = `The server returned an error (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        let event;
        try {
          event = JSON.parse(payload);
        } catch {
          continue;
        }
        if (event.error) throw new ApiError(event.error);
        if (event.delta) onDelta(event.delta);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof ApiError) throw err;
    throw new ApiError('The connection dropped while the reply was streaming.', { network: true });
  }
}
