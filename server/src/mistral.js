
const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/';

export class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function describeUpstreamFailure(status) {
  if (status === 401 || status === 403) {
    return 'The server Gemini API key was rejected. Check GEMINI_API_KEY.';
  }
  if (status === 429) {
    return 'Gemini is rate limited or the quota is exhausted. Check your API quota and try again later.';
  }
  if (status >= 500) {
    return 'Gemini is having problems. Try again shortly.';
  }
  return `Gemini returned an error (${status}).`;
}

export async function streamCompletion({ messages, signal }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new UpstreamError(
      'The server is missing GEMINI_API_KEY in server/.env.',
      500
    );
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url =
    `${ENDPOINT}${encodeURIComponent(model)}:streamGenerateContent` +
    `?alt=sse&key=${encodeURIComponent(apiKey)}`;

  // Convert the existing chat history into Gemini's expected format.
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(message.content ?? '') }],
    }))
    .filter((message) => message.parts[0].text.trim().length > 0);

  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => String(message.content ?? ''))
    .join('\n\n');

  let upstream;

  try {
    upstream = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        contents,
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 400,
        },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;

    throw new UpstreamError(
      'Could not reach Gemini. Check the server network connection.'
    );
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    console.error(`Gemini error ${upstream.status}:`, detail.slice(0, 300));
    throw new UpstreamError(describeUpstreamFailure(upstream.status));
  }

  if (!upstream.body) {
    throw new UpstreamError('Gemini returned an empty response stream.');
  }

  return (async function* () {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });

      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);

        if (!line.startsWith('data:')) continue;

        const payload = line.slice(5).trim();
        if (!payload) continue;

        try {
          const data = JSON.parse(payload);
          const text = data?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || '')
            .join('');

          if (text) yield text;
        } catch {
          // Ignore incomplete or non-JSON SSE lines.
        }
      }
    }
  })();
}
