import confetti from "canvas-confetti";

const COLOURS = ["#d62718", "#ffd400", "#191714", "#f3eee2", "#2b5fd9"];
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Paper-confetti cannons from both bottom corners. */
export function confettiBurst(intensity = 1) {
  if (reducedMotion()) return;
  const base = { colors: COLOURS, ticks: 320, gravity: 0.9, scalar: 1.4, zIndex: 50 };
  confetti({ ...base, particleCount: Math.round(140 * intensity), angle: 60, spread: 70, startVelocity: 75, origin: { x: 0, y: 1 } });
  confetti({ ...base, particleCount: Math.round(140 * intensity), angle: 120, spread: 70, startVelocity: 75, origin: { x: 1, y: 1 } });
}

/** Slow drift of paper scraps from the top, for the minutes after a release lands. */
export function confettiDrift(durationMs: number) {
  if (reducedMotion()) return () => {};
  const end = Date.now() + durationMs;
  let raf = 0;
  const frame = () => {
    confetti({
      particleCount: 2,
      startVelocity: 0,
      ticks: 400,
      gravity: 0.5,
      scalar: 1.2,
      drift: Math.random() - 0.5,
      colors: COLOURS,
      origin: { x: Math.random(), y: -0.05 },
      zIndex: 50,
    });
    if (Date.now() < end) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

let ctx: AudioContext | null = null;

/** A short brass-ish "ta-da", synthesised so there's no audio file to ship. */
export function fanfare() {
  ctx ??= new AudioContext();
  const now = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.connect(master);

  // G4, C5, E5, then a held C major chord
  const notes: [number[], number, number][] = [
    [[392.0], 0, 0.14],
    [[523.25], 0.16, 0.14],
    [[659.25], 0.32, 0.14],
    [[523.25, 659.25, 783.99, 1046.5], 0.5, 1.4],
  ];
  for (const [freqs, start, length] of notes) {
    for (const f of freqs) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = detune;
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.5 / freqs.length, now + start + 0.03);
        gain.gain.setValueAtTime(0.5 / freqs.length, now + start + length - 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + length + 0.4);
        osc.connect(gain).connect(filter);
        osc.start(now + start);
        osc.stop(now + start + length + 0.5);
      }
    }
  }
}

export function unlockAudio() {
  ctx ??= new AudioContext();
  return ctx.resume();
}
