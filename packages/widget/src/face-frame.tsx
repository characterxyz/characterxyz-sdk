import type { Call, CallState, CharacterXYZ } from '@characterxyz/web';
import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * The agent's face, drawn by Character XYZ's own renderer in a frame
 * (`<faceUrl>` = the app's `/embed/face`), so the widget shows her exactly as
 * the app does — her clips, the Neural Lip Sync mouth, her own teeth and eyes —
 * without carrying the renderer itself (canon/docs/sdk-design.md, lip sync).
 *
 * The frame holds no session: this side fetches the face data with the
 * widget's session and posts it in, then forwards the call's streamed face and
 * the voice's audible clock. Until the frame says it is ready, the caller keeps
 * showing the portrait underneath.
 */

export type FaceStatus = 'loading' | 'ready' | 'unavailable';

/** What the frame wants the face's mood to be (read when the call connects). */
export const faceEmotion = { current: null as string | null };

function cameoState(s: CallState | null): string {
  if (!s) return 'idle';
  if (s.speaking) return 'speaking';
  if (s.agentState === 'thinking') return 'reasoning';
  if (s.agentState === 'listening' || s.phase === 'live') return 'listening';
  return 'idle';
}

export function FaceFrame({
  client,
  call,
  state,
  src,
  onStatus,
}: {
  client: CharacterXYZ;
  call: Call | null;
  state: CallState | null;
  src: string;
  onStatus: (s: FaceStatus) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const origin = (() => {
    try {
      return new URL(src).origin;
    } catch {
      return null;
    }
  })();

  const post = (msg: Record<string, unknown>, transfer?: Transferable[]) => {
    const w = frame.current?.contentWindow;
    if (w && origin) w.postMessage({ cx: 'face', ...msg }, origin, transfer ?? []);
  };

  // The frame's own messages: loaded → send the skin; ready / unavailable → report.
  useEffect(() => {
    if (!origin) {
      onStatus('unavailable');
      return;
    }
    let cancelled = false;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== origin) return;
      const d = e.data as { cx?: string; type?: string; faceEmotion?: string | null };
      if (d?.cx !== 'face') return;
      if (d.type === 'loaded') {
        loadedRef.current = true;
        setLoaded(true);
        client
          .videoAvatar()
          .then((avatar) => {
            if (cancelled) return;
            if (!avatar) onStatus('unavailable');
            else post({ type: 'init', avatar });
          })
          .catch(() => !cancelled && onStatus('unavailable'));
      } else if (d.type === 'ready') {
        faceEmotion.current = typeof d.faceEmotion === 'string' ? d.faceEmotion : null;
        onStatus('ready');
      } else if (d.type === 'unavailable') {
        onStatus('unavailable');
      }
    };
    window.addEventListener('message', onMessage);
    // A frame that never answers (blocked, offline) leaves the portrait in place.
    const timeout = setTimeout(() => !cancelled && !loadedRef.current && onStatus('unavailable'), 15_000);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, origin]);

  // The agent's state, as the app's renderer names it.
  const cameo = cameoState(state);
  useEffect(() => {
    if (loaded) post({ type: 'state', state: cameo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameo, loaded]);

  // The streamed face, the lines' starts and ends, and the voice's clock.
  useEffect(() => {
    if (!call || !loaded) return;
    const offs = [
      call.on('face', ({ corr, payload }) => post({ type: 'batch', corr, payload }, [payload.buffer as ArrayBuffer])),
      call.on('line', ({ corr, event }) => {
        if (event === 'audible') post({ type: 'audible', corr, ms: call.audible()?.ms ?? 0 });
        else post({ type: 'end', corr });
      }),
    ];
    let raf = 0;
    const tick = () => {
      const a = call.audible();
      if (a) post({ type: 'clock', corr: a.corr, ms: a.ms });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      offs.forEach((f) => f());
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, loaded]);

  if (!origin) return null;
  return (
    <iframe
      ref={frame}
      class="face-frame"
      src={src}
      title=""
      aria-hidden="true"
      tabIndex={-1}
      allow="autoplay"
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="strict-origin"
    />
  );
}
