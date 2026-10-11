import type { AgentCard } from '@characterxyz/web';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { faceOf, place, type Shot } from './framing.js';

/**
 * WebM with alpha plays in Chromium and Firefox. Safari ignores the alpha and
 * would draw the clip's green screen, so it gets the cut-out still instead.
 */
function alphaVideoWorks(): boolean {
  if (typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  const safari = /Safari\//.test(ua) && !/(Chrome|Chromium|Edg|OPR|Firefox)\//.test(ua);
  if (safari) return false;
  const v = document.createElement('video');
  return v.canPlayType('video/webm; codecs="vp9"') !== '';
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface PortraitProps {
  agent: AgentCard;
  shot: Shot;
  /** Play the talking clip instead of idle. */
  talking?: boolean;
  /** Freeze on the still (closed launcher on a slow page, reduced motion). */
  still?: boolean;
  class?: string;
}

/**
 * The character, framed on her face. Two looping clips (idle, talking)
 * crossfade; the anchor still shows until the first frame and wherever clips
 * cannot play. A character without a video shows her initial.
 */
export function Portrait({ agent, shot, talking = false, still = false, class: cls }: PortraitProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [anchorDims, setAnchorDims] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  const video = agent.video;
  const anchorUrl = video?.anchor?.alphaUrl ?? video?.anchor?.url ?? null;
  const canPlay = !still && !reducedMotion() && alphaVideoWorks();
  const idle = video?.clips.idle?.alphaUrl ?? null;
  const talk = video?.clips.talking?.alphaUrl ?? idle;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!video || !anchorUrl) {
    return (
      <div ref={box} class={`portrait portrait--initial ${cls ?? ''}`} aria-hidden="true">
        <span>{(agent.name || '?').slice(0, 1).toUpperCase()}</span>
      </div>
    );
  }

  const aspect = anchorDims ? anchorDims.w / anchorDims.h : 0.75;
  const face = faceOf(video, anchorDims?.w ?? 0, anchorDims?.h ?? 0);
  const p = size.w && size.h ? place(face, aspect, size.w, size.h, shot) : null;
  const style: Record<string, string | number> = p ? { width: `${p.width}px`, height: `${p.height}px`, left: `${p.left}px`, top: `${p.top}px` } : { opacity: 0 };
  const showIdle = canPlay && !!idle && !!ready.idle;
  const showTalk = canPlay && !!talk && talk !== idle && !!ready.talk && talking;

  return (
    <div ref={box} class={`portrait ${cls ?? ''}`} aria-hidden="true">
      <img
        class="portrait__media"
        src={anchorUrl}
        alt=""
        draggable={false}
        style={{ ...style, opacity: p ? (showIdle ? 0 : 1) : 0 }}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          setAnchorDims({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      {canPlay && idle ? <Clip src={idle} style={style} visible={showIdle && !showTalk} onReady={() => setReady((r) => ({ ...r, idle: true }))} /> : null}
      {canPlay && talk && talk !== idle ? <Clip src={talk} style={style} visible={showTalk} onReady={() => setReady((r) => ({ ...r, talk: true }))} /> : null}
    </div>
  );
}

function Clip({ src, style, visible, onReady }: { src: string; style: Record<string, string | number>; visible: boolean; onReady: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Only the clip on screen plays; a hidden one costs nothing.
    if (visible) void v.play().catch(() => {});
    else v.pause();
  }, [visible]);
  return (
    <video
      ref={ref}
      class="portrait__media portrait__clip"
      src={src}
      muted
      loop
      playsInline
      preload="auto"
      style={{ ...style, opacity: visible ? 1 : 0 }}
      onLoadedData={onReady}
    />
  );
}
