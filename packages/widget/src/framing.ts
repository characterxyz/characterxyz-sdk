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
      /** Move down rather than cut the top of her head. A round close-up crops around the face on purpose. */
      keepCrown?: boolean;
    }
  /** The whole clip, its height filling the box, centred on her face — standing. */
  | { fit: 'height' };

/** The corner portrait: a close-up. */
export const CLOSE_UP = { faceFraction: 0.26, at: { x: 0.5, y: 0.5 } } satisfies Shot;
/** The call card: head and shoulders with room above. */
export const MEDIUM = { faceFraction: 0.14, at: { x: 0.5, y: 0.34 }, keepCrown: true } satisfies Shot;
/** The launcher's half body: head to waist, her face high in the frame. */
export const HALF_BODY = { faceFraction: 0.16, at: { x: 0.5, y: 0.22 }, keepCrown: true } satisfies Shot;
/** The launcher's full body: the whole figure, standing on the box's bottom edge. */
export const FULL_BODY = { fit: 'height' } satisfies Shot;

/** Face centre to the top of the head, hair included, in eyes-to-chin spans. */
export const CROWN = 1.8;
/** The gap kept above her head, as a fraction of the box height. */
export const HEADROOM = 0.04;

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
  let top = boxH * shot.at.y - face.cy * height;
  // ⚠ KEEP HER CROWN IN THE BOX. The half body put her face centre 22% down
  // with eyes-to-chin at 16% of the box, which lands the top of her head (and
  // her hair) above the top edge: "half cuts the top of the head" (2026-10-20).
  // The crown sits about CROWN face-spans above the face centre; a shot that
  // keeps the crown and would cut it is moved down until it clears HEADROOM.
  const crown = top + (face.cy - face.span * CROWN) * height;
  if (shot.keepCrown && crown < boxH * HEADROOM) top += boxH * HEADROOM - crown;
  return { width, height, left: boxW * shot.at.x - face.cx * width, top };
}
