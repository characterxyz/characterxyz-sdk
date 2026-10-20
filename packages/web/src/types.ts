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
  /** The same clip at 960 px tall, for the launcher; present once the server has made it. */
  smallUrl?: string | null;
}

export interface VideoCharacter {
  anchor: {
    url: string | null;
    alphaUrl: string | null;
    /** The cut-out still at 960 px tall (WebP), for the launcher. */
    smallUrl?: string | null;
    /** The full still's size: the face landmarks are in its pixels, not the copy's. */
    width?: number;
    height?: number;
  } | null;
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
  /** Why, in words a visitor can read (a daily limit, a slow-down). */
  error?: string;
  /** On a reply just written: what the visitor might ask next. Not kept in the history. */
  suggestions?: string[];
  /** On a reply just written: she invited the visitor to leave their details; show this card. */
  askDetails?: DetailsForm;
  /** On a reply just written: the card's settings while details may still be left (not an invitation). */
  detailsForm?: DetailsForm;
}

/** The contact card: which fields to ask, and the consent line to show. */
export interface DetailsForm {
  /** Always `name` and `email`; `phone` and `company` when the key asks for them. */
  fields: ('name' | 'email' | 'phone' | 'company')[];
  /** The brand's privacy policy, linked from the consent line. */
  privacyUrl: string | null;
  /** Shown under the card; sending is the consent. */
  consent: string;
}

/** What a visitor leaves. */
export interface ContactDetails {
  name: string;
  email: string;
  phone?: string;
  company?: string;
}

/**
 * How the agent opens the conversation on this site, written by the agent
 * from her own persona and knowledge (and the key's product).
 */
export interface Opening {
  /** Her first message in an empty chat. */
  greeting: string;
  /** One line for a visitor coming back to an earlier conversation. */
  welcomeBack: string;
  /** A few words to show beside the closed launcher. May be empty. */
  teaser: string;
  /** What a visitor would most likely ask first. May be empty. */
  suggestions: string[];
  /** The contact card to offer before a call; null when nothing receives leads or this conversation was asked. */
  details?: DetailsForm | null;
  /** The language she wrote it in, when the plan localizes and the browser is not English. */
  locale?: string;
  /** The chat window's labels in that language, by key (see the widget's `strings.ts`). */
  strings?: Record<string, string>;
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
  | 'unavailable'
  /** Nobody spoke for a minute, so the server hung up. */
  | 'silence'
  /** The site's call minutes for today are used up. */
  | 'daily_limit';

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
