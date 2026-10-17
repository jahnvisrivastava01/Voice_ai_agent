
const BASE = import.meta.env.VITE_API_URL || '';

export function getUserId() {
  const key = 'voice-agent-user-id';
  let userId = localStorage.getItem(key);

  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem(key, userId);
  }

  return userId;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'History request failed.');
  }

  return data;
}

export function listConversations() {
  return request(
    `/api/conversations?userId=${encodeURIComponent(getUserId())}`
  );
}

export function createConversation() {
  return request('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ userId: getUserId() }),
  });
}

export function getConversation(id) {
  return request(
    `/api/conversations/${encodeURIComponent(id)}?userId=${encodeURIComponent(getUserId())}`
  );
}

export function saveMessages(id, messages) {
  return request(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'PATCH',
    body: JSON.stringify({
      userId: getUserId(),
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
  });
}

export function renameConversation(id, title) {
  return request(`/api/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ userId: getUserId(), title }),
  });
}

export function deleteConversation(id) {
  return request(
    `/api/conversations/${encodeURIComponent(id)}?userId=${encodeURIComponent(getUserId())}`,
    { method: 'DELETE' }
  );
}
