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

/** 0:07, 3:12, 1:02:03 */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
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
