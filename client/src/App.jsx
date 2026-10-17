import { useEffect, useState } from 'react';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import MicButton from './components/MicButton';
import StatusPill from './components/StatusPill';
import Transcript from './components/Transcript';
import Waveform from './components/Waveform';
import DocumentPanel from './components/DocumentPanel';

const DESKTOP_QUERY = '(min-width: 1000px)';
const isDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;

export default function App() {
  const agent = useVoiceAgent();
  const { status, supported } = agent;

  // Sidebar is a persistent column on desktop and a slide-over drawer on small screens.
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const handleUseDocument = (prompt) => agent.sendMessage(prompt);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (status === 'listening') agent.cancelListening();
      else if (status === 'thinking' || status === 'speaking') agent.interrupt();
      else if (sidebarOpen && !isDesktop()) setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, agent, sidebarOpen]);

  const closeDrawerOnMobile = () => {
    if (!isDesktop()) setSidebarOpen(false);
  };

  async function handleRename(id) {
    const title = editTitle.trim();
    if (!title) return;
    await agent.renameChat(id, title);
    setEditingId(null);
    setEditTitle('');
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this conversation permanently?')) return;
    await agent.deleteChat(id);
  }

  return (
    <div className="shell" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      <button
        type="button"
        className="scrim"
        aria-label="Close chat history"
        tabIndex={sidebarOpen ? 0 : -1}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className="sidebar" aria-label="Chat history" aria-hidden={!sidebarOpen}>
        <div className="sidebar-head">
          <h2>Chats</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close chat history"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary new-chat"
          onClick={() => {
            agent.newConversation();
            closeDrawerOnMobile();
          }}
          disabled={status === 'listening'}
        >
          New chat
        </button>

        <div className="chat-list">
          {agent.historyLoading && <p className="muted-note">Loading history…</p>}

          {!agent.historyLoading && agent.conversations.length === 0 && (
            <p className="muted-note">No saved chats yet. Start talking to create one.</p>
          )}

          {agent.conversations.map((chat) => (
            <div
              className={`chat-item ${agent.activeConversationId === chat._id ? 'active' : ''}`}
              key={chat._id}
            >
              {editingId === chat._id ? (
                <form
                  className="rename-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRename(chat._id);
                  }}
                >
                  <input
                    autoFocus
                    value={editTitle}
                    maxLength={100}
                    onChange={(e) => setEditTitle(e.target.value)}
                    aria-label="Conversation title"
                  />
                  <div className="row">
                    <button type="submit" className="btn btn-small btn-primary">Save</button>
                    <button type="button" className="btn btn-small" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="chat-open"
                    onClick={() => {
                      agent.openConversation(chat._id);
                      closeDrawerOnMobile();
                    }}
                    disabled={agent.historyLoading}
                    title={chat.title}
                  >
                    <span className="chat-title">{chat.title || 'New chat'}</span>
                    <small>{new Date(chat.updatedAt).toLocaleDateString()}</small>
                  </button>

                  <div className="chat-actions">
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        setEditingId(chat._id);
                        setEditTitle(chat.title || '');
                      }}
                      aria-label={`Rename ${chat.title}`}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      onClick={() => handleDelete(chat._id)}
                      aria-label={`Delete ${chat.title}`}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Close chat history' : 'Open chat history'}
            aria-expanded={sidebarOpen}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <h1>Voice Agent</h1>
          <StatusPill status={status} />
        </header>

        <main className="content">
          <section className="conversation" aria-label="Conversation">
            <DocumentPanel onUseDocument={handleUseDocument} />
            <div className="chat-panel">
              <Transcript messages={agent.messages} interim={agent.interim} status={status} />
            </div>
          </section>

          <section className="stage" aria-label="Voice controls">
            <p className="tagline">Talk to an AI assistant and hear the answer read back.</p>

            <div className="stage-wave">
              <Waveform analyser={agent.analyser} status={status} />
            </div>

            <div className="stage-mic">
              <MicButton status={status} onClick={agent.toggle} disabled={!supported.stt} />
            </div>

            <div className="controls">
              {status === 'listening' && (
                <button type="button" className="btn btn-small" onClick={agent.cancelListening}>
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
                className="btn btn-small"
                onClick={agent.clearConversation}
                disabled={agent.messages.length === 0 && status === 'idle'}
              >
                Clear
              </button>
            </div>

            <div className="messages">
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
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
