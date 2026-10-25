// The window's own words. English ships here; on a plan that localizes, the
// server returns them in the visitor's language with her opening
// (`opening.strings`), and any key it does not return stays English.
//
// ⚠ MIRRORED BY characterxyz-backend/src/sdk/strings.rs (`EN`). Add or change a
// text in both, and bump the backend's VERSION so cached translations are redone.
import { ordinal } from './format.js';

const EN = {
  assistant: 'Assistant',
  online: 'Online',
  typing: 'Typing…',
  typingName: '{name} is typing',
  message: 'Message',
  send: 'Send',
  sending: 'Sending…',
  close: 'Close',
  minimise: 'Minimise',
  dismiss: 'Dismiss',
  notNow: 'Not now',
  newConversation: 'Start a new conversation',
  chat: 'Chat',
  chatWith: 'Chat with {name}',
  call: 'Call',
  callName: 'Call {name}',
  callWith: 'Call with {name}',
  startCall: 'Start call',
  callAgain: 'Call again',
  joinCall: 'Join call',
  join: 'Join',
  view: 'View',
  onCall: 'On call',
  backToCall: 'Back to your call',
  backToCallWith: 'Back to your call with {name}',
  callTime: 'Call time',
  timeLeft: '{time} left',
  endCall: 'End call',
  end: 'End',
  mute: 'Mute',
  unmute: 'Unmute',
  muted: 'You are muted',
  interrupt: 'Interrupt',
  interruptName: 'Interrupt {name}',
  connecting: 'Connecting…',
  joining: 'Joining…',
  speaking: 'Speaking',
  thinking: 'Thinking…',
  listening: 'Listening',
  you: 'You: {text}',
  inLine: '{position} in line',
  lineLabel: 'in line',
  inLineFor: "You're {position} in line for a call · {eta}",
  inLineToCall: 'You are {position} in line to call {name}. Open',
  inLineOpen: 'You are {position} in line. Open your call',
  inLineEta: 'You are {position} in line, {eta}',
  onOtherCalls: '{name} is on other calls',
  yourTurn: "Your turn in {eta}. We'll chime when it's time.",
  yourTurnChat: "Your turn in {eta}. We'll chime when it's time, so feel free to keep chatting.",
  keepChatting: 'Keep chatting',
  leaveLine: 'Leave line',
  readyForYou: '{name} is ready for you',
  secondsToJoin: '{seconds}s to join',
  joinWithin: 'Join within {seconds} seconds.',
  talkWith: 'Talk with {name} in real time.',
  etaSoon: 'less than a minute',
  etaMin: 'about {n} min',
  etaHr: 'about {n} hr',
  notSent: 'Not sent · Retry',
  beforeYouCall: 'Before you call {name}',
  leaveDetails: 'Leave your details',
  confirmDetails: 'Confirm your details',
  detailsWhy: 'So the team can follow up, even if the line drops.',
  detailsTyped: 'From what you typed. Check them and send.',
  reasonField: 'Reason',
  reasonChoose: 'Choose a reason',
  reasonOther: 'Something else',
  reasonPlaceholder: 'Tell us in a few words',
  reasonInferred: "I'll tell the team this is about",
  reasonFromConversation: 'From your conversation',
  reasonFromPage: 'From this page',
  change: 'Change',
  skipAndCall: 'Skip and call',
  optional: 'optional',
  privacyPolicy: 'Privacy policy',
  thanks: 'Thanks. The team will be in touch.',
  thanksName: 'Thanks, {name}. The team will be in touch.',
  sendFailed: 'Could not send. Try again.',
  nameField: 'Name',
  emailField: 'Email',
  phoneField: 'Phone',
  companyField: 'Company',
  poweredBy: 'Powered by {brand}',
  greetingDefault: "Hi, I'm {name}. How can I help you today?",
  endedTitle: 'Call ended',
  endedBody: 'Thanks for talking with {name}.',
  leftTitle: 'You left the line',
  leftBody: 'You can call again whenever you like.',
  missedTitle: 'You missed your turn',
  missedBody: "{name} was ready, but the call wasn't joined in time.",
  stillBusyTitle: 'Still busy',
  stillBusyBody: 'Sorry for the wait. {name} is still on other calls. Chat is open meanwhile.',
  limitTitle: 'Time is up',
  limitBody: 'This call reached its time limit.',
  busyTitle: 'All lines are busy',
  busyBody: 'Try again in a few minutes, or keep chatting.',
  micTitle: 'Microphone needed',
  micBody: 'Allow the microphone in your browser to talk, or keep chatting.',
  silenceBody: 'The line was quiet for a minute, so {name} hung up. Call again any time.',
  restingTitle: 'Calls are resting',
  restingBody: 'Calls are done for today. Chat is open.',
  unavailableTitle: 'Calls are unavailable',
  unavailableBody: 'Calls are not available right now. Chat is open.',
  droppedTitle: 'The call dropped',
  droppedBody: 'Something interrupted the call. Try again.',
} as const;

export type Key = keyof typeof EN;

let table: Partial<Record<string, string>> = {};
let english = true;

/** Use the server's labels (`opening.strings`); absent or empty keeps English. */
export function setStrings(strings?: Record<string, string> | null): void {
  table = strings ?? {};
  english = !strings || !Object.keys(strings).length;
}

/** A label, with `{placeholders}` filled in. */
export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = table[key] ?? EN[key];
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** A place in line: "2nd" in English, "2" in any other language. */
export function place(n: number): string {
  return english ? ordinal(n) : String(n);
}

/** "less than a minute", "about 4 min", "about 1 hr" — or nothing when unknown. */
export function wait(seconds: number | null): string {
  if (seconds == null) return '';
  if (seconds < 60) return t('etaSoon');
  const m = Math.round(seconds / 60);
  return m < 60 ? t('etaMin', { n: m }) : t('etaHr', { n: Math.round(m / 60) });
}

/** What a call's end says, by the reason the server gave. */
export function ending(reason: string | null, name: string): { title: string; body: string } {
  const pair = (title: Key, body: Key) => ({ title: t(title), body: t(body, { name }) });
  switch (reason) {
    case 'hangup':
      return pair('endedTitle', 'endedBody');
    case 'left':
      return pair('leftTitle', 'leftBody');
    case 'missed':
      return pair('missedTitle', 'missedBody');
    case 'timeout':
      return pair('stillBusyTitle', 'stillBusyBody');
    case 'limit':
      return pair('limitTitle', 'limitBody');
    case 'busy':
      return pair('busyTitle', 'busyBody');
    case 'mic-denied':
      return pair('micTitle', 'micBody');
    case 'silence':
      return pair('endedTitle', 'silenceBody');
    case 'daily_limit':
      return pair('restingTitle', 'restingBody');
    case 'credits':
    case 'unavailable':
      return pair('unavailableTitle', 'unavailableBody');
    default:
      return pair('droppedTitle', 'droppedBody');
  }
}

/** For the backend's mirror check and tests: the English table. */
export const ENGLISH: Readonly<Record<Key, string>> = EN;
