/**
 * The agent socket's binary packet (the same one the Stage reads):
 *
 *   "CXYZ" | version u8 (1) | kind u8 | flags u8 (bit 0 = final)
 *   | corrLen u16 | corr utf8 | seq u32 | timestamp u64 | duration u32
 *   | payloadLen u32 | payload
 *
 * All little-endian. Kind 1 is voice (PCM16), kind 2/3 are face data, which
 * this SDK does not draw yet.
 */
export interface Packet {
  kind: number;
  final: boolean;
  corr: string;
  payload: Uint8Array;
}

export function parsePacket(buf: ArrayBuffer): Packet | null {
  if (buf.byteLength < 25) return null;
  const v = new DataView(buf);
  if (v.getUint8(0) !== 0x43 || v.getUint8(1) !== 0x58 || v.getUint8(2) !== 0x59 || v.getUint8(3) !== 0x5a) return null;
  if (v.getUint8(4) !== 1) return null;
  const kind = v.getUint8(5);
  const final = (v.getUint8(6) & 1) !== 0;
  let o = 7;
  const corrLen = v.getUint16(o, true);
  o += 2;
  if (o + corrLen + 20 > buf.byteLength) return null;
  const corr = new TextDecoder().decode(new Uint8Array(buf, o, corrLen));
  o += corrLen + 4 + 8 + 4;
  const len = v.getUint32(o, true);
  o += 4;
  if (o + len > buf.byteLength) return null;
  return { kind, final, corr, payload: new Uint8Array(buf, o, len) };
}

/** Build one (for tests and tools). */
export function buildPacket(p: { kind: number; final: boolean; corr: string; payload: Uint8Array }): ArrayBuffer {
  const corr = new TextEncoder().encode(p.corr);
  const head = 7 + 2 + corr.length + 4 + 8 + 4 + 4;
  const buf = new ArrayBuffer(head + p.payload.byteLength);
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  bytes.set([0x43, 0x58, 0x59, 0x5a], 0);
  v.setUint8(4, 1);
  v.setUint8(5, p.kind);
  v.setUint8(6, p.final ? 1 : 0);
  let o = 7;
  v.setUint16(o, corr.length, true);
  o += 2;
  bytes.set(corr, o);
  o += corr.length + 4 + 8 + 4;
  v.setUint32(o, p.payload.byteLength, true);
  o += 4;
  bytes.set(p.payload, o);
  return buf;
}
