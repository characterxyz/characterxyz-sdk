/**
 * Plays the agent's streamed voice (PCM16 chunks) gaplessly, and reports how
 * loud it is right now so a UI can draw a ring that follows the voice.
 *
 * Each chunk becomes an AudioBuffer scheduled right after the last one; the
 * first waits a short pre-roll so a slow second chunk does not open a gap.
 */

export interface PlayerOptions {
  sampleRate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  volume?: number;
}

const PREROLL_S = 0.12;

let shared: AudioContext | null = null;

/** One output context for the page, created on first use (after a gesture). */
export function audioContext(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new AudioContext({ latencyHint: 'interactive' });
  if (shared.state === 'suspended') void shared.resume().catch(() => {});
  return shared;
}

export class PcmPlayer {
  private readonly ctx: AudioContext;
  private readonly gain: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly data: Uint8Array<ArrayBuffer>;
  private nextAt = 0;
  private started = false;
  private ended = false;
  private finishing = false;
  private sources = new Set<AudioBufferSourceNode>();
  private startedAt = 0;
  readonly sampleRate: number;

  constructor(private readonly opts: PlayerOptions = {}) {
    this.ctx = audioContext();
    this.sampleRate = opts.sampleRate ?? 16_000;
    this.gain = this.ctx.createGain();
    this.gain.gain.value = opts.volume ?? 1;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    this.gain.connect(this.analyser).connect(this.ctx.destination);
  }

  /** Queue PCM16 little-endian mono bytes. */
  enqueue(bytes: Uint8Array): void {
    if (this.ended || bytes.byteLength < 2) return;
    const count = Math.floor(bytes.byteLength / 2);
    const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
    const buf = this.ctx.createBuffer(1, count, this.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < count; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain);
    const now = this.ctx.currentTime;
    if (this.nextAt < now) this.nextAt = now + (this.started ? 0.02 : PREROLL_S);
    src.start(this.nextAt);
    if (!this.started) {
      this.started = true;
      const delayMs = Math.max(0, (this.nextAt - now) * 1000);
      this.startedAt = performance.now() + delayMs;
      setTimeout(() => this.opts.onStart?.(), delayMs);
    }
    this.nextAt += buf.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.finishing && this.sources.size === 0) this.finish();
    };
  }

  /** No more chunks: report the end once the queue has played out. */
  end(): void {
    this.finishing = true;
    if (this.sources.size === 0) this.finish();
  }

  /** Silence now (an interruption). Does not call `onEnd`. */
  stop(): void {
    this.ended = true;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* not started */
      }
    }
    this.sources.clear();
    this.gain.disconnect();
  }

  /** Milliseconds of audio actually heard so far. */
  playedMs(): number {
    return this.started ? Math.max(0, performance.now() - this.startedAt) : 0;
  }

  /** Loudness now, 0..1. */
  level(): number {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (let i = 0; i < this.data.length; i++) {
      const v = (this.data[i]! - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.data.length) * 3);
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    this.gain.disconnect();
    this.opts.onEnd?.();
  }
}
