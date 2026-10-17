import { useEffect } from 'react';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import MicButton from './components/MicButton';
import StatusPill from './components/StatusPill';
import Transcript from './components/Transcript';
import Waveform from './components/Waveform';

export default function App() {
  const agent = useVoiceAgent();
  const { status, supported } = agent;

  // Escape stops whatever is happening: discards a recording, or interrupts the assistant.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (status === 'listening') agent.cancelListening();
      else if (status === 'thinking' || status === 'speaking') agent.interrupt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, agent]);

  return (
    <main className="app">
      <section className="stage" aria-label="Voice controls">
        <header className="brand">
          <h1>Voice Agent</h1>
          <p>Talk to an AI assistant and hear it answer.</p>
        </header>

        <StatusPill status={status} />
        <MicButton status={status} onClick={agent.toggle} disabled={!supported.stt} />
        <Waveform analyser={agent.analyser} status={status} />

        <div className="controls">
          {status === 'listening' && (
            <button type="button" className="btn" onClick={agent.cancelListening}>
              Cancel recording
            </button>
          )}
          <label className="switch">
            <input
              type="checkbox"
              checked={agent.handsFree}
              onChange={(e) => agent.setHandsFree(e.target.checked)}
            />
            <span className="track" aria-hidden="true" />
            Hands-free
          </label>
          <button
            type="button"
            className="btn"
            onClick={agent.clearConversation}
            disabled={agent.messages.length === 0 && status === 'idle'}
          >
            Clear conversation
          </button>
        </div>

        {!supported.stt && (
          <p className="notice" role="alert">
            This browser can’t do speech recognition. Open the app in Chrome, Edge or Safari.
          </p>
        )}
        {supported.stt && !supported.tts && (
          <p className="notice" role="alert">
            This browser can’t speak replies aloud. You’ll still see them in the transcript.
          </p>
        )}
        {agent.error && (
          <div className="error" role="alert">
            <p>{agent.error}</p>
            <button type="button" onClick={agent.dismissError} aria-label="Dismiss message">
              Dismiss
            </button>
          </div>
        )}
      </section>

      <section className="panel" aria-label="Conversation history">
        <Transcript messages={agent.messages} interim={agent.interim} status={status} />
      </section>
    </main>
  );
}
