const LABELS = {
  idle: { aria: 'Start talking', hint: 'Tap to talk' },
  listening: { aria: 'Finish and send', hint: 'Tap when you’re done' },
  thinking: { aria: 'Stop', hint: 'Tap to stop' },
  speaking: { aria: 'Interrupt', hint: 'Tap to interrupt' },
};

export default function MicButton({ status, onClick, disabled }) {
  const { aria, hint } = LABELS[status];
  const showStop = status === 'thinking' || status === 'speaking';

  return (
    <div className="mic-wrap">
      <button
        type="button"
        className="mic"
        data-status={status}
        onClick={onClick}
        disabled={disabled}
        aria-label={aria}
      >
        <span className="mic-ring" aria-hidden="true" />
        <span className="mic-ring mic-ring-2" aria-hidden="true" />
        {showStop ? (
          <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v3" />
          </svg>
        )}
      </button>
      <p className="mic-hint">{hint}</p>
    </div>
  );
}
