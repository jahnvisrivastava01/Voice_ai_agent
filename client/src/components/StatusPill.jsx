const TEXT = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

export default function StatusPill({ status }) {
  return (
    <div className="pill" data-status={status} role="status" aria-live="polite">
      <span className="pill-dot" aria-hidden="true" />
      {TEXT[status]}
    </div>
  );
}
