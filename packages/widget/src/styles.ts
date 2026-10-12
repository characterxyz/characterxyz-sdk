/**
 * The widget's whole stylesheet. It lives in the Shadow DOM: nothing here
 * reaches the brand's page and nothing of theirs reaches in, except the
 * `::part()` names documented in the README.
 *
 * Tokens are custom properties on :host, set from the config at mount
 * (`--cx-accent`, `--cx-radius`, `--cx-font`) — a brand overrides any of
 * them from outside with `character-xyz { --cx-accent: … }`.
 */
export const CSS = /* css */ `
:host {
  --cx-accent: #7c5cff;
  --cx-accent-ink: #fff;
  --cx-radius: 24px;
  --cx-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --cx-bg: rgba(255, 255, 255, 0.82);
  --cx-solid: #ffffff;
  --cx-ink: #14121a;
  --cx-ink-2: #5b5866;
  --cx-ink-3: #8d8a98;
  --cx-line: rgba(20, 18, 26, 0.08);
  --cx-bubble: rgba(20, 18, 26, 0.05);
  --cx-shadow: 0 24px 64px -12px rgba(23, 16, 52, 0.28), 0 4px 16px -4px rgba(23, 16, 52, 0.12);
  --cx-danger: #ef4444;
  --cx-ok: #22c55e;
  --cx-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --cx-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  all: initial;
  position: fixed;
  z-index: var(--cx-z, 2147483000);
  bottom: var(--cx-oy, 20px);
  font-family: var(--cx-font);
  color: var(--cx-ink);
  -webkit-font-smoothing: antialiased;
  line-height: 1.45;
}
:host([data-side="right"]) { right: var(--cx-ox, 20px); }
:host([data-side="left"]) { left: var(--cx-ox, 20px); }
:host([data-theme="dark"]) {
  --cx-bg: rgba(22, 20, 30, 0.78);
  --cx-solid: #16141e;
  --cx-ink: #f4f2fa;
  --cx-ink-2: #b7b3c6;
  --cx-ink-3: #85819a;
  --cx-line: rgba(255, 255, 255, 0.09);
  --cx-bubble: rgba(255, 255, 255, 0.07);
  --cx-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.6), 0 4px 16px -4px rgba(0, 0, 0, 0.4);
}
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid var(--cx-accent); outline-offset: 2px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* ------------------------------------------------------------ launcher */
.dock { display: flex; align-items: flex-end; gap: 10px; }
/* She sits in the corner and never moves; the buttons grow away from her. */
:host([data-side="right"]) .dock { flex-direction: row-reverse; }
.presence {
  position: relative; width: 60px; height: 60px; border-radius: 50%; flex: none;
  transition: transform .5s var(--cx-spring);
}
.presence:hover { transform: translateY(-2px) scale(1.05); }
/* What a tap does, on hover and keyboard focus. */
.presence__label {
  position: absolute; top: 50%; transform: translate(6px, -50%); opacity: 0; pointer-events: none; white-space: nowrap;
  padding: 7px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; letter-spacing: -0.005em;
  color: var(--cx-ink); background: var(--cx-solid); border: 1px solid var(--cx-line); box-shadow: var(--cx-shadow);
  transition: opacity .2s, transform .3s var(--cx-ease);
}
:host([data-side="right"]) .presence__label { right: calc(100% + 10px); }
:host([data-side="left"]) .presence__label { left: calc(100% + 10px); transform: translate(-6px, -50%); }
.presence:hover .presence__label, .presence:focus-visible .presence__label { opacity: 1; transform: translate(0, -50%); }
/* Waiting in line: the place, on her. */
.presence__badge {
  position: absolute; top: -4px; right: -4px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px;
  display: grid; place-items: center; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums;
  background: var(--cx-accent); color: var(--cx-accent-ink); box-shadow: 0 0 0 2px var(--cx-solid);
}
/* A call is open (or waiting): she breathes, so the way back is obvious. */
.presence--live::after { content: ""; position: absolute; inset: -5px; border-radius: 50%; border: 2px solid var(--cx-accent); animation: cx-glow-ring 1.8s ease-out infinite; }
.empty__call { margin-top: 4px; height: 40px; }
.presence__ring {
  position: absolute; inset: -3px; border-radius: 50%;
  background: conic-gradient(from var(--cx-angle, 0deg), var(--cx-accent), color-mix(in oklab, var(--cx-accent) 30%, #fff), var(--cx-accent));
  animation: cx-spin 6s linear infinite;
}
.presence__face {
  position: absolute; inset: 0; border-radius: 50%; overflow: hidden;
  background: radial-gradient(120% 90% at 50% 10%, color-mix(in oklab, var(--cx-accent) 22%, var(--cx-solid)), var(--cx-solid));
  box-shadow: inset 0 0 0 3px var(--cx-solid);
}
.presence__dot {
  position: absolute; right: 3px; bottom: 3px; width: 14px; height: 14px; border-radius: 50%;
  background: var(--cx-ok); box-shadow: 0 0 0 3px var(--cx-solid);
}
.acts { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
/* Call, the primary action, sits next to her on either side. */
:host([data-side="left"]) .acts { flex-direction: row-reverse; }
.act {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  height: 44px; min-width: 44px; padding: 0 12px; border-radius: 999px;
  color: var(--cx-ink); background: var(--cx-bg);
  backdrop-filter: blur(18px) saturate(1.6); -webkit-backdrop-filter: blur(18px) saturate(1.6);
  border: 1px solid var(--cx-line); box-shadow: var(--cx-shadow);
  animation: cx-rise .6s var(--cx-ease) both;
  transition: transform .35s var(--cx-spring), background .2s, box-shadow .2s;
}
.act + .act { animation-delay: .06s; }
.act:hover { transform: translateY(-2px); }
.act:active { transform: scale(.94); }
.act--call { background: var(--cx-accent); color: var(--cx-accent-ink); border-color: transparent; }
.act--call:hover { background: color-mix(in oklab, var(--cx-accent) 88%, #000); }
/* The word folds away to an icon; hover, keyboard focus and a first visit unfold it. */
.act__label {
  max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap;
  font-size: 14px; font-weight: 600; letter-spacing: -0.005em;
  transition: max-width .35s var(--cx-ease), opacity .2s, margin .35s var(--cx-ease);
}
.act:hover .act__label, .act:focus-visible .act__label, .acts--labelled .act__label { max-width: 120px; opacity: 1; margin-left: 7px; }
/* Waiting in line: the place, on the button. */
.act__badge {
  position: absolute; top: -5px; right: -5px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px;
  display: grid; place-items: center; font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums;
  background: var(--cx-solid); color: var(--cx-ink); box-shadow: 0 0 0 2px var(--cx-accent);
}
/* On a call (or ready): the button breathes so the way back is obvious. */
.act--live::after { content: ""; position: absolute; inset: -4px; border-radius: inherit; border: 2px solid var(--cx-accent); opacity: .5; animation: cx-glow-ring 1.8s ease-out infinite; }
.greeting {
  position: absolute; bottom: 76px; max-width: 260px; padding: 12px 34px 12px 14px; border-radius: 18px;
  background: var(--cx-solid); box-shadow: var(--cx-shadow); border: 1px solid var(--cx-line);
  font-size: 14px; color: var(--cx-ink); animation: cx-pop .55s var(--cx-spring) both; cursor: pointer;
}
:host([data-side="right"]) .greeting { right: 0; border-bottom-right-radius: 6px; }
:host([data-side="left"]) .greeting { left: 0; border-bottom-left-radius: 6px; }
.greeting__close { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; color: var(--cx-ink-3); }
.greeting__close:hover { background: var(--cx-bubble); color: var(--cx-ink); }

/* ------------------------------------------------------------ panel */
.panel {
  position: absolute; bottom: 0; width: 392px; height: min(640px, calc(100vh - 40px));
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: var(--cx-radius); background: var(--cx-bg); border: 1px solid var(--cx-line);
  backdrop-filter: blur(24px) saturate(1.7); -webkit-backdrop-filter: blur(24px) saturate(1.7);
  box-shadow: var(--cx-shadow);
  transform-origin: bottom right;
  animation: cx-open .5s var(--cx-ease) both;
}
:host([data-side="right"]) .panel { right: 0; }
:host([data-side="left"]) .panel { left: 0; transform-origin: bottom left; }
.panel.is-closing { animation: cx-close .22s ease-in both; }

.head { display: flex; align-items: center; gap: 12px; padding: 14px 14px 12px 16px; border-bottom: 1px solid var(--cx-line); }
.head__face { position: relative; width: 42px; height: 42px; border-radius: 50%; overflow: hidden; flex: none;
  background: radial-gradient(120% 90% at 50% 10%, color-mix(in oklab, var(--cx-accent) 22%, var(--cx-solid)), var(--cx-solid)); }
.head__who { flex: 1; min-width: 0; }
.head__name { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
.head__sub { font-size: 12.5px; color: var(--cx-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.head__sub i { width: 7px; height: 7px; border-radius: 50%; background: var(--cx-ok); flex: none; }
.icon-btn { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: var(--cx-ink-2); transition: background .2s, color .2s; }
.icon-btn:hover { background: var(--cx-bubble); color: var(--cx-ink); }
.icon-btn--accent { background: var(--cx-accent); color: var(--cx-accent-ink); }
.icon-btn--accent:hover { background: color-mix(in oklab, var(--cx-accent) 88%, #000); color: var(--cx-accent-ink); }

/* ------------------------------------------------------------ chat */
.log { flex: 1; overflow-y: auto; padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 6px; scroll-behavior: smooth; overscroll-behavior: contain; }
.log::-webkit-scrollbar { width: 8px; } .log::-webkit-scrollbar-thumb { background: var(--cx-line); border-radius: 8px; }
.msg { max-width: 84%; padding: 9px 13px; border-radius: 18px; font-size: 14.5px; word-wrap: break-word; animation: cx-msg .35s var(--cx-ease) both; }
.msg p { margin: 0; } .msg p + p, .msg p + ul, .msg ul + p { margin-top: 8px; }
.msg ul { margin: 0; padding-left: 18px; }
.msg code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; padding: 1px 5px; border-radius: 6px; background: var(--cx-bubble); }
.msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.msg--agent { align-self: flex-start; background: var(--cx-bubble); border-bottom-left-radius: 6px; }
.msg--visitor { align-self: flex-end; background: var(--cx-accent); color: var(--cx-accent-ink); border-bottom-right-radius: 6px; }
.msg--visitor + .msg--visitor, .msg--agent + .msg--agent { margin-top: -2px; }
.msg--failed { opacity: .65; }
.msg__retry { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; color: var(--cx-danger); align-self: flex-end; }
.caret::after { content: ""; display: inline-block; width: 7px; height: 1.05em; margin-left: 2px; vertical-align: -2px; border-radius: 2px; background: currentColor; opacity: .55; animation: cx-blink 1s steps(2) infinite; }
.typing { display: inline-flex; gap: 4px; padding: 13px 14px; }
.typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--cx-ink-3); animation: cx-bounce 1.2s var(--cx-ease) infinite; }
.typing i:nth-child(2) { animation-delay: .15s; } .typing i:nth-child(3) { animation-delay: .3s; }
.empty { margin: auto 0 8px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 10px 8px 4px; }
.empty__face { width: 96px; height: 96px; border-radius: 50%; overflow: hidden; position: relative; box-shadow: 0 0 0 4px var(--cx-solid), 0 0 0 6px color-mix(in oklab, var(--cx-accent) 45%, transparent);
  background: radial-gradient(120% 90% at 50% 10%, color-mix(in oklab, var(--cx-accent) 22%, var(--cx-solid)), var(--cx-solid)); }
.empty__title { font-size: 17px; font-weight: 650; letter-spacing: -0.015em; }
.empty__body { font-size: 13.5px; color: var(--cx-ink-2); max-width: 280px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 4px; }
.chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px; font-size: 13px; border: 1px solid var(--cx-line); background: var(--cx-solid); transition: border-color .2s, transform .3s var(--cx-spring); }
.chip:hover { border-color: color-mix(in oklab, var(--cx-accent) 55%, transparent); transform: translateY(-1px); }
.chip svg { color: var(--cx-accent); }

.compose { padding: 10px 12px 12px; }
.compose__box { display: flex; align-items: flex-end; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 20px; background: var(--cx-solid); border: 1px solid var(--cx-line); transition: border-color .2s, box-shadow .2s; }
.compose__box:focus-within { border-color: color-mix(in oklab, var(--cx-accent) 60%, transparent); box-shadow: 0 0 0 4px color-mix(in oklab, var(--cx-accent) 14%, transparent); }
.compose textarea { flex: 1; resize: none; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14.5px; color: var(--cx-ink); max-height: 120px; padding: 7px 0; line-height: 1.4; }
.compose textarea::placeholder { color: var(--cx-ink-3); }
.send { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--cx-accent); color: var(--cx-accent-ink); flex: none; transition: transform .3s var(--cx-spring), opacity .2s; }
.send:disabled { opacity: .35; cursor: default; }
.send:not(:disabled):active { transform: scale(.9); }
.foot { text-align: center; font-size: 11px; color: var(--cx-ink-3); padding: 0 0 10px; }
.foot a { color: inherit; text-decoration: none; font-weight: 600; }

/* ------------------------------------------------------------ banners (queue / ready while chatting) */
.banner { margin: 10px 12px 0; padding: 10px 10px 10px 14px; border-radius: 16px; display: flex; align-items: center; gap: 10px; font-size: 13px;
  background: color-mix(in oklab, var(--cx-accent) 12%, var(--cx-solid)); border: 1px solid color-mix(in oklab, var(--cx-accent) 25%, transparent); animation: cx-rise .4s var(--cx-ease) both; }
.banner__text { flex: 1; min-width: 0; } .banner__text b { font-weight: 650; }
.banner .btn { height: 32px; padding: 0 12px; font-size: 13px; }

/* ------------------------------------------------------------ call */
.stage { flex: 1; position: relative; display: flex; flex-direction: column; overflow: hidden;
  background: radial-gradient(120% 70% at 50% 18%, color-mix(in oklab, var(--cx-accent) 26%, var(--cx-solid)) 0%, var(--cx-solid) 70%); }
.stage__figure { position: absolute; inset: 0; }
.stage__figure .portrait { position: absolute; inset: 0; }
.stage__veil { position: absolute; left: 0; right: 0; bottom: 0; height: 58%; background: linear-gradient(to top, var(--cx-solid) 18%, color-mix(in oklab, var(--cx-solid) 0%, transparent)); pointer-events: none; }
.stage__top { position: relative; display: flex; justify-content: space-between; align-items: center; padding: 14px 14px 0 16px; }
.badge { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 11px; border-radius: 999px; font-size: 12.5px; font-weight: 600; background: var(--cx-bg); backdrop-filter: blur(12px); border: 1px solid var(--cx-line); font-variant-numeric: tabular-nums; }
.badge i { width: 7px; height: 7px; border-radius: 50%; background: var(--cx-danger); animation: cx-pulse 1.6s ease-in-out infinite; }
.badge--warn { color: var(--cx-danger); }
.stage__bottom { position: relative; margin-top: auto; padding: 0 18px 18px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
.stage__name { font-size: 21px; font-weight: 700; letter-spacing: -0.02em; }
.stage__status { font-size: 13.5px; color: var(--cx-ink-2); min-height: 20px; display: inline-flex; align-items: center; gap: 8px; }
.wave { display: inline-flex; align-items: center; gap: 3px; height: 16px; }
.wave i { width: 3px; border-radius: 3px; background: var(--cx-accent); height: calc(4px + var(--cx-lvl, 0) * 12px * var(--k, 1)); transition: height .08s linear; }
.captions { width: 100%; min-height: 44px; font-size: 14.5px; color: var(--cx-ink); display: flex; flex-direction: column; gap: 2px; }
.captions__line { opacity: .55; font-size: 13px; } .captions__line--now { opacity: 1; font-size: 15px; font-weight: 500; }
.controls { display: flex; gap: 14px; align-items: center; justify-content: center; margin-top: 4px; }
.round { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--cx-bg); border: 1px solid var(--cx-line); backdrop-filter: blur(12px); transition: transform .3s var(--cx-spring), background .2s; }
.round:hover { transform: translateY(-2px); }
.round:active { transform: scale(.94); }
.round--on { background: var(--cx-ink); color: var(--cx-solid); }
.round--end { background: var(--cx-danger); color: #fff; border-color: transparent; width: 64px; height: 64px; }
.round__label { font-size: 11.5px; color: var(--cx-ink-2); margin-top: 6px; }
.ctl { display: flex; flex-direction: column; align-items: center; }

.voice { position: absolute; left: 50%; top: 34%; width: 240px; height: 240px; margin: -120px 0 0 -120px; border-radius: 50%; pointer-events: none;
  background: radial-gradient(closest-side, color-mix(in oklab, var(--cx-accent) 30%, transparent), transparent);
  transform: scale(calc(0.85 + var(--cx-lvl, 0) * 0.5)); opacity: calc(0.25 + var(--cx-lvl, 0) * 0.75); transition: transform .1s linear, opacity .1s linear; }

/* queue */
.line { position: relative; width: 168px; height: 168px; display: grid; place-items: center; margin: 4px auto 0; }
.line svg { position: absolute; inset: 0; transform: rotate(-90deg); }
.line__track { stroke: var(--cx-line); }
.line__fill { stroke: var(--cx-accent); transition: stroke-dashoffset .8s var(--cx-ease); }
.line__num { font-size: 46px; font-weight: 750; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.line__lbl { font-size: 12px; color: var(--cx-ink-2); text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 18px; border-radius: 999px; font-size: 14.5px; font-weight: 600; background: var(--cx-bubble); transition: transform .3s var(--cx-spring), background .2s; }
.btn:hover { background: color-mix(in oklab, var(--cx-ink) 10%, transparent); }
.btn:active { transform: scale(.97); }
.btn--accent { background: var(--cx-accent); color: var(--cx-accent-ink); }
.btn--accent:hover { background: color-mix(in oklab, var(--cx-accent) 88%, #000); }
.btn--glow { box-shadow: 0 0 0 0 color-mix(in oklab, var(--cx-accent) 55%, transparent); animation: cx-glow 1.6s ease-out infinite; }
.btn-row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.note { font-size: 13.5px; color: var(--cx-ink-2); max-width: 300px; }
.title { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
.spinner { width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid var(--cx-line); border-top-color: var(--cx-accent); animation: cx-spin 0.8s linear infinite; }

/* ------------------------------------------------------------ portrait */
.portrait { position: relative; width: 100%; height: 100%; overflow: hidden; }
.portrait__media { position: absolute; max-width: none; transition: opacity .35s ease; user-select: none; -webkit-user-drag: none; }
.portrait--initial { display: grid; place-items: center; font-size: 26px; font-weight: 700; color: var(--cx-accent); }

/* ------------------------------------------------------------ test-mode ribbon */
.dock { position: relative; }
/* A small tag on the portrait's lower edge: present, never in the way. */
.testmode { position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); font-size: 8.5px; font-weight: 800; letter-spacing: .08em; line-height: 1; padding: 3px 5px; border-radius: 5px; background: #f59e0b; color: #1c1206; box-shadow: 0 0 0 2px var(--cx-solid); pointer-events: none; }

/* ------------------------------------------------------------ phones: a bottom sheet */
@media (max-width: 520px) {
  :host([data-open]) { left: 0 !important; right: 0 !important; bottom: 0 !important; }
  .panel { position: fixed; left: 0; right: 0; bottom: 0; width: 100%; height: min(92dvh, 760px); border-radius: var(--cx-radius) var(--cx-radius) 0 0; padding-bottom: env(safe-area-inset-bottom); animation-name: cx-sheet; }
  .presence { width: 56px; height: 56px; }
}

@keyframes cx-spin { to { transform: rotate(360deg); } }
@keyframes cx-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes cx-pop { from { opacity: 0; transform: translateY(8px) scale(.92); } to { opacity: 1; transform: none; } }
@keyframes cx-open { from { opacity: 0; transform: translateY(14px) scale(.94); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }
@keyframes cx-close { to { opacity: 0; transform: translateY(10px) scale(.96); } }
@keyframes cx-sheet { from { transform: translateY(100%); } to { transform: none; } }
@keyframes cx-msg { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes cx-blink { 50% { opacity: 0; } }
@keyframes cx-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
@keyframes cx-pulse { 50% { opacity: .35; } }
@keyframes cx-glow-ring { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.35); opacity: 0; } }
@keyframes cx-glow { 0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--cx-accent) 50%, transparent); } 100% { box-shadow: 0 0 0 16px transparent; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .presence__ring { animation: none; }
}
`;
