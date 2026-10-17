import { useEffect, useRef } from 'react';

export default function Transcript({ messages, interim, status }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, interim]);

  const empty = messages.length === 0 && !interim;

  return (
    <div className="transcript" role="log" aria-live="polite" aria-label="Conversation">
      {empty && (
        <div className="empty">
          <p className="empty-title">Nothing said yet</p>
          <p>Tap the microphone and ask a question. The conversation appears here.</p>
        </div>
      )}

      {messages.map((m) => (
        <div key={m.id} className={`bubble ${m.role}`}>
          <span className="who">{m.role === 'user' ? 'You' : 'Agent'}</span>
          {m.content ? (
            <p>{m.content}</p>
          ) : (
            <p className="typing" aria-label="Thinking">
              <i /><i /><i />
            </p>
          )}
        </div>
      ))}

      {status === 'listening' && (
        <div className="bubble user live">
          <span className="who">You</span>
          <p>{interim || 'Listening…'}</p>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
