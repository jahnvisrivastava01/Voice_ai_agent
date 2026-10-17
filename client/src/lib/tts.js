export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Remove markdown-ish characters that sound wrong when read aloud. */
function cleanForSpeech(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const base = lang.split('-')[0];
  const matching = voices.filter((v) => v.lang === lang || v.lang.startsWith(base));
  const pool = matching.length ? matching : voices;
  return (
    pool.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ||
    pool.find((v) => /google/i.test(v.name)) ||
    pool.find((v) => v.default) ||
    pool[0]
  );
}

/**
 * Speaks sentences one after another as they arrive from the streaming LLM.
 * Short utterances also avoid a Chrome bug that silently stops long ones.
 */
export class SpeechQueue {
  constructor({ onStart, onDrain } = {}) {
    this.onStart = onStart;
    this.onDrain = onDrain;
    this.pending = 0;
    this.generation = 0;
  }

  enqueue(text) {
    if (!ttsSupported) return;
    const clean = cleanForSpeech(text);
    if (!clean) return;

    const lang = navigator.language || 'en-US';
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.rate = 1.03;

    const gen = this.generation;
    this.pending += 1;
    utterance.onstart = () => {
      if (gen === this.generation) this.onStart?.();
    };
    const finish = () => {
      if (gen !== this.generation) return; // cancelled
      this.pending -= 1;
      if (this.pending === 0) this.onDrain?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  cancel() {
    this.generation += 1;
    this.pending = 0;
    if (ttsSupported) window.speechSynthesis.cancel();
  }
}

/** Split buffered streamed text into complete sentences plus the unfinished remainder. */
export function takeSentences(buffer) {
  const sentences = [];
  const boundary = /([.!?]+["')\]]*|\n)(\s+)/;
  let rest = buffer;
  let match;
  while ((match = boundary.exec(rest))) {
    const end = match.index + match[0].length;
    sentences.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  return { sentences, rest };
}
