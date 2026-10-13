/**
 * Contact details a visitor TYPED into the chat ("sure, I'm Ginger,
 * ginger@alpha.com, 72005 80713"), so the details card can open already filled
 * in. Nothing here sends anything: the card is still the one confirmation, with
 * the consent line on it.
 *
 * Deliberately conservative. A missed name costs the visitor one field; a wrong
 * one ("Interested") is worse, so a name is taken only from an explicit
 * "I'm / my name is / this is" and only when it looks like a name.
 */

export interface TypedContact {
  name?: string;
  email?: string;
  phone?: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /\+?\d[\d\s().-]{5,}\d/g;
const NAME = /\b(?:my name is|i am|i'm|im|this is|name\s*[:-])\s+([A-Za-z][A-Za-z'’-]+(?:\s+[A-Za-z][A-Za-z'’-]+)?)/i;
// Words that follow "I'm" without being a name.
const NOT_NAMES = new Set(['interested', 'looking', 'from', 'with', 'here', 'trying', 'not', 'a', 'an', 'the', 'just', 'also', 'happy', 'keen', 'curious', 'calling', 'sure', 'fine', 'good', 'okay', 'ok']);

/** What looks like contact details in `text`, or null when there is no email and no phone. */
export function extractContact(text: string): TypedContact | null {
  const out: TypedContact = {};
  const email = text.match(EMAIL)?.[0];
  if (email) out.email = email.replace(/[.,;:]+$/, '');
  // The first run of digits that is a plausible phone number (7–15 digits).
  for (const m of text.replace(EMAIL, ' ').matchAll(PHONE)) {
    const digits = m[0].replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      out.phone = m[0].trim();
      break;
    }
  }
  if (!out.email && !out.phone) return null;
  const n = text.match(NAME)?.[1];
  if (n) {
    const words = n.split(/\s+/).filter((w) => !NOT_NAMES.has(w.toLowerCase()));
    // Stop at the first word that is clearly not part of a name ("Ginger and", "Priya here").
    const kept: string[] = [];
    for (const w of words) {
      if (['and', 'here', 'at', 'from'].includes(w.toLowerCase())) break;
      kept.push(w);
    }
    if (kept.length && kept[0]!.length > 1) out.name = kept.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
  }
  return out;
}
