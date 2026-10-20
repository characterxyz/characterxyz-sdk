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
  /**
   * The studio masters. Only the call card zooms in far enough to need them;
   * everything else plays the 960 px copies when the server has them.
   */
  full?: boolean;
  class?: string;
}

/**
 * The character, framed on her face. Two looping clips (idle, talking)
 * crossfade; the anchor still shows until the first frame and wherever clips
 * cannot play. A character without a video shows her initial.
 *
 * NOTHING SHOWS UNTIL HER REAL SIZE IS KNOWN. She used to be placed with a
 * guessed 3:4 frame and a default face the moment the box had a size, then
 * re-placed when the still arrived ("loads big, then small", 2026-10-20). Now
 * a few sparkles hold her place and she fades in once, already framed.
 */
export function Portrait({ agent, shot, talking = false, still = false, full = false, class: cls }: PortraitProps) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [anchorDims, setAnchorDims] = useState<{ w: number; h: number } | null>(null);
  const [ready, setReady] = useState<Record<string, boolean>>({});
  // A copy that fails to load falls back to its master, once.
  const [broken, setBroken] = useState<Record<string, boolean>>({});
  const video = agent.video;
  const pick = (small: string | null | undefined, master: string | null, slot: string) =>
    !full && small && !broken[slot] ? small : master;
  const anchorMaster = video?.anchor?.alphaUrl ?? video?.anchor?.url ?? null;
  const anchorUrl = pick(video?.anchor?.smallUrl, anchorMaster, 'anchor');
  const usingSmallAnchor = anchorUrl !== anchorMaster;
  const canPlay = !still && !reducedMotion() && alphaVideoWorks();
  const idleClip = video?.clips.idle;
  const talkClip = video?.clips.talking ?? idleClip;
  const idle = pick(idleClip?.smallUrl, idleClip?.alphaUrl ?? null, 'idle');
  const talk = pick(talkClip?.smallUrl, talkClip?.alphaUrl ?? null, 'talk') ?? idle;

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

  // The face landmarks are in the FULL still's pixels. The server sends that
  // size with the copy; without a copy, the loaded still is the full one.
  const sent = video.anchor?.width && video.anchor?.height ? { w: video.anchor.width, h: video.anchor.height } : null;
  const fullDims = sent ?? (anchorDims && !usingSmallAnchor ? anchorDims : null);
  const face = faceOf(video, fullDims?.w ?? 0, fullDims?.h ?? 0);
  const p = size.w && size.h && fullDims ? place(face, fullDims.w / fullDims.h, size.w, size.h, shot) : null;
  const style: Record<string, string | number> = p ? { width: `${p.width}px`, height: `${p.height}px`, left: `${p.left}px`, top: `${p.top}px` } : {};
  const showIdle = !!p && canPlay && !!idle && !!ready.idle;
  const showTalk = !!p && canPlay && !!talk && talk !== idle && !!ready.talk && talking;
  const shown = !!p && (!!anchorDims || showIdle);

  return (
    <div ref={box} class={`portrait ${cls ?? ''}`} aria-hidden="true">
      <img
        class="portrait__media"
        src={anchorUrl}
        alt=""
        draggable={false}
        style={{ ...style, opacity: p && anchorDims && !showIdle ? 1 : 0 }}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          setAnchorDims({ w: img.naturalWidth, h: img.naturalHeight });
        }}
        onError={() => usingSmallAnchor && setBroken((b) => ({ ...b, anchor: true }))}
      />
      {canPlay && idle ? (
        <Clip
          src={idle}
          style={style}
          visible={showIdle && !showTalk}
          onReady={() => setReady((r) => ({ ...r, idle: true }))}
          onFail={() => setBroken((b) => ({ ...b, idle: true }))}
        />
      ) : null}
      {canPlay && talk && talk !== idle ? (
        <Clip
          src={talk}
          style={style}
          visible={showTalk}
          onReady={() => setReady((r) => ({ ...r, talk: true }))}
          onFail={() => setBroken((b) => ({ ...b, talk: true }))}
        />
      ) : null}
      <span class={`portrait__sparkle${shown ? ' is-done' : ''}`}>
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

function Clip({
  src,
  style,
  visible,
  onReady,
  onFail,
}: {
  src: string;
  style: Record<string, string | number>;
  visible: boolean;
  onReady: () => void;
  onFail: () => void;
}) {
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
      onError={onFail}
    />
  );
}
