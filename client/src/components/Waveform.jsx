import { useEffect, useRef } from 'react';

const BARS = 56;

/**
 * Listening: bars follow real microphone levels (AnalyserNode).
 * Speaking: the browser doesn't expose synthesized audio, so bars use a gentle procedural motion.
 * Thinking: slow travelling pulse. Idle: flat line.
 */
export default function Waveform({ analyser, status }) {
  const canvasRef = useRef(null);
  const statusRef = useRef(status);
  const analyserRef = useRef(analyser);
  statusRef.current = status;
  analyserRef.current = analyser;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const levels = new Array(BARS).fill(0);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let data = null;
    let raf;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now) => {
      const { width: w, height: h } = canvas;
      const dpr = window.devicePixelRatio || 1;
      const t = now / 1000;
      const s = statusRef.current;
      const an = analyserRef.current;

      if (an && s === 'listening') {
        if (!data || data.length !== an.frequencyBinCount) data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
      }

      ctx.clearRect(0, 0, w, h);
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, '#7c3aed');
      gradient.addColorStop(0.5, '#c4b5fd');
      gradient.addColorStop(1, '#7c3aed');
      ctx.fillStyle = gradient;

      const slot = w / BARS;
      const barW = Math.max(2 * dpr, slot * 0.55);

      for (let i = 0; i < BARS; i += 1) {
        let target = 0.04;
        if (s === 'listening' && data) {
          // Voice energy sits in the lower bins; mirror so the centre is loudest.
          const mirrored = Math.abs(i - BARS / 2) / (BARS / 2);
          const idx = Math.floor((1 - mirrored) * data.length * 0.45);
          target = Math.max(0.04, (data[idx] / 255) * (1.1 - mirrored * 0.4));
        } else if (!reduceMotion && s === 'speaking') {
          target = 0.18 + 0.5 * Math.abs(Math.sin(t * 5 + i * 0.5) * Math.sin(t * 2.3 + i * 0.21));
        } else if (!reduceMotion && s === 'thinking') {
          target = 0.08 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3 - i * 0.3));
        }
        levels[i] += (target - levels[i]) * 0.25;

        const bh = Math.max(3 * dpr, levels[i] * h * 0.92);
        const x = i * slot + (slot - barW) / 2;
        const y = (h - bh) / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, bh, barW / 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="waveform" aria-hidden="true" />;
}
