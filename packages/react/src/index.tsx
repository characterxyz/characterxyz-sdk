/**
 * `@characterxyz/react`
 *
 * ```tsx
 * import { CharacterXYZWidget } from '@characterxyz/react';
 *
 * <CharacterXYZWidget publishableKey="cxyz_pk_live_…" accent="#e11d48" onReady={(a) => track(a)} />
 * ```
 *
 * Or build your own UI on the headless SDK:
 *
 * ```tsx
 * const { client, messages, send, startCall, call } = useCharacterXYZ({ publishableKey });
 * ```
 */
import { CharacterXYZ, type Call, type CallState, type ChatMessage, type CxError, type InitOptions } from '@characterxyz/web';
import { mount, type MountOptions, type WidgetHandle } from '@characterxyz/widget';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface CharacterXYZWidgetProps extends MountOptions {
  onReady?: (detail: { agent: { id: string; name: string } }) => void;
  onOpen?: (view: 'chat' | 'call') => void;
  onClose?: () => void;
  onError?: (detail: { code: string; message: string }) => void;
}

export interface CharacterXYZWidgetRef {
  open(view?: 'chat' | 'call'): void;
  close(): void;
  track(name: string, data?: Record<string, unknown>, opts?: { id?: string }): Promise<import('@characterxyz/web').TrackResult> | undefined;
  identify(visitor: import('@characterxyz/web').VisitorIdentity): Promise<void> | undefined;
  setContext(context: Record<string, unknown>): Promise<void> | undefined;
  registerAction(name: string, handler: import('@characterxyz/web').ClientActionHandler): (() => void) | undefined;
}

/**
 * The ready-made widget. Renders nothing in your tree: the widget lives in
 * its own element at the end of <body>. Re-mounts when the key or agent changes.
 */
export const CharacterXYZWidget = forwardRef<CharacterXYZWidgetRef, CharacterXYZWidgetProps>(function CharacterXYZWidget(props, ref) {
  const handle = useRef<WidgetHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useImperativeHandle(ref, () => ({
    open: (v) => handle.current?.open(v),
    close: () => handle.current?.close(),
    track: (n, d, o) => handle.current?.track(n, d, o),
    identify: (v) => handle.current?.identify(v),
    setContext: (c) => handle.current?.setContext(c),
    registerAction: (n, h) => handle.current?.registerAction(n, h),
  }));

  useEffect(() => {
    const { onReady, onOpen, onClose, onError, ...opts } = latest.current;
    void onReady;
    void onOpen;
    void onClose;
    void onError;
    const w = mount(opts);
    handle.current = w;
    const el = w.element;
    const on = (name: string, fn: (e: CustomEvent) => void) => {
      const h = (e: Event) => fn(e as CustomEvent);
      el.addEventListener(name, h);
      return () => el.removeEventListener(name, h);
    };
    const offs = [
      on('cx-ready', (e) => latest.current.onReady?.(e.detail)),
      on('cx-open', (e) => latest.current.onOpen?.(e.detail.view)),
      on('cx-close', () => latest.current.onClose?.()),
      on('cx-error', (e) => latest.current.onError?.(e.detail)),
    ];
    return () => {
      offs.forEach((f) => f());
      w.destroy();
      handle.current = null;
    };
    // The widget's look is read at mount; a new key or agent is a new widget.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.publishableKey, props.agentId, props.apiUrl]);

  return null;
});

export interface UseCharacterXYZ {
  client: CharacterXYZ | null;
  error: CxError | null;
  messages: readonly ChatMessage[];
  busy: boolean;
  send(text: string): Promise<void>;
  call: CallState | null;
  startCall(): Promise<Call | null>;
  track(name: string, data?: Record<string, unknown>, opts?: { id?: string }): Promise<import('@characterxyz/web').TrackResult | null>;
  identify(visitor: import('@characterxyz/web').VisitorIdentity): Promise<void>;
  setContext(context: Record<string, unknown>): Promise<void>;
  registerAction(name: string, handler: import('@characterxyz/web').ClientActionHandler): () => void;
}

/** The headless SDK as React state, for brands building their own UI. */
export function useCharacterXYZ(options: InitOptions): UseCharacterXYZ {
  const [client, setClient] = useState<CharacterXYZ | null>(null);
  const [error, setError] = useState<CxError | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [call, setCall] = useState<CallState | null>(null);
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    let cancelled = false;
    let c: CharacterXYZ | null = null;
    const offs: Array<() => void> = [];
    CharacterXYZ.init(opts.current).then(
      (cl) => {
        if (cancelled) return cl.destroy();
        c = cl;
        setClient(cl);
        offs.push(cl.chat.on('messages', setMessages), cl.chat.on('busy', setBusy));
        offs.push(
          cl.on('call', (k) => {
            if (k) offs.push(k.on('state', setCall));
          }),
        );
        void cl.chat.load().catch(() => {});
      },
      (e) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
      offs.forEach((f) => f());
      c?.destroy();
    };
  }, [options.publishableKey, options.agentId, options.apiUrl]);

  return {
    client,
    error,
    messages,
    busy,
    call,
    send: async (text) => {
      await client?.chat.send(text);
    },
    startCall: async () => (client ? client.startCall() : null),
    track: async (name, data, opts) => (client ? client.track(name, data, opts) : null),
    identify: async (visitor) => {
      await client?.identify(visitor);
    },
    setContext: async (context) => {
      await client?.setContext(context);
    },
    registerAction: (name, handler) => client?.registerAction(name, handler) ?? (() => {}),
  };
}

export type { Call, CallState, ChatMessage, CxError } from '@characterxyz/web';
