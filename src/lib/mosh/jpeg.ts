export type JpegMode = "repeat" | "delete" | "swap" | "shift";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function findEntropy(bytes: Uint8Array): { start: number; end: number } | null {
  let sos = -1;
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xda) sos = i;
  }
  if (sos < 0) return null;
  const segLen = (bytes[sos + 2] << 8) | bytes[sos + 3];
  const start = sos + 2 + segLen;
  let end = -1;
  for (let i = bytes.length - 2; i > start; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      end = i;
      break;
    }
  }
  if (end < 0 || end - start < 48) return null;
  return { start, end };
}

function safe(buf: Uint8Array, at: number, len: number): boolean {
  if (at < 1 || at + len > buf.length) return false;
  if (buf[at - 1] === 0xff) return false;
  for (let i = 0; i < len; i++) if (buf[at + i] === 0xff) return false;
  return true;
}

function locate(buf: Uint8Array, rng: () => number, len: number): number {
  if (buf.length < len + 4) return -1;
  for (let attempt = 0; attempt < 32; attempt++) {
    const at = 1 + Math.floor(rng() * Math.max(1, buf.length - len - 1));
    if (safe(buf, at, len)) return at;
  }
  for (let at = 1; at + len <= buf.length; at++) if (safe(buf, at, len)) return at;
  return -1;
}

function mutate(entropy: Uint8Array<ArrayBufferLike>, mode: JpegMode, rng: () => number, intensity: number): Uint8Array<ArrayBufferLike> {
  const len = Math.max(8, Math.min(80, Math.round(10 + intensity / 2)));
  const at = locate(entropy, rng, len);
  if (at < 0) return entropy;
  if (mode === "repeat") {
    const chunk = entropy.slice(at, at + len);
    const out = new Uint8Array(entropy.length + chunk.length);
    out.set(entropy.subarray(0, at + len), 0);
    out.set(chunk, at + len);
    out.set(entropy.subarray(at + len), at + len + chunk.length);
    return out;
  }
  if (mode === "delete") {
    if (entropy.length - len < 48) return entropy;
    const out = new Uint8Array(entropy.length - len);
    out.set(entropy.subarray(0, at), 0);
    out.set(entropy.subarray(at + len), at);
    return out;
  }
  if (mode === "shift") {
    const dest = locate(entropy, rng, len);
    if (dest < 0 || Math.abs(dest - at) < len) return entropy;
    const chunk = entropy.slice(at, at + len);
    const removed = new Uint8Array(entropy.length - len);
    removed.set(entropy.subarray(0, at), 0);
    removed.set(entropy.subarray(at + len), at);
    const insertAt = dest > at ? dest - len : dest;
    const clamped = Math.max(0, Math.min(removed.length, insertAt));
    const out = new Uint8Array(removed.length + chunk.length);
    out.set(removed.subarray(0, clamped), 0);
    out.set(chunk, clamped);
    out.set(removed.subarray(clamped), clamped + chunk.length);
    return out;
  }
  const at2 = locate(entropy, rng, len);
  if (at2 < 0 || Math.abs(at2 - at) < len) return entropy;
  const out = entropy.slice();
  const a = out.slice(at, at + len);
  const b = out.slice(at2, at2 + len);
  out.set(b, at);
  out.set(a, at2);
  return out;
}

/** Dent JPEG entropy bytes without forging markers. This is still-image databending, not a pixel filter. */
export function glitchJpeg(
  input: Uint8Array,
  opts: { seed: number; passes: number; mode: JpegMode; intensity: number },
): Uint8Array<ArrayBuffer> {
  const bounds = findEntropy(input);
  if (!bounds) throw new Error("That file is not a JPEG with a dentable scan.");
  let entropy: Uint8Array<ArrayBufferLike> = input.slice(bounds.start, bounds.end);
  const rng = mulberry32(opts.seed);
  const passes = Math.max(1, Math.min(48, Math.round(opts.passes)));
  for (let i = 0; i < passes; i++) entropy = mutate(entropy, opts.mode, rng, opts.intensity);
  const out = new Uint8Array(new ArrayBuffer(bounds.start + entropy.length + (input.length - bounds.end)));
  out.set(input.subarray(0, bounds.start), 0);
  out.set(entropy, bounds.start);
  out.set(input.subarray(bounds.end), bounds.start + entropy.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
}

/** Uncompressed ZIP (store). Enough to hand back a folder of dented stills. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = [
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ];
    const localBytes = concat(local);
    parts.push(localBytes);
    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += localBytes.length;
  }
  const centralBytes = concat(central);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...parts, centralBytes, end]);
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let n = 0;
  for (const part of parts) n += part.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}
