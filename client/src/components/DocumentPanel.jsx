
import { useRef, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function DocumentPanel({ onUseDocument }) {
  const fileInputRef = useRef(null);

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.');
      return;
    }

    setLoading(true);
    setError('');
    setDocument(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/documents/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'PDF upload failed.');
      }

      setDocument(data);
      setIsExpanded(true);
    } catch (err) {
      setError(err.message || 'Could not upload the PDF.');
    } finally {
      setLoading(false);
    }
  }

  function useDocument(prompt) {
    if (!document || !onUseDocument) return;

    onUseDocument(
      `Use the uploaded document "${document.filename}" as context. ` +
        'Answer document questions using its contents. ' +
        'Do not invent qualifications or facts. If information is missing, say so.\n\n' +
        `User request: ${prompt}\n\n` +
        `Document text:\n${document.text}`
    );
  }

  return (
    <section className={`document-panel ${isExpanded ? 'is-open' : ''}`}>
      <button
        type="button"
        className="document-header"
        onClick={() => setIsExpanded((value) => !value)}
        aria-expanded={isExpanded}
      >
        <span className="document-header-text">
          <strong>Document Intelligence</strong>
          <small>
            {document ? document.filename : 'Upload a resume or PDF and ask about it'}
          </small>
        </span>
        <svg className="chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isExpanded && (
        <div className="document-body">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleUpload}
            hidden
          />

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
          >
            {loading ? 'Reading PDF…' : document ? 'Replace PDF' : 'Upload PDF'}
          </button>

          {error && (
            <p className="document-error" role="alert">
              {error}
            </p>
          )}

          {document && (
            <div className="document-result">
              <p className="document-meta">
                {document.pages} page(s) · text extracted
              </p>

              <div className="document-actions">
                <button type="button" className="btn btn-small" onClick={() => useDocument('Summarize this document.')}>
                  Summarize
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() =>
                    useDocument(
                      'Analyze this resume. Identify strengths, missing details, and specific improvements. Do not invent qualifications.'
                    )
                  }
                >
                  Analyze resume
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => useDocument('Create five useful questions and answers based on this document.')}
                >
                  Generate Q&amp;A
                </button>
              </div>

              <details className="document-preview">
                <summary>Preview extracted text</summary>
                <pre>{document.text.slice(0, 5000)}</pre>
              </details>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
