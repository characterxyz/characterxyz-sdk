import type { Call, CallState, Caption, CharacterXYZ, ChatMessage } from '@characterxyz/web';
import { Fragment } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import type { WidgetConfig } from './config.js';
import { blocks, clock, endCopy, eta, ordinal, type Inline } from './format.js';
import { CLOSE_UP, MEDIUM } from './framing.js';
import { BackIcon, ChatIcon, CloseIcon, HangUpIcon, MicIcon, MicOffIcon, PhoneIcon, RetryIcon, SendIcon, SparkIcon } from './icons.js';
import { Portrait } from './portrait.js';

export type View = 'closed' | 'chat' | 'call';

export interface AppApi {
  open(view?: Exclude<View, 'closed'>): void;
  close(): void;
}

export interface AppProps {
  client: CharacterXYZ;
  config: WidgetConfig;
  /** Lets the element drive the app (`open()`, `close()`). */
  bind: (api: AppApi) => void;
  onView: (v: View) => void;
}

const GREETED_KEY = 'cxyz:greeted';

function storage(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A short two-note chime: "your turn". */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * 0.16);
      g.gain.linearRampToValueAtTime(0.18, now + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.16);
      o.stop(now + i * 0.16 + 0.55);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    // no audio: the banner still says it
  }
}

function useChat(client: CharacterXYZ) {
  const [messages, setMessages] = useState<readonly ChatMessage[]>(client.chat.messages);
  const [busy, setBusy] = useState(client.chat.isBusy);
  useEffect(() => {
    const a = client.chat.on('messages', setMessages);
    const b = client.chat.on('busy', setBusy);
    return () => {
      a();
      b();
    };
  }, [client]);
  return { messages, busy };
}

function useCall(client: CharacterXYZ) {
  const [call, setCall] = useState<Call | null>(client.call);
  const [state, setState] = useState<CallState | null>(client.call?.state ?? null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  useEffect(() => client.on('call', (c) => c && setCall(c)), [client]);
  useEffect(() => {
    if (!call) return;
    setState(call.state);
    setCaptions([]);
    const offs = [
      call.on('state', setState),
      call.on('caption', (c) => setCaptions((prev) => [...prev.filter((x) => x.id !== c.id), c].slice(-4))),
      call.on('captionRemoved', (id) => setCaptions((prev) => prev.filter((x) => x.id !== id))),
    ];
    return () => offs.forEach((f) => f());
  }, [call]);
  return { call, state, captions, reset: () => setCall(null) };
}

/** Seconds since `startedAt`, ticking. */
function useElapsed(startedAt: number | null, running: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
}

/** Feed `--cx-lvl` from the agent's voice on every frame, without re-rendering. */
function useVoiceLevel(call: Call | null, el: { current: HTMLElement | null }, active: boolean) {
  useEffect(() => {
    if (!call || !active) return;
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const lvl = call.voiceLevel();
      smooth = smooth * 0.7 + lvl * 0.3;
      el.current?.style.setProperty('--cx-lvl', smooth.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [call, active, el]);
}

function Text({ parts }: { parts: Inline[] }) {
  return (
    <Fragment>
      {parts.map((p, i) =>
        p.t === 'b' ? (
          <strong key={i}>{p.v}</strong>
        ) : p.t === 'i' ? (
          <em key={i}>{p.v}</em>
        ) : p.t === 'code' ? (
          <code key={i}>{p.v}</code>
        ) : p.t === 'link' ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow">
            {p.v}
          </a>
        ) : (
          p.v.split('\n').map((line, j, arr) => (
            <Fragment key={`${i}.${j}`}>
              {line}
              {j < arr.length - 1 ? <br /> : null}
            </Fragment>
          ))
        ),
      )}
    </Fragment>
  );
}

function Rich({ text }: { text: string }) {
  return (
    <Fragment>
      {blocks(text).map((b, i) =>
        b.t === 'ul' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Text parts={it} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Text parts={b.parts} />
          </p>
        ),
      )}
    </Fragment>
  );
}

export function App({ client, config, bind, onView }: AppProps) {
  const agent = client.agent;
  const features = client.features;
  const canChat = config.showChat && features.chat;
  const canCall = config.showCall && features.call;
  const [view, setViewRaw] = useState<View>(config.open ? (canChat ? 'chat' : 'call') : 'closed');
  const [closing, setClosing] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const { messages, busy } = useChat(client);
  const { call, state, captions, reset } = useCall(client);
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const subtitle = config.subtitle ?? agent.tagline;
  const name = agent.name || 'Assistant';

  const setView = useCallback(
    (v: View) => {
      setViewRaw(v);
      onView(v);
    },
    [onView],
  );

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setView('closed');
    }, 200);
  }, [setView]);

  const open = useCallback(
    (v: Exclude<View, 'closed'> = canChat ? 'chat' : 'call') => {
      setGreeting(false);
      storage(GREETED_KEY, '1');
      setView(v);
      if (v === 'chat') void client.chat.load().catch(() => {});
    },
    [canChat, client, setView],
  );

  useEffect(() => bind({ open, close }), [bind, open, close]);

  useEffect(() => {
    if (config.open && canChat) void client.chat.load().catch(() => {});
  }, [client, config.open, canChat]);

  // The greeting: once per visitor, after a beat, never over an open panel.
  useEffect(() => {
    if (!config.greeting || storage(GREETED_KEY)) return;
    const t = setTimeout(() => setGreeting(true), config.greetingDelay * 1000);
    return () => clearTimeout(t);
  }, [config.greeting, config.greetingDelay]);

  // Esc closes.
  useEffect(() => {
    if (view === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, close]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, view, state?.phase]);

  useEffect(() => {
    if (view === 'chat') setTimeout(() => input.current?.focus({ preventScroll: true }), 60);
  }, [view]);

  // Your turn: a chime, and the tab title if the visitor is elsewhere.
  const phase = state?.phase ?? 'idle';
  useEffect(() => {
    if (phase !== 'ready' || !call) return;
    chime();
    if (view === 'call') {
      call.accept();
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) {
      const title = document.title;
      document.title = `● ${name} is ready for you`;
      const restore = () => {
        document.title = title;
        document.removeEventListener('visibilitychange', restore);
      };
      document.addEventListener('visibilitychange', restore);
    }
  }, [phase, call, view, name]);

  const live = phase === 'live' || phase === 'connecting';
  useVoiceLevel(call, stage, live && view === 'call');
  const elapsed = useElapsed(state?.startedAt ?? null, phase === 'live');
  // Every hook above the early returns: Preact keys hooks by call order.
  const startPos = useMemoStart(call, state?.position ?? 1);

  const startCall = async () => {
    setView('call');
    try {
      await client.startCall({ autoAccept: false });
    } catch {
      // the call's own state carries the reason
    }
  };

  const sendText = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setDraft('');
    if (input.current) input.current.style.height = '';
    try {
      await client.chat.send(t);
    } catch {
      // the message shows as failed with a retry
    }
  };

  const lastAgentStreaming = messages.length > 0 && messages[messages.length - 1]!.role === 'agent' && messages[messages.length - 1]!.streaming;

  // ---------------------------------------------------------------- closed
  if (view === 'closed') {
    const inLine = phase === 'queued' || phase === 'ready' || phase === 'live' || phase === 'connecting';
    return (
      <div class="dock" part="launcher">
        {client.mode === 'test' ? <span class="testmode">TEST</span> : null}
        {greeting ? (
          <div class="greeting" part="greeting" role="status" onClick={() => open()}>
            {config.greeting}
            <button
              class="greeting__close"
              aria-label="Dismiss"
              onClick={(e) => {
                e.stopPropagation();
                setGreeting(false);
                storage(GREETED_KEY, '1');
              }}
            >
              <CloseIcon size={14} />
            </button>
          </div>
        ) : null}
        <button class="presence" part="presence" aria-label={`Open ${name}`} onClick={() => open(inLine ? 'call' : undefined)}>
          <span class="presence__ring" />
          <span class="presence__face">
            <Portrait agent={agent} shot={CLOSE_UP} />
          </span>
          <span class="presence__dot" />
        </button>
        <div class="pill" part="actions">
          {canChat ? (
            <button aria-label={`Chat with ${name}`} onClick={() => open('chat')}>
              <ChatIcon size={18} />
              <span>Chat</span>
            </button>
          ) : null}
          {canCall ? (
            <button class="pill__call" aria-label={inLine ? 'Back to your call' : `Call ${name}`} onClick={() => (inLine ? open('call') : void startCall())}>
              <PhoneIcon size={18} />
              <span>{inLine ? (phase === 'queued' ? `${ordinal(state?.position ?? 1)} in line` : 'On call') : 'Call'}</span>
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- chat
  const head = (
    <div class="head" part="header">
      <div class="head__face">
        <Portrait agent={agent} shot={CLOSE_UP} talking={!!lastAgentStreaming} />
      </div>
      <div class="head__who">
        <div class="head__name">{name}</div>
        <div class="head__sub">
          <i />
          {busy ? 'Typing…' : subtitle || 'Online'}
        </div>
      </div>
      {canCall && view === 'chat' ? (
        <button class="icon-btn icon-btn--accent" aria-label={`Call ${name}`} title={`Call ${name}`} onClick={() => (call && phase !== 'ended' ? setView('call') : void startCall())}>
          <PhoneIcon size={18} />
        </button>
      ) : null}
      <button class="icon-btn" aria-label="Close" onClick={close}>
        <CloseIcon />
      </button>
    </div>
  );

  if (view === 'chat') {
    return (
      <div class={`panel ${closing ? 'is-closing' : ''}`} part="panel" role="dialog" aria-label={`Chat with ${name}`}>
        {head}
        {call && (phase === 'queued' || phase === 'ready') ? (
          <div class="banner" part="banner" role="status">
            <div class="banner__text">
              {phase === 'queued' ? (
                <Fragment>
                  You're <b>{ordinal(state?.position ?? 1)}</b> in line for a call · {eta(state?.etaSeconds ?? null)}
                </Fragment>
              ) : (
                <Fragment>
                  <b>{name} is ready for you</b> · {state?.holdSeconds ?? 30}s to join
                </Fragment>
              )}
            </div>
            {phase === 'ready' ? (
              <button
                class="btn btn--accent btn--glow"
                onClick={() => {
                  call.accept();
                  setView('call');
                }}
              >
                Join
              </button>
            ) : (
              <button class="btn" onClick={() => setView('call')}>
                View
              </button>
            )}
          </div>
        ) : null}
        <div class="log" ref={log} role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 ? (
            <div class="empty">
              <div class="empty__face">
                <Portrait agent={agent} shot={CLOSE_UP} />
              </div>
              <div class="empty__title">Hi, I'm {name}</div>
              <div class="empty__body">{subtitle ? `${subtitle}. ` : ''}Ask me anything{canCall ? ', or call me to talk' : ''}.</div>
              {config.suggestions.length ? (
                <div class="chips">
                  {config.suggestions.map((s) => (
                    <button class="chip" key={s} onClick={() => void sendText(s)}>
                      <SparkIcon />
                      {s}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {messages.map((m) =>
            m.role === 'agent' && m.streaming && !m.text ? (
              <div class="msg msg--agent typing" key={m.id} aria-label={`${name} is typing`}>
                <i />
                <i />
                <i />
              </div>
            ) : (
              <Fragment key={m.id}>
                <div class={`msg msg--${m.role} ${m.failed ? 'msg--failed' : ''} ${m.streaming ? 'caret' : ''}`} part={`message message-${m.role}`}>
                  {m.role === 'agent' ? <Rich text={m.text} /> : m.text}
                </div>
                {m.failed ? (
                  <button class="msg__retry" onClick={() => void client.chat.retry(m.id).catch(() => {})}>
                    <RetryIcon /> Not sent · Retry
                  </button>
                ) : null}
              </Fragment>
            ),
          )}
        </div>
        <form
          class="compose"
          part="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void sendText(draft);
          }}
        >
          <div class="compose__box">
            <textarea
              ref={input}
              rows={1}
              value={draft}
              maxLength={2000}
              placeholder={config.placeholder}
              aria-label="Message"
              onInput={(e) => {
                const t = e.currentTarget;
                setDraft(t.value);
                t.style.height = 'auto';
                t.style.height = `${Math.min(120, t.scrollHeight)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                  e.preventDefault();
                  void sendText(draft);
                }
              }}
            />
            <button class="send" type="submit" aria-label="Send" disabled={!draft.trim() || busy}>
              <SendIcon />
            </button>
          </div>
        </form>
        {config.branding ? (
          <div class="foot">
            Powered by{' '}
            <a href="https://character.xyz" target="_blank" rel="noopener noreferrer">
              Character XYZ
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  // ---------------------------------------------------------------- call
  const s = state;
  const position = s?.position ?? 1;
  const progress = startPos > 1 ? (startPos - position) / (startPos - 1) : 0;
  const R = 74;
  const C = 2 * Math.PI * R;
  const remaining = s?.maxSeconds ? s.maxSeconds - elapsed : null;
  const agentState = s?.agentState ?? 'idle';
  const status = s?.speaking ? 'Speaking' : agentState === 'thinking' ? 'Thinking…' : 'Listening';
  const ended = !s || phase === 'ended' || phase === 'idle';
  const copy = endCopy(s?.endReason ?? null, name);

  return (
    <div class={`panel ${closing ? 'is-closing' : ''}`} part="panel" role="dialog" aria-label={`Call with ${name}`}>
      <div class="stage" ref={stage}>
        <div class="stage__figure" style={{ opacity: phase === 'queued' ? 0.35 : 1, transition: 'opacity .6s' }}>
          <Portrait agent={agent} shot={MEDIUM} talking={!!s?.speaking} />
        </div>
        {live ? <div class="voice" /> : null}
        <div class="stage__veil" />
        <div class="stage__top">
          {phase === 'live' ? (
            <span class={`badge ${remaining != null && remaining <= 60 ? 'badge--warn' : ''}`} role="timer" aria-label="Call time">
              <i />
              {remaining != null && remaining <= 60 ? `${clock(remaining)} left` : clock(elapsed)}
            </span>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            {canChat ? (
              <button class="icon-btn" aria-label="Chat" title="Chat" onClick={() => open('chat')}>
                <ChatIcon size={18} />
              </button>
            ) : null}
            <button class="icon-btn" aria-label="Minimise" onClick={close}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <div class="stage__bottom" aria-live="polite">
          {phase === 'joining' || phase === 'connecting' ? (
            <Fragment>
              <div class="stage__name">{name}</div>
              <div class="stage__status">
                <span class="spinner" /> {phase === 'joining' ? 'Connecting…' : 'Joining…'}
              </div>
            </Fragment>
          ) : null}

          {phase === 'queued' ? (
            <Fragment>
              <div class="line" role="status" aria-label={`You are ${ordinal(position)} in line, ${eta(s?.etaSeconds ?? null)}`}>
                <svg width="168" height="168" viewBox="0 0 168 168">
                  <circle class="line__track" cx="84" cy="84" r={R} fill="none" stroke-width="7" />
                  <circle class="line__fill" cx="84" cy="84" r={R} fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0.06, progress))} />
                </svg>
                <div>
                  <div class="line__num">{ordinal(position)}</div>
                  <div class="line__lbl">in line</div>
                </div>
              </div>
              <div class="title">{name} is on other calls</div>
              <div class="note">
                Your turn in {eta(s?.etaSeconds ?? null)}. We'll chime when it's time{canChat ? ', so feel free to keep chatting.' : '.'}
              </div>
              <div class="btn-row">
                {canChat ? (
                  <button class="btn btn--accent" onClick={() => open('chat')}>
                    <ChatIcon size={18} /> Keep chatting
                  </button>
                ) : null}
                <button
                  class="btn"
                  onClick={() => {
                    void call?.hangUp();
                  }}
                >
                  Leave line
                </button>
              </div>
            </Fragment>
          ) : null}

          {phase === 'ready' ? (
            <Fragment>
              <div class="title">{name} is ready for you</div>
              <div class="note">Join within {s?.holdSeconds ?? 30} seconds.</div>
              <button class="btn btn--accent btn--glow" onClick={() => call?.accept()}>
                <PhoneIcon size={18} /> Join call
              </button>
            </Fragment>
          ) : null}

          {phase === 'live' ? (
            <Fragment>
              <div class="stage__name">{name}</div>
              <div class="stage__status">
                {s?.speaking ? (
                  <span class="wave" aria-hidden="true">
                    {[0.6, 1, 0.75, 1, 0.55].map((k, i) => (
                      <i key={i} style={{ '--k': k } as Record<string, number>} />
                    ))}
                  </span>
                ) : null}
                {s?.muted ? 'You are muted' : status}
              </div>
              <div class="captions">
                {captions.slice(-2).map((c, i, arr) => (
                  <div key={c.id} class={`captions__line ${i === arr.length - 1 ? 'captions__line--now' : ''}`}>
                    {c.role === 'visitor' ? `You: ${c.text}` : c.text}
                  </div>
                ))}
              </div>
              <div class="controls">
                <div class="ctl">
                  <button class={`round ${s?.muted ? 'round--on' : ''}`} aria-pressed={s?.muted} aria-label={s?.muted ? 'Unmute' : 'Mute'} onClick={() => call?.setMuted(!s?.muted)}>
                    {s?.muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
                  </button>
                  <span class="round__label">{s?.muted ? 'Unmute' : 'Mute'}</span>
                </div>
                <div class="ctl">
                  <button class="round round--end" aria-label="End call" onClick={() => void call?.hangUp()}>
                    <HangUpIcon size={26} />
                  </button>
                  <span class="round__label">End</span>
                </div>
                {s?.speaking ? (
                  <div class="ctl">
                    <button class="round" aria-label={`Interrupt ${name}`} onClick={() => call?.interrupt()}>
                      <BackIcon size={22} />
                    </button>
                    <span class="round__label">Interrupt</span>
                  </div>
                ) : null}
              </div>
            </Fragment>
          ) : null}

          {ended ? (
            <Fragment>
              <div class="title">{s ? copy.title : `Call ${name}`}</div>
              <div class="note">{s ? (s.endReason === 'hangup' && elapsed ? `${clock(elapsed)} · ${copy.body}` : s.error ?? copy.body) : `Talk with ${name} in real time.`}</div>
              <div class="btn-row">
                {canCall && s?.endReason !== 'credits' && s?.endReason !== 'unavailable' ? (
                  <button
                    class="btn btn--accent"
                    onClick={() => {
                      reset();
                      void startCall();
                    }}
                  >
                    <PhoneIcon size={18} /> {s ? 'Call again' : 'Start call'}
                  </button>
                ) : null}
                {canChat ? (
                  <button class="btn" onClick={() => open('chat')}>
                    <ChatIcon size={18} /> Chat
                  </button>
                ) : null}
              </div>
            </Fragment>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The place a visitor joined the line at, for the ring's progress. */
function useMemoStart(call: Call | null, position: number): number {
  const ref = useRef<{ call: Call | null; start: number }>({ call: null, start: position });
  if (ref.current.call !== call) ref.current = { call, start: position };
  if (position > ref.current.start) ref.current.start = position;
  return ref.current.start;
}

