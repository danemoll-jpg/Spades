// A tiny synthesized sound engine using the Web Audio API — no external audio files to
// download or ship, so it works completely offline and stays self-contained. Every sound
// here is a couple of oscillator envelopes, not a recording.
import { SfxCue } from '@spades/engine';

export type SoundName = Exclude<SfxCue, 'matchOver'> | 'matchOverWin' | 'matchOverLose' | 'matchOverDraw';

const MUTE_KEY = 'spades-muted';

let ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call from inside a real user-gesture handler (e.g. a button click) — browsers block audio otherwise. */
export function unlockAudio(): void {
  const c = getContext();
  if (c.state === 'suspended') void c.resume();
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // localStorage unavailable (private browsing etc.) — just won't persist, no big deal.
  }
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine', peakGain = 0.18): void {
  const c = getContext();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function sweep(freqStart: number, freqEnd: number, startOffset: number, duration: number, type: OscillatorType = 'sawtooth', peakGain = 0.16): void {
  const c = getContext();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  const t0 = c.currentTime + startOffset;
  osc.frequency.setValueAtTime(freqStart, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

/** A short, dry card-snap — a quick high-passish square-wave tick. */
function snap(startOffset: number, peakGain = 0.13): void {
  tone(720, startOffset, 0.03, 'square', peakGain);
  tone(480, startOffset + 0.015, 0.04, 'square', peakGain * 0.7);
}

const PLAYERS: Record<SoundName, () => void> = {
  deal: () => {
    // A quick shuffly flutter to open a new hand.
    sweep(300, 700, 0, 0.2, 'triangle', 0.13);
    sweep(650, 900, 0.07, 0.14, 'triangle', 0.1);
  },
  bid: () => tone(440, 0, 0.06, 'sine', 0.1),
  play: () => snap(0),
  spadesBroken: () => {
    tone(220, 0, 0.08, 'sawtooth', 0.14);
    tone(180, 0.06, 0.12, 'sawtooth', 0.12);
  },
  trickWon: () => {
    tone(587, 0, 0.09, 'triangle', 0.12);
    tone(740, 0.08, 0.12, 'triangle', 0.12);
  },
  handScored: () => {
    tone(523, 0, 0.1, 'sine', 0.13);
    tone(659, 0.1, 0.16, 'sine', 0.13);
  },
  matchOverWin: () => {
    tone(523, 0, 0.14, 'triangle', 0.17);
    tone(659, 0.14, 0.14, 'triangle', 0.17);
    tone(784, 0.28, 0.14, 'triangle', 0.17);
    tone(1046, 0.42, 0.32, 'triangle', 0.2);
  },
  matchOverLose: () => {
    // The classic "sad trombone" — a descending pitch-bent sweep, twice for emphasis.
    sweep(300, 110, 0, 0.5, 'sawtooth', 0.19);
    sweep(300, 90, 0.48, 0.5, 'sawtooth', 0.17);
  },
  matchOverDraw: () => {
    tone(440, 0, 0.15, 'sine', 0.14);
    tone(392, 0.15, 0.22, 'sine', 0.14);
  },
};

export function playSound(name: SoundName): void {
  if (isMuted()) return;
  try {
    PLAYERS[name]();
  } catch {
    // Audio can fail for all sorts of environment reasons — never let it break gameplay.
  }
}
