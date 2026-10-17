import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/api';
import { SpeechQueue, takeSentences, ttsSupported } from '../lib/tts';
import { uid } from '../lib/id';

const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export const sttSupported = Boolean(SpeechRecognition);

function micErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one and try again.';
    case 'NotReadableError':
      return 'The microphone is in use by another app. Close it and try again.';
    default:
      return 'Couldn’t start the microphone.';
  }
}

function recognitionErrorMessage(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access is blocked. Allow it in your browser’s site settings, then try again.';
    case 'audio-capture':
      return 'No microphone was found. Connect one and try again.';
    case 'network':
      return 'Speech recognition lost its connection. Check your internet and try again.';
    case 'no-speech':
      return 'I didn’t hear anything. Tap the microphone and try again.';
    case 'language-not-supported':
      return 'Your browser doesn’t support speech recognition for this language.';
    default:
      return 'Speech recognition stopped unexpectedly. Try again.';
  }
}

/**
 * Orchestrates the whole loop:
 * mic -> SpeechRecognition -> /api/chat (streamed) -> SpeechSynthesis, sentence by sentence.
 * status: 'idle' | 'listening' | 'thinking' | 'speaking'
 */
export function useVoiceAgent() {
  const [status, setStatusState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const [handsFree, setHandsFreeState] = useState(false);
  const [analyser, setAnalyser] = useState(null);

  const statusRef = useRef('idle');
  const messagesRef = useRef([]);
  const handsFreeRef = useRef(false);
  const abortRef = useRef(null);
  const recRef = useRef(null);
  const startingRef = useRef(false);
  const discardRef = useRef(false);
  const streamDoneRef = useRef(true);
  const micRef = useRef({ stream: null, ctx: null });
  const startListeningRef = useRef(() => {});
  const ttsRef = useRef(null);

  const setStatus = useCallback((s) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const updateMessages = useCallback((fn) => {
    const next = fn(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const finishTurn = useCallback(() => {
    setStatus('idle');
    if (handsFreeRef.current) startListeningRef.current();
  }, [setStatus]);

  if (!ttsRef.current) {
    ttsRef.current = new SpeechQueue({
      onStart: () => {
        if (statusRef.current === 'thinking') setStatus('speaking');
      },
      onDrain: () => {
        if (streamDoneRef.current) finishTurn();
      },
    });
  }

  const stopMic = useCallback(() => {
    const { stream, ctx } = micRef.current;
    stream?.getTracks().forEach((t) => t.stop());
    ctx?.close().catch(() => {});
    micRef.current = { stream: null, ctx: null };
    setAnalyser(null);
  }, []);

  // ---- LLM turn -------------------------------------------------------------
  const sendMessage = useCallback(
    async (text) => {
      const userMsg = { id: uid(), role: 'user', content: text };
      const botMsg = { id: uid(), role: 'assistant', content: '' };
      const history = [...messagesRef.current, userMsg]
        .filter((m) => m.content)
        .map(({ role, content }) => ({ role, content }));

      updateMessages((m) => [...m, userMsg, botMsg]);
      setStatus('thinking');
      streamDoneRef.current = false;

      const controller = new AbortController();
      abortRef.current = controller;
      const tts = ttsRef.current;
      let buffer = '';
      let received = false;

      try {
        await streamChat({
          messages: history,
          signal: controller.signal,
          onDelta: (delta) => {
            received = true;
            buffer += delta;
            updateMessages((m) =>
              m.map((x) => (x.id === botMsg.id ? { ...x, content: x.content + delta } : x)),
            );
            const { sentences, rest } = takeSentences(buffer);
            buffer = rest;
            sentences.forEach((s) => tts.enqueue(s));
          },
        });

        if (buffer.trim()) tts.enqueue(buffer);
        streamDoneRef.current = true;
        if (!received) throw new Error('The AI returned an empty reply. Try asking again.');
        if (tts.pending === 0) finishTurn(); // nothing queued (e.g. speech output unavailable)
      } catch (err) {
        if (controller.signal.aborted) return;
        streamDoneRef.current = true;
        tts.cancel();
        updateMessages((m) => m.filter((x) => x.id !== botMsg.id || x.content));
        setError(err.message || 'Something went wrong. Try again.');
        setStatus('idle');
      }
    },
    [finishTurn, setStatus, updateMessages],
  );

  // ---- interruption ---------------------------------------------------------
  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    ttsRef.current.cancel();
    streamDoneRef.current = true;
    updateMessages((m) => m.filter((x) => !(x.role === 'assistant' && !x.content)));
    if (statusRef.current === 'thinking' || statusRef.current === 'speaking') setStatus('idle');
  }, [setStatus, updateMessages]);

  // ---- microphone + speech recognition -------------------------------------
  const startListening = useCallback(async () => {
    if (!SpeechRecognition) {
      setError('This browser doesn’t support speech recognition. Open the app in Chrome, Edge or Safari.');
      return;
    }
    if (recRef.current || startingRef.current) return;
    startingRef.current = true;

    interrupt(); // barge-in: talking over the assistant stops it
    setError(null);
    discardRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      // Real microphone levels drive the waveform.
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.8;
      source.connect(node);
      micRef.current = { stream, ctx };
      setAnalyser(node);
    } catch (err) {
      setError(micErrorMessage(err));
      setStatus('idle');
      startingRef.current = false;
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalText = '';
    let failed = false;

    rec.onstart = () => setStatus('listening');
    rec.onresult = (event) => {
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else live += result[0].transcript;
      }
      setInterim((finalText + live).trim());
    };
    rec.onerror = (event) => {
      if (event.error === 'aborted') return;
      failed = true;
      setError(recognitionErrorMessage(event.error));
    };
    rec.onend = () => {
      recRef.current = null;
      stopMic();
      setInterim('');
      const text = finalText.trim();
      if (!discardRef.current && !failed && text) {
        sendMessage(text);
      } else if (statusRef.current === 'listening') {
        if (!discardRef.current && !failed && !text) setError(recognitionErrorMessage('no-speech'));
        setStatus('idle');
      }
    };

    recRef.current = rec;
    startingRef.current = false;
    try {
      rec.start();
    } catch {
      recRef.current = null;
      stopMic();
      setError('Couldn’t start speech recognition. Try again.');
      setStatus('idle');
    }
  }, [interrupt, sendMessage, setStatus, stopMic]);

  startListeningRef.current = startListening;

  /** Finish speaking: recognition delivers its final result, then the message is sent. */
  const stopListening = useCallback(() => {
    recRef.current?.stop();
  }, []);

  /** Throw away what was said so far. */
  const cancelListening = useCallback(() => {
    discardRef.current = true;
    recRef.current?.abort();
    if (recRef.current) {
      // abort() may not fire onend in every browser, so settle state here too.
      recRef.current = null;
      stopMic();
      setInterim('');
      setStatus('idle');
    }
  }, [setStatus, stopMic]);

  /** One button, context-sensitive: talk, finish, or interrupt. */
  const toggle = useCallback(() => {
    switch (statusRef.current) {
      case 'listening':
        return stopListening();
      case 'thinking':
      case 'speaking':
        return interrupt();
      default:
        return startListening();
    }
  }, [interrupt, startListening, stopListening]);

  const setHandsFree = useCallback((value) => {
    handsFreeRef.current = value;
    setHandsFreeState(value);
  }, []);

  const clearConversation = useCallback(() => {
    interrupt();
    cancelListening();
    updateMessages(() => []);
    setError(null);
  }, [cancelListening, interrupt, updateMessages]);

  const dismissError = useCallback(() => setError(null), []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      ttsRef.current?.cancel();
      recRef.current?.abort();
      stopMic();
    },
    [stopMic],
  );

  return {
    status,
    messages,
    interim,
    error,
    analyser,
    handsFree,
    setHandsFree,
    toggle,
    interrupt,
    cancelListening,
    clearConversation,
    dismissError,
    supported: { stt: sttSupported, tts: ttsSupported },
  };
}
