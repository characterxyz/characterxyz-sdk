/**
 * `@characterxyz/web` — Character XYZ on any web page, headless.
 *
 * ```ts
 * import { CharacterXYZ } from '@characterxyz/web';
 *
 * const cx = await CharacterXYZ.init({ publishableKey: 'cxyz_pk_live_…' });
 * cx.chat.on('messages', render);
 * await cx.chat.send('Hi!');
 *
 * button.onclick = async () => {
 *   const call = await cx.startCall();
 *   call.on('state', (s) => show(s.phase, s.position));
 * };
 * ```
 *
 * The ready-made widget is `@characterxyz/widget`; this package is what it
 * is built on, for brands who want their own UI.
 */
export { CharacterXYZ, DEFAULT_API_URL, type InitOptions, type ClientEvents } from './client.js';
export { Chat, type ChatEvents } from './chat.js';
export { Call, type CallEvents, type CallOptions } from './call.js';
export { CxError, type CxErrorCode } from './errors.js';
export { Emitter } from './emitter.js';
export type { VisitorStore } from './session.js';
export type {
  AgentCard,
  CallEndReason,
  CallPhase,
  CallState,
  Caption,
  ChatMessage,
  ContactDetails,
  DetailsForm,
  Features,
  Opening,
  SessionInfo,
  VideoCharacter,
  VideoClip,
} from './types.js';
export const VERSION = '0.3.0';
