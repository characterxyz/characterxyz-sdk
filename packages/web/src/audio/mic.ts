/**
 * The microphone as the agent socket wants it: 16 kHz mono PCM16, 30 ms
 * (480-sample) frames, sent continuously.
 *
 * Resampled in an AudioWorklet from whatever rate the device runs at. A
 * context forced to 16 kHz would be simpler and is refused by Firefox for a
 * MediaStream source at another rate, so the worklet does it.
 */

export const TARGET_RATE = 16_000;
export const FRAME_SAMPLES = 480;

const WORKLET = `
class CxyzMic extends AudioWorkletProcessor {
  constructor(o) {
    super();
    this.ratio = sampleRate / ${TARGET_RATE};
    this.pos = 0;
    this.lp = 0;
    this.alpha = Math.min(1, 2 * Math.PI * 7000 / sampleRate / (1 + 2 * Math.PI * 7000 / sampleRate));
    this.out = new Int16Array(${FRAME_SAMPLES});
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.lp += this.alpha * (ch[i] - this.lp);
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.lp));
        this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (this.n === ${FRAME_SAMPLES}) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(${FRAME_SAMPLES});
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('cxyz-mic', CxyzMic);
`;

export interface MicOptions {
  onFrame: (pcm: ArrayBuffer, level: number) => void;
  deviceId?: string;
}

export interface Mic {
  stop(): void;
  setMuted(m: boolean): void;
  readonly muted: boolean;
}

/** RMS of a PCM16 frame, 0..1. */
export function levelOf(pcm: ArrayBuffer): number {
  const s = new Int16Array(pcm);
  if (!s.length) return 0;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const v = s[i]! / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / s.length);
}

export async function openMic(opts: MicOptions): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone here.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: opts.deviceId ? { exact: opts.deviceId } : undefined,
      channelCount: 1,
      // The agent's voice comes out of the speakers; without cancellation it
      // would hear itself and answer.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  const source = ctx.createMediaStreamSource(stream);
  let muted = false;
  const deliver = (buf: ArrayBuffer) => {
    if (muted) {
      // Silence, not nothing: the server keeps a pre-roll of the last frames
      // and splices it onto the next utterance.
      opts.onFrame(new ArrayBuffer(buf.byteLength), 0);
      return;
    }
    opts.onFrame(buf, levelOf(buf));
  };

  let node: AudioNode;
  let teardown: () => void;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const w = new AudioWorkletNode(ctx, 'cxyz-mic');
    w.port.onmessage = (e) => deliver(e.data as ArrayBuffer);
    node = w;
    teardown = () => {
      w.port.onmessage = null;
    };
  } catch {
    // A strict Content-Security-Policy can refuse a blob: worklet. The old
    // ScriptProcessor path is deprecated but universal.
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    const ratio = ctx.sampleRate / TARGET_RATE;
    let pos = 0;
    let out = new Int16Array(FRAME_SAMPLES);
    let n = 0;
    sp.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        pos += 1;
        if (pos >= ratio) {
          pos -= ratio;
          const s = Math.max(-1, Math.min(1, ch[i]!));
          out[n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
          if (n === FRAME_SAMPLES) {
            deliver(out.buffer);
            out = new Int16Array(FRAME_SAMPLES);
            n = 0;
          }
        }
      }
    };
    node = sp;
    teardown = () => {
      sp.onaudioprocess = null;
    };
  }
  source.connect(node);
  // A worklet/processor only runs while connected to the destination; a gain
  // of zero keeps the room from hearing itself.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  node.connect(sink).connect(ctx.destination);
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

  return {
    get muted() {
      return muted;
    },
    setMuted(m: boolean) {
      muted = m;
      for (const t of stream.getAudioTracks()) t.enabled = !m;
    },
    stop() {
      teardown();
      try {
        source.disconnect();
        node.disconnect();
      } catch {
        /* already disconnected */
      }
      for (const t of stream.getTracks()) t.stop();
      void ctx.close().catch(() => {});
    },
  };
}
