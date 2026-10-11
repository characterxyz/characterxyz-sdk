/** "1st", "2nd", "3rd", "11th". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** "less than a minute", "about 1 min", "about 4 min", "about 1 hr". */
export function eta(seconds: number | null): string {
  if (seconds == null) return '';
  if (seconds < 60) return 'less than a minute';
  const m = Math.round(seconds / 60);
  if (m < 60) return `about ${m} min`;
  return `about ${Math.round(m / 60)} hr`;
}

/** 0:07, 3:12, 1:02:03 */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** What a visitor is told when a call could not happen or ended. */
export function endCopy(reason: string | null, name: string): { title: string; body: string } {
  switch (reason) {
    case 'hangup':
      return { title: 'Call ended', body: `Thanks for talking with ${name}.` };
    case 'left':
      return { title: 'You left the line', body: 'You can call again whenever you like.' };
    case 'missed':
      return { title: 'You missed your turn', body: `${name} was ready, but the call wasn't joined in time.` };
    case 'timeout':
      return { title: 'Still busy', body: `Sorry for the wait. ${name} is still on other calls. Chat is open meanwhile.` };
    case 'limit':
      return { title: 'Time is up', body: 'This call reached its time limit.' };
    case 'busy':
      return { title: 'All lines are busy', body: 'Try again in a few minutes, or keep chatting.' };
    case 'mic-denied':
      return { title: 'Microphone needed', body: 'Allow the microphone in your browser to talk, or keep chatting.' };
    case 'credits':
    case 'unavailable':
      return { title: 'Calls are unavailable', body: 'Calls are not available right now. Chat is open.' };
    default:
      return { title: 'The call dropped', body: 'Something interrupted the call. Try again.' };
  }
}

/**
 * Light markdown for replies: **bold**, *italic*, `code`, links, line breaks
 * and "- " lists. Returns tokens, never HTML, so nothing a model writes can
 * become markup.
 */
export type Inline = { t: 'text' | 'b' | 'i' | 'code'; v: string } | { t: 'link'; v: string; href: string };
export type Block = { t: 'p'; parts: Inline[] } | { t: 'ul'; items: Inline[][] };

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) out.push({ t: 'b', v: tok.slice(2, -2) });
    else if (tok.startsWith('`')) out.push({ t: 'code', v: tok.slice(1, -1) });
    else if (tok.startsWith('[')) out.push({ t: 'link', v: tok.slice(1, tok.indexOf(']')), href: m[2]! });
    else if (tok.startsWith('http')) out.push({ t: 'link', v: tok, href: tok });
    else out.push({ t: 'i', v: tok.slice(1, -1) });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

export function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const para of text.split(/\n{2,}/)) {
    const lines = para.split('\n');
    if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
      out.push({ t: 'ul', items: lines.map((l) => inline(l.replace(/^\s*[-*•]\s+/, ''))) });
    } else {
      out.push({ t: 'p', parts: inline(para) });
    }
  }
  return out;
}
