import type { Call, CallState, Caption, CharacterXYZ, ChatMessage, ContactDetails, DetailsForm, Opening } from '@characterxyz/web';
import { Fragment, type ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { DEFAULTS, type WidgetConfig } from './config.js';
import { blocks, clock, type Inline } from './format.js';
import { ending, place, setStrings, t, wait } from './strings.js';
import { CLOSE_UP, FULL_BODY, HALF_BODY, MEDIUM } from './framing.js';
import { extractContact, type TypedContact } from './contact.js';
import { BackIcon, ChatIcon, CheckIcon, CloseIcon, HangUpIcon, MicIcon, MicOffIcon, NewChatIcon, PhoneIcon, RetryIcon, SendIcon } from './icons.js';
import { faceEmotion, FaceFrame, type FaceStatus } from './face-frame.js';
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
/** Set once the launcher has shown its words; after that it is icons only. */
const INTRODUCED_KEY = 'cxyz:introduced';

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

const LABELS: Record<string, { label: 'nameField' | 'emailField' | 'phoneField' | 'companyField' | 'reasonField'; type: string; auto: string }> = {
  name: { label: 'nameField', type: 'text', auto: 'name' },
  email: { label: 'emailField', type: 'email', auto: 'email' },
  phone: { label: 'phoneField', type: 'tel', auto: 'tel' },
  company: { label: 'companyField', type: 'text', auto: 'organization' },
  reason: { label: 'reasonField', type: 'text', auto: 'off' },
};

/** A reason handed over by the page: `?reason=` on the URL or `data-reason` on the tag. */
function prefillReason(): string {
  try {
    const q = new URLSearchParams(location.search).get('reason') ?? new URLSearchParams(location.search).get('intent');
    if (q && q.trim()) return q.trim().slice(0, 120);
    const host = document.querySelector('character-xyz');
    return (host?.getAttribute('data-reason') ?? '').trim().slice(0, 120);
  } catch {
    return '';
  }
}

/** The contact card: a few fields in the chat, skippable, sending is the consent. */
function DetailsCard({
  form,
  title,
  note,
  onSend,
  onSkip,
  skipLabel,
  initial,
}: {
  form: DetailsForm;
  initial?: TypedContact;
  title: string;
  note: string | null;
  onSend: (d: ContactDetails) => Promise<void>;
  onSkip: () => void;
  skipLabel: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(initial ?? {}) }) as Record<string, string>);
  const reasonOptions = form.reasonOptions ?? [];
  const wantsReason = form.fields.includes('reason');
  const [reasonChoice, setReasonChoice] = useState(() => {
    if (!wantsReason) return '';
    const pre = prefillReason();
    if (!pre) return '';
    return reasonOptions.includes(pre) ? pre : '__other';
  });
  const [reasonText, setReasonText] = useState(() => {
    if (!wantsReason) return '';
    const pre = prefillReason();
    return pre && !reasonOptions.includes(pre) ? pre : '';
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTimeout(() => first.current?.focus({ preventScroll: true }), 80);
  }, []);
  return (
    <form
      class="card"
      part="details"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setErrors({});
        setFailed(null);
        try {
          const reason = (reasonChoice === '__other' ? reasonText : reasonChoice).trim();
          await onSend({
            name: values.name ?? '',
            email: values.email ?? '',
            ...(values.phone ? { phone: values.phone } : {}),
            ...(values.company ? { company: values.company } : {}),
            ...(wantsReason && reason ? { reason } : {}),
          });
        } catch (err) {
          const fields = (err as { fields?: Record<string, string> }).fields ?? {};
          if (Object.keys(fields).length) setErrors(fields);
          else setFailed((err as Error).message || t('sendFailed'));
        } finally {
          setSending(false);
        }
      }}
    >
      <div class="card__title">{title}</div>
      {note ? <div class="card__note">{note}</div> : null}
      {form.fields.map((f, i) => {
        const spec = LABELS[f]!;
        const label = f === 'reason' ? form.reasonLabel || t('reasonField') : t(spec.label);
        return (
          <label class="card__field" key={f}>
            <span>
              {label}
              {f === 'phone' || f === 'company' || f === 'reason' ? <i> · {t('optional')}</i> : null}
            </span>
            {f === 'reason' ? (
              reasonOptions.length ? (
                <Fragment>
                  <select value={reasonChoice} onChange={(e) => setReasonChoice(e.currentTarget.value)}>
                    <option value="">{t('reasonChoose')}</option>
                    {reasonOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                    <option value="__other">{t('reasonOther')}</option>
                  </select>
                  {reasonChoice === '__other' ? (
                    <input
                      type="text"
                      maxLength={500}
                      placeholder={t('reasonPlaceholder')}
                      value={reasonText}
                      onInput={(e) => setReasonText(e.currentTarget.value)}
                    />
                  ) : null}
                </Fragment>
              ) : (
                <textarea
                  rows={2}
                  maxLength={500}
                  placeholder={t('reasonPlaceholder')}
                  value={reasonText}
                  onInput={(e) => setReasonText(e.currentTarget.value)}
                />
              )
            ) : (
              <input
                ref={i === 0 ? first : undefined}
                type={spec.type}
                autocomplete={spec.auto}
                required={f === 'name' || f === 'email'}
                maxLength={f === 'email' ? 254 : 120}
                value={values[f] ?? ''}
                aria-invalid={errors[f] ? 'true' : undefined}
                onInput={(e) => setValues((v) => ({ ...v, [f]: e.currentTarget.value }))}
              />
            )}
            {errors[f] ? <em>{errors[f]}</em> : null}
          </label>
        );
      })}
      <div class="card__consent">
        {form.consent}
        {form.privacyUrl ? (
          <Fragment>
            {' '}
            <a href={form.privacyUrl} target="_blank" rel="noopener noreferrer">
              {t('privacyPolicy')}
            </a>
          </Fragment>
        ) : null}
      </div>
      {failed ? <div class="card__failed">{failed}</div> : null}
      <div class="card__actions">
        <button type="submit" class="btn btn--accent btn--sm" disabled={sending}>
          {sending ? t('sending') : t('send')}
        </button>
        <button type="button" class="btn btn--ghost btn--sm" onClick={onSkip} disabled={sending}>
          {skipLabel}
        </button>
      </div>
    </form>
  );
}

/** Tappable questions under her message: what to ask first, or next. */
function QuickReplies({ items, onPick, children }: { items: readonly string[]; onPick: (q: string) => void; children?: ComponentChildren }) {
  if (!items.length && !children) return null;
  return (
    <div class="chips chips--start" part="suggestions">
      {items.map((q) => (
        <button class="chip" key={q} onClick={() => onPick(q)}>
          {q}
        </button>
      ))}
      {children}
    </div>
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
  const name = agent.name || t('assistant');

  // HOW SHE OPENS is hers: written by the agent from her persona and the
  // key's product knowledge (server-cached), fetched once per page so the
  // teaser and her first message are ready before anyone clicks. A brand's own
  // `greeting` / `suggestions` still win.
  const [opening, setOpening] = useState<Opening | null>(null);
  useEffect(() => {
    if (!canChat) return;
    let live = true;
    void client.opening().then((o) => {
      if (!live) return;
      setStrings(o?.strings);
      setOpening(o);
    });
    return () => {
      live = false;
    };
  }, [client, canChat]);
  const teaser = config.greeting || opening?.teaser || '';
  const starters = config.suggestions.length ? config.suggestions : (opening?.suggestions ?? []);
  const firstLine = opening?.greeting || t('greetingDefault', { name });

  // Her first message waits for the history (a returning visitor has one) and
  // then for a short typing beat, so it arrives like a message, not a label.
  const [history, setHistory] = useState<'loading' | 'empty' | number>('loading');
  const [greeted, setGreeted] = useState(false);

  // HER DETAILS CARD, asked at a moment of intent, never before the chat: under
  // the reply where she invited the visitor (`askDetails`), or once before a
  // call when the key has somewhere to send it (`opening.details`). Sending or
  // "Not now" settles it for this conversation.
  const [detailsDone, setDetailsDone] = useState<'sent' | 'skipped' | null>(null);
  const [sentName, setSentName] = useState('');
  const [callCard, setCallCard] = useState<DetailsForm | null>(null);
  // Details the visitor TYPED into the chat: the card opens already filled in,
  // after her reply, and sending it is still the one confirmation.
  const [typed, setTyped] = useState<{ form: DetailsForm; values: TypedContact } | null>(null);

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

  const loadHistory = useCallback(async () => {
    try {
      const list = await client.chat.load();
      setHistory((h) => (h === 'loading' ? (list.length ? list.length : 'empty') : h));
    } catch {
      setHistory((h) => (h === 'loading' ? 'empty' : h));
    }
  }, [client]);

  const open = useCallback(
    (v: Exclude<View, 'closed'> = canChat ? 'chat' : 'call') => {
      setGreeting(false);
      storage(GREETED_KEY, '1');
      setView(v);
      if (v === 'chat') void loadHistory();
    },
    [canChat, setView, loadHistory],
  );


  useEffect(() => bind({ open, close }), [bind, open, close]);

  // A site event the author asked to surface. `openChat` is their call, and it
  // arrives BEFORE the reply (which may need a page action first), so the panel
  // opens on the event, not seconds later.
  useEffect(() => {
    return client.on('siteEvent', (r) => {
      if (r.openChat) open('chat');
    });
  }, [client, open]);

  useEffect(() => {
    if (config.open && canChat) void loadHistory();
  }, [loadHistory, config.open, canChat]);

  // The teaser: once per visitor, after a beat, never over an open panel.
  useEffect(() => {
    if (!teaser || storage(GREETED_KEY)) return;
    const t = setTimeout(() => setGreeting(true), config.greetingDelay * 1000);
    return () => clearTimeout(t);
  }, [teaser, config.greetingDelay]);

  useEffect(() => {
    if (view !== 'chat' || greeted || history === 'loading') return;
    const t = setTimeout(() => setGreeted(true), 700);
    return () => clearTimeout(t);
  }, [view, greeted, history]);

  // The launcher's buttons say what they are once, on a visitor's first visit,
  // then fold to icons. Hover and keyboard focus unfold them again (CSS).
  const [labelled, setLabelled] = useState(() => !storage(INTRODUCED_KEY));
  useEffect(() => {
    if (!labelled) return;
    const t = setTimeout(() => {
      setLabelled(false);
      storage(INTRODUCED_KEY, '1');
    }, 5000);
    return () => clearTimeout(t);
  }, [labelled]);

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

  // The face frame (the app's own renderer) is wanted for a video character.
  const wantsFace = config.face && !!agent.video;
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('loading');

  // Your turn: a chime, and the tab title if the visitor is elsewhere.
  const phase = state?.phase ?? 'idle';
  useEffect(() => {
    if (phase !== 'ready' || !call) return;
    chime();
    if (view === 'call') {
      // Join once the face frame has said who she is (her mood goes in the
      // call's opening message), or after 3 s whatever it says: the hold is 30.
      if (!wantsFace || faceStatus !== 'loading') {
        call.accept();
        return;
      }
      const t = setTimeout(() => call.accept(), 3000);
      return () => clearTimeout(t);
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
  }, [phase, call, view, name, wantsFace, faceStatus]);

  const live = phase === 'live' || phase === 'connecting';
  useVoiceLevel(call, stage, live && view === 'call');
  const elapsed = useElapsed(state?.startedAt ?? null, phase === 'live');
  // Every hook above the early returns: Preact keys hooks by call order.
  const startPos = useMemoStart(call, state?.position ?? 1);

  /** A call, after the details card when there is one to offer first. */
  const beginCall = () => {
    const form = opening?.details;
    if (form && !detailsDone && canChat) {
      setCallCard(form);
      setView('chat');
      void loadHistory();
      return;
    }
    void startCall();
  };

  const settleDetails = (how: 'sent' | 'skipped', firstName = '') => {
    setDetailsDone(how);
    setSentName(firstName);
    setTyped(null);
    const thenCall = !!callCard;
    setCallCard(null);
    if (thenCall) void startCall();
  };

  const sendDetails = async (d: ContactDetails) => {
    await client.sendDetails(d);
    settleDetails('sent', d.name.trim().split(/\s+/)[0] ?? '');
  };

  const skipDetails = () => {
    void client.declineDetails().catch(() => {});
    settleDetails('skipped');
  };

  const startOver = async () => {
    try {
      await client.chat.reset();
    } catch {
      return;
    }
    setHistory('empty');
    setGreeted(false);
    setDetailsDone(null);
    setCallCard(null);
    setTyped(null);
    setDraft('');
    setOpening(await client.opening(true));
  };

  const startCall = async () => {
    setView('call');
    try {
      await client.startCall({ autoAccept: false, ...(wantsFace ? { face: { emotion: () => faceEmotion.current } } : {}) });
    } catch {
      // the call's own state carries the reason
    }
  };

  // The card's settings while details may still be left: the latest a reply
  // carried, else the opening's (it is null once this conversation was asked).
  const knownForm: DetailsForm | null =
    [...messages].reverse().find((m) => m.detailsForm || m.askDetails)?.detailsForm ??
    [...messages].reverse().find((m) => m.askDetails)?.askDetails ??
    opening?.details ??
    null;

  const sendText = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    // ⚠ A "NOT NOW" DOES NOT CLOSE THIS DOOR: someone who typed their email has
    // changed their mind. Only an already-sent card does.
    const found = knownForm && detailsDone !== 'sent' ? extractContact(t) : null;
    if (found && knownForm) setTyped({ form: knownForm, values: found });
    setDraft('');
    if (input.current) input.current.style.height = '';
    try {
      await client.chat.send(t);
    } catch {
      // the message shows as failed with a retry
    }
  };


  // Which details card is open, if any — one at a time, and while one is open
  // it is the only thing asking (the suggestion chips step aside).
  const lastMsg = messages[messages.length - 1];
  const invited = lastMsg?.role === 'agent' && !lastMsg.streaming ? lastMsg.askDetails : undefined;
  const card: { form: DetailsForm; kind: 'call' | 'typed' | 'invited'; initial?: TypedContact } | null = callCard
    ? { form: callCard, kind: 'call' }
    : typed && detailsDone !== 'sent' && !busy
      ? { form: typed.form, kind: 'typed', initial: typed.values }
      : invited && !detailsDone
        ? { form: invited, kind: 'invited' }
        : null;

  // ---------------------------------------------------------------- closed
  if (view === 'closed') {
    const inLine = phase === 'queued' || phase === 'ready' || phase === 'live' || phase === 'connecting';
    return (
      <div class={`dock dock--${config.display}`} part="launcher">
        {greeting ? (
          <div class="greeting" part="greeting" role="status" onClick={() => open()}>
            {teaser}
            <button
              class="greeting__close"
              aria-label={t('dismiss')}
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
        <button
          class={`presence presence--${config.display} ${inLine ? 'presence--live' : ''}`}
          part="presence"
          aria-label={
            inLine
              ? phase === 'queued'
                ? t('inLineToCall', { position: place(state?.position ?? 1), name })
                : t('backToCallWith', { name })
              : canChat
                ? t('chatWith', { name })
                : t('callName', { name })
          }
          onClick={() => open(inLine || !canChat ? 'call' : 'chat')}
        >
          {config.display === 'bubble' ? <span class="presence__ring" /> : null}
          <span class="presence__face">
            <Portrait agent={agent} shot={config.display === 'full' ? FULL_BODY : config.display === 'half' ? HALF_BODY : CLOSE_UP} />
          </span>
          <span class="presence__dot" />
          {client.mode === 'test' ? (
            <span class="testmode" title="Test mode: this key only works on development sites">
              TEST
            </span>
          ) : null}
          {phase === 'queued' ? (
            <span class="presence__badge" aria-hidden="true">
              {state?.position ?? 1}
            </span>
          ) : null}
          {config.launcher === 'bubble' && !greeting ? (
            <span class="presence__label" aria-hidden="true">
              {inLine ? (phase === 'queued' ? t('inLine', { position: place(state?.position ?? 1) }) : t('backToCall')) : canChat ? t('chatWith', { name }) : t('callName', { name })}
            </span>
          ) : null}
        </button>
        {config.launcher === 'bubble' ? null : (
        <div class={`acts ${labelled ? 'acts--labelled' : ''}`} part="actions">
          {canChat ? (
            <button class="act" aria-label={t('chatWith', { name })} onClick={() => open('chat')}>
              <ChatIcon size={20} />
              <span class="act__label" aria-hidden="true">
                {t('chat')}
              </span>
            </button>
          ) : null}
          {canCall ? (
            <button
              class={`act act--call ${inLine ? 'act--live' : ''}`}
              aria-label={inLine ? (phase === 'queued' ? t('inLineOpen', { position: place(state?.position ?? 1) }) : t('backToCall')) : t('callName', { name })}
              onClick={() => (inLine ? open('call') : beginCall())}
            >
              <PhoneIcon size={20} />
              <span class="act__label" aria-hidden="true">
                {inLine ? (phase === 'queued' ? t('inLine', { position: place(state?.position ?? 1) }) : t('onCall')) : t('call')}
              </span>
              {phase === 'queued' ? (
                <span class="act__badge" aria-hidden="true">
                  {state?.position ?? 1}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- chat
  const head = (
    <div class="head" part="header">
      <div class="head__face">
        {/* Idle only: the talking clip is a call's, not a chat's (2026-10-20). */}
        <Portrait agent={agent} shot={CLOSE_UP} />
      </div>
      <div class="head__who">
        <div class="head__name">{name}</div>
        <div class="head__sub">
          <i />
          {busy ? t('typing') : subtitle || t('online')}
        </div>
      </div>
      {view === 'chat' && messages.length > 0 && !busy ? (
        <button class="icon-btn" aria-label={t('newConversation')} title={t('newConversation')} onClick={() => void startOver()}>
          <NewChatIcon />
        </button>
      ) : null}
      {canCall && view === 'chat' ? (
        <button class="icon-btn icon-btn--accent" aria-label={t('callName', { name })} title={t('callName', { name })} onClick={() => (call && phase !== 'ended' ? setView('call') : beginCall())}>
          <PhoneIcon size={18} />
        </button>
      ) : null}
      <button class="icon-btn" aria-label={t('close')} onClick={close}>
        <CloseIcon />
      </button>
    </div>
  );

  if (view === 'chat') {
    return (
      <div class={`panel ${closing ? 'is-closing' : ''}`} part="panel" role="dialog" aria-label={t('chatWith', { name })}>
        {head}
        {call && (phase === 'queued' || phase === 'ready') ? (
          <div class="banner" part="banner" role="status">
            <div class="banner__text">
              {phase === 'queued' ? (
                <Fragment>
                  {t('inLineFor', { position: place(state?.position ?? 1), eta: wait(state?.etaSeconds ?? null) })}
                </Fragment>
              ) : (
                <Fragment>
                  <b>{t('readyForYou', { name })}</b> · {t('secondsToJoin', { seconds: state?.holdSeconds ?? 30 })}
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
                {t('join')}
              </button>
            ) : (
              <button class="btn" onClick={() => setView('call')}>
                {t('view')}
              </button>
            )}
          </div>
        ) : null}
        <div class="log" ref={log} role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 ? (
            <Fragment>
              <div class="empty">
                <div class="empty__face">
                  <Portrait agent={agent} shot={CLOSE_UP} />
                </div>
                <div class="empty__title">{name}</div>
                {subtitle ? <div class="empty__body">{subtitle}</div> : null}
              </div>
              {history === 'loading' ? null : !greeted ? (
                <div class="msg msg--agent typing" aria-label={t('typingName', { name })}>
                  <i />
                  <i />
                  <i />
                </div>
              ) : (
                <Fragment>
                  <div class="msg msg--agent" part="message message-agent">
                    <Rich text={firstLine} />
                  </div>
                  {card ? null : (
                    <QuickReplies items={starters} onPick={(q) => void sendText(q)}>
                      {canCall ? (
                        <button class="chip chip--call" onClick={() => (call && phase !== 'ended' ? setView('call') : beginCall())}>
                          <PhoneIcon size={14} /> {t('callName', { name })}
                        </button>
                      ) : null}
                    </QuickReplies>
                  )}
                </Fragment>
              )}
            </Fragment>
          ) : null}
          {messages.map((m) =>
            m.role === 'event' ? (
              <div class="event" part="event message message-event" key={m.id}>
                <span class="event__dot" aria-hidden="true" />
                {m.text}
              </div>
            ) : m.role === 'agent' && m.streaming && !m.text ? (
              <div class="msg msg--agent typing" key={m.id} aria-label={t('typingName', { name })}>
                <i />
                <i />
                <i />
              </div>
            ) : (
              <Fragment key={m.id}>
                <div class={`msg msg--${m.role} ${m.failed ? 'msg--failed' : ''} ${m.streaming ? 'caret' : ''}`} part={`message message-${m.role}`}>
                  {m.role === 'agent' ? <Rich text={m.text} /> : m.text}
                </div>
                {m === messages[messages.length - 1] && m.role === 'agent' && !m.streaming && !busy && !card && m.suggestions?.length ? (
                  <QuickReplies items={m.suggestions} onPick={(q) => void sendText(q)} />
                ) : null}
                {m.failed && m.error ? (
                  <div class="msg__why" role="status">
                    {m.error}
                  </div>
                ) : m.failed ? (
                  <button class="msg__retry" onClick={() => void client.chat.retry(m.id).catch(() => {})}>
                    <RetryIcon /> {t('notSent')}
                  </button>
                ) : null}
              </Fragment>
            ),
          )}
          {/* A visitor back to an earlier conversation: a word from her, and
              where to start — until they say something. */}
          {typeof history === 'number' && messages.length === history && opening?.welcomeBack ? (
            <Fragment>
              <div class="msg msg--agent" part="message message-agent">
                {opening.welcomeBack}
              </div>
              {card ? null : <QuickReplies items={starters} onPick={(q) => void sendText(q)} />}
            </Fragment>
          ) : null}
          {(() => {
            if (card) {
              return (
                <DetailsCard
                  key={card.kind === 'invited' ? lastMsg?.id : card.kind}
                  form={card.form}
                  initial={card.initial}
                  title={card.kind === 'call' ? t('beforeYouCall', { name }) : card.kind === 'typed' ? t('confirmDetails') : t('leaveDetails')}
                  note={card.kind === 'call' ? t('detailsWhy') : card.kind === 'typed' ? t('detailsTyped') : null}
                  onSend={sendDetails}
                  onSkip={skipDetails}
                  skipLabel={card.kind === 'call' ? t('skipAndCall') : t('notNow')}
                />
              );
            }
            return detailsDone === 'sent' ? (
              <div class="notice" role="status">
                <CheckIcon /> {sentName ? t('thanksName', { name: sentName }) : t('thanks')}
              </div>
            ) : null;
          })()}
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
              placeholder={config.placeholder === DEFAULTS.placeholder ? t('message') : config.placeholder}
              aria-label={t('message')}
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
            <button class="send" type="submit" aria-label={t('send')} disabled={!draft.trim() || busy}>
              <SendIcon />
            </button>
          </div>
        </form>
        {config.branding ? (
          <div class="foot">
            {t('poweredBy').split('{brand}').map((part, i) => (
              <Fragment key={i}>
                {i ? (
                  <a href="https://character.xyz" target="_blank" rel="noopener noreferrer">
                    Character XYZ
                  </a>
                ) : null}
                {part}
              </Fragment>
            ))}
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
  const status = s?.speaking ? t('speaking') : agentState === 'thinking' ? t('thinking') : t('listening');
  const ended = !s || phase === 'ended' || phase === 'idle';
  const copy = ending(s?.endReason ?? null, name);

  return (
    <div class={`panel ${closing ? 'is-closing' : ''}`} part="panel" role="dialog" aria-label={t('callWith', { name })}>
      <div class={`stage ${wantsFace && faceStatus === 'ready' ? 'stage--face' : ''}`} ref={stage}>
        <div class="stage__figure" style={{ opacity: phase === 'queued' ? 0.35 : 1, transition: 'opacity .6s' }}>
          <Portrait agent={agent} shot={MEDIUM} talking={!!s?.speaking} full />
          {wantsFace ? (
            <div class={`stage__face ${faceStatus === 'ready' ? 'is-ready' : ''}`}>
              <FaceFrame client={client} call={call} state={s} src={config.faceUrl} onStatus={setFaceStatus} />
            </div>
          ) : null}
        </div>
        {live ? <div class="voice" /> : null}
        <div class="stage__veil" />
        <div class="stage__top">
          {phase === 'live' ? (
            <span class={`badge ${remaining != null && remaining <= 60 ? 'badge--warn' : ''}`} role="timer" aria-label={t('callTime')}>
              <i />
              {remaining != null && remaining <= 60 ? t('timeLeft', { time: clock(remaining) }) : clock(elapsed)}
            </span>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            {canChat ? (
              <button class="icon-btn" aria-label={t('chat')} title={t('chat')} onClick={() => open('chat')}>
                <ChatIcon size={18} />
              </button>
            ) : null}
            <button class="icon-btn" aria-label={t('minimise')} onClick={close}>
              <CloseIcon />
            </button>
          </div>
        </div>

        <div class="stage__bottom" aria-live="polite">
          {phase === 'joining' || phase === 'connecting' ? (
            <Fragment>
              <div class="stage__name">{name}</div>
              <div class="stage__status">
                <span class="spinner" /> {phase === 'joining' ? t('connecting') : t('joining')}
              </div>
            </Fragment>
          ) : null}

          {phase === 'queued' ? (
            <Fragment>
              <div class="line" role="status" aria-label={t('inLineEta', { position: place(position), eta: wait(s?.etaSeconds ?? null) })}>
                <svg width="168" height="168" viewBox="0 0 168 168">
                  <circle class="line__track" cx="84" cy="84" r={R} fill="none" stroke-width="7" />
                  <circle class="line__fill" cx="84" cy="84" r={R} fill="none" stroke-width="7" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - Math.max(0.06, progress))} />
                </svg>
                <div>
                  <div class="line__num">{place(position)}</div>
                  <div class="line__lbl">{t('lineLabel')}</div>
                </div>
              </div>
              <div class="title">{t('onOtherCalls', { name })}</div>
              <div class="note">{t(canChat ? 'yourTurnChat' : 'yourTurn', { eta: wait(s?.etaSeconds ?? null) })}</div>
              <div class="btn-row">
                {canChat ? (
                  <button class="btn btn--accent" onClick={() => open('chat')}>
                    <ChatIcon size={18} /> {t('keepChatting')}
                  </button>
                ) : null}
                <button
                  class="btn"
                  onClick={() => {
                    void call?.hangUp();
                  }}
                >
                  {t('leaveLine')}
                </button>
              </div>
            </Fragment>
          ) : null}

          {phase === 'ready' ? (
            <Fragment>
              <div class="title">{t('readyForYou', { name })}</div>
              <div class="note">{t('joinWithin', { seconds: s?.holdSeconds ?? 30 })}</div>
              <button class="btn btn--accent btn--glow" onClick={() => call?.accept()}>
                <PhoneIcon size={18} /> {t('joinCall')}
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
                {s?.muted ? t('muted') : status}
              </div>
              <div class="captions">
                {captions.slice(-2).map((c, i, arr) => (
                  <div key={c.id} class={`captions__line ${i === arr.length - 1 ? 'captions__line--now' : ''}`}>
                    {c.role === 'visitor' ? t('you', { text: c.text }) : c.text}
                  </div>
                ))}
              </div>
              <div class="controls">
                <div class="ctl">
                  <button class={`round ${s?.muted ? 'round--on' : ''}`} aria-pressed={s?.muted} aria-label={s?.muted ? t('unmute') : t('mute')} onClick={() => call?.setMuted(!s?.muted)}>
                    {s?.muted ? <MicOffIcon size={22} /> : <MicIcon size={22} />}
                  </button>
                  <span class="round__label">{s?.muted ? t('unmute') : t('mute')}</span>
                </div>
                <div class="ctl">
                  <button class="round round--end" aria-label={t('endCall')} onClick={() => void call?.hangUp()}>
                    <HangUpIcon size={26} />
                  </button>
                  <span class="round__label">{t('end')}</span>
                </div>
                {s?.speaking ? (
                  <div class="ctl">
                    <button class="round" aria-label={t('interruptName', { name })} onClick={() => call?.interrupt()}>
                      <BackIcon size={22} />
                    </button>
                    <span class="round__label">{t('interrupt')}</span>
                  </div>
                ) : null}
              </div>
            </Fragment>
          ) : null}

          {ended ? (
            <Fragment>
              <div class="title">{s ? copy.title : t('callName', { name })}</div>
              <div class="note">{s ? (s.endReason === 'hangup' && elapsed ? `${clock(elapsed)} · ${copy.body}` : s.error ?? copy.body) : t('talkWith', { name })}</div>
              <div class="btn-row">
                {canCall && s?.endReason !== 'credits' && s?.endReason !== 'unavailable' && s?.endReason !== 'daily_limit' ? (
                  <button
                    class="btn btn--accent"
                    onClick={() => {
                      reset();
                      void startCall();
                    }}
                  >
                    <PhoneIcon size={18} /> {s ? t('callAgain') : t('startCall')}
                  </button>
                ) : null}
                {canChat ? (
                  <button class="btn" onClick={() => open('chat')}>
                    <ChatIcon size={18} /> {t('chat')}
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

