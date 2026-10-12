import type { VideoCharacter } from '@characterxyz/web';

/**
 * Where to put a full-body character so her face sits where a portrait wants
 * it. All in the media's own normalised coordinates (0..1), read from the
 * anchor still's eyes and chin.
 */
export interface Face {
  /** Centre of the face. */
  cx: number;
  cy: number;
  /** Eyes-to-chin, as a fraction of the media's height. */
  span: number;
}

/** Ananya-shaped default: a standing figure whose head is near the top. */
const FALLBACK: Face = { cx: 0.5, cy: 0.12, span: 0.06 };

export function faceOf(video: VideoCharacter | null, anchorW: number, anchorH: number): Face {
  const eyes = video?.face?.eyes;
  const chin = video?.face?.chin;
  if (!eyes || !chin || !anchorW || !anchorH) return FALLBACK;
  const ex = (eyes.left.x + eyes.right.x) / 2;
  const ey = (eyes.left.y + eyes.right.y) / 2;
  const span = (chin.y - ey) / anchorH;
  if (!(span > 0.005 && span < 0.5)) return FALLBACK;
  return { cx: ex / anchorW, cy: (ey + chin.y) / 2 / anchorH, span };
}

export type Shot =
  | {
      /** Eyes-to-chin as a fraction of the box height. */
      faceFraction: number;
      /** Where the face centre lands in the box, 0..1. */
      at: { x: number; y: number };
    }
  /** The whole clip, its height filling the box, centred on her face — standing. */
  | { fit: 'height' };

/** The corner portrait: a close-up. */
export const CLOSE_UP = { faceFraction: 0.26, at: { x: 0.5, y: 0.5 } } satisfies Shot;
/** The call card: head and shoulders with room above. */
export const MEDIUM = { faceFraction: 0.14, at: { x: 0.5, y: 0.34 } } satisfies Shot;
/** The launcher's half body: head to waist, her face high in the frame. */
export const HALF_BODY = { faceFraction: 0.16, at: { x: 0.5, y: 0.22 } } satisfies Shot;
/** The launcher's full body: the whole figure, standing on the box's bottom edge. */
export const FULL_BODY = { fit: 'height' } satisfies Shot;

export interface Placement {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** Pixel placement of the media inside a `boxW`×`boxH` box. */
export function place(face: Face, mediaAspect: number, boxW: number, boxH: number, shot: Shot): Placement {
  if ('fit' in shot) {
    const width = boxH * mediaAspect;
    return { width, height: boxH, left: boxW / 2 - face.cx * width, top: 0 };
  }
  const height = (boxH * shot.faceFraction) / face.span;
  const width = height * mediaAspect;
  return {
    width,
    height,
    left: boxW * shot.at.x - face.cx * width,
    top: boxH * shot.at.y - face.cy * height,
  };
}
