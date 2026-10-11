/** What the server says about the agent a session talks to. */
export interface AgentCard {
  id: string;
  name: string;
  tagline: string;
  locale: string | null;
  /** A 2D cameo's settings when the agent has no video character. Opaque. */
  cameo: unknown;
  video: VideoCharacter | null;
}

export interface VideoClip {
  url: string | null;
  /** VP9 WebM with alpha (Chromium, Firefox). */
  alphaUrl: string | null;
  /** H.264 MP4, colour | matte side by side (Safari, with a canvas unpack). */
  packedUrl: string | null;
  seconds: number | null;
}

export interface VideoCharacter {
  anchor: { url: string | null; alphaUrl: string | null } | null;
  clips: Partial<Record<'idle' | 'talking' | 'listening' | 'entrance', VideoClip>>;
  /** Where the face is, in the anchor still's pixels. */
  face: {
    eyes: { left: { x: number; y: number }; right: { x: number; y: number } } | null;
    chin: { x: number; y: number } | null;
  };
}

/** What this site may do, decided by the brand's plan. */
export interface Features {
  chat: boolean;
  call: boolean;
  maxCallMinutes: number;
}

export interface SessionInfo {
  token: string;
  /** Unix seconds. */
  expiresAt: number;
  visitorId: string;
  agent: AgentCard;
  features: Features;
  /** The look set in the Embed designer. Opaque to the core. */
  appearance: Record<string, unknown>;
  mode: 'live' | 'test';
}

export interface ChatMessage {
  id: string;
  role: 'visitor' | 'agent';
  text: string;
  createdAt: string;
  /** True while an agent reply is still being written. */
  streaming?: boolean;
  /** Set when a visitor's message could not be answered. */
  failed?: boolean;
}

export type CallPhase =
  | 'idle'
  | 'joining'
  | 'queued'
  | 'ready'
  | 'connecting'
  | 'live'
  | 'ended';

export type CallEndReason =
  | 'hangup'
  | 'left'
  | 'missed'
  | 'timeout'
  | 'limit'
  | 'credits'
  | 'busy'
  | 'failed'
  | 'mic-denied'
  | 'unavailable';

export interface CallState {
  phase: CallPhase;
  callId: string | null;
  /** 1-based place in line while queued. */
  position: number | null;
  etaSeconds: number | null;
  /** While ready: seconds left to join. */
  holdSeconds: number | null;
  /** While live: the cap, and how long it has run. */
  maxSeconds: number | null;
  startedAt: number | null;
  endReason: CallEndReason | null;
  muted: boolean;
  /** The agent is speaking right now. */
  speaking: boolean;
  /** `listening` | `thinking` | `talking` | `idle`, as the server reports it. */
  agentState: string;
  error: string | null;
}

export interface Caption {
  id: string;
  role: 'visitor' | 'agent';
  text: string;
}
