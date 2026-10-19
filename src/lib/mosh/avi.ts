/** Container-level AVI surgery. MPEG-4 frame type comes from the VOP start code, not a guess. */

export const AVIIF_KEYFRAME = 0x10;

export type AviFrame = {
  id: string;
  flags: number;
  payload: Uint8Array;
  protect: boolean;
};

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function readU32(buf: Uint8Array, offset: number): number {
  return view(buf).getUint32(offset, true);
}

function writeU32(buf: Uint8Array, offset: number, value: number): void {
  view(buf).setUint32(offset, value >>> 0, true);
}

function fourcc(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

function findFourcc(buf: Uint8Array, id: string): number {
  const a = id.charCodeAt(0);
  const b = id.charCodeAt(1);
  const c = id.charCodeAt(2);
  const d = id.charCodeAt(3);
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === a && buf[i + 1] === b && buf[i + 2] === c && buf[i + 3] === d) return i;
  }
  return -1;
}

/** MPEG-4 Part 2: 00 00 01 B6, then 2-bit vop_coding_type. 00 = I, 01 = P, 10 = B. */
export function vopCodingType(payload: Uint8Array): number | null {
  const end = payload.length - 4;
  for (let i = 0; i < end; i++) {
    if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1 && payload[i + 3] === 0xb6) {
      return payload[i + 4] >> 6;
    }
  }
  return null;
}

export function isIFrame(frame: { payload: Uint8Array; flags: number }): boolean {
  const coding = vopCodingType(frame.payload);
  if (coding !== null) return coding === 0;
  return (frame.flags & AVIIF_KEYFRAME) !== 0;
}

export function cloneFrame(frame: AviFrame): AviFrame {
  return {
    id: frame.id,
    flags: frame.flags,
    payload: frame.payload.slice(),
    protect: frame.protect,
  };
}

export function parseAvi(buf: Uint8Array): { frames: AviFrame[]; moviAt: number } {
  if (buf.length < 12 || fourcc(buf, 0) !== "RIFF") {
    throw new Error("The encoder did not return an AVI.");
  }
  let i = 12;
  let movi = -1;
  let idx = -1;
  while (i + 8 <= buf.length) {
    const cid = fourcc(buf, i);
    const size = readU32(buf, i + 4);
    if (cid === "LIST" && i + 12 <= buf.length && fourcc(buf, i + 8) === "movi") movi = i;
    if (cid === "idx1") {
      idx = i;
      break;
    }
    const step = 8 + size + (size & 1);
    if (step < 8) break;
    i += step;
  }
  if (movi < 0 || idx < 0) {
    throw new Error("This AVI has no frame index. Shorten the clip and try again.");
  }
  const count = Math.floor(readU32(buf, idx + 4) / 16);
  if (count <= 0) throw new Error("The AVI contains no frames.");

  const entries: { flags: number; offset: number }[] = [];
  for (let n = 0; n < count; n++) {
    const o = idx + 8 + n * 16;
    entries.push({ flags: readU32(buf, o + 4), offset: readU32(buf, o + 8) });
  }

  let base = -1;
  for (const candidate of [movi + 8, movi, movi + 4, 0]) {
    const pos = candidate + entries[0].offset;
    if (pos < 0 || pos + 4 > buf.length) continue;
    const tag = fourcc(buf, pos);
    if (tag === "00dc" || tag === "00db" || tag === "00wb") {
      base = candidate;
      break;
    }
  }
  if (base < 0) throw new Error("Could not locate frames in the AVI.");

  const frames: AviFrame[] = [];
  for (const entry of entries) {
    const pos = base + entry.offset;
    if (pos + 8 > buf.length) throw new Error("The AVI index points past the end of the file.");
    const id = fourcc(buf, pos);
    const size = readU32(buf, pos + 4);
    if (pos + 8 + size > buf.length) throw new Error("A frame payload runs past the end of the AVI.");
    frames.push({
      id,
      flags: entry.flags,
      payload: buf.slice(pos + 8, pos + 8 + size),
      protect: false,
    });
  }
  return { frames, moviAt: movi };
}

export function reflag(frames: AviFrame[]): AviFrame[] {
  return frames.map((frame, index) => {
    const keepKey = frame.protect && isIFrame(frame);
    return { ...frame, flags: index === 0 || keepKey ? AVIIF_KEYFRAME : 0 };
  });
}

/** Rebuild a standard (non-OpenDML) AVI using the template's hdrl and a new movi/idx1. */
export function rebuildAvi(template: Uint8Array, frames: AviFrame[]): Uint8Array {
  if (!frames.length) throw new Error("The mosh produced zero frames.");
  const { moviAt } = parseAvi(template);
  const header = template.slice(0, moviAt);
  const avih = findFourcc(header, "avih");
  const strh = findFourcc(header, "strh");
  if (avih < 0 || strh < 0) throw new Error("AVI header is missing stream info.");

  writeU32(header, avih + 8 + 16, frames.length);
  writeU32(header, strh + 8 + 32, frames.length);
  let maxSize = 0;
  for (const frame of frames) if (frame.payload.length > maxSize) maxSize = frame.payload.length;
  writeU32(header, avih + 8 + 28, maxSize);
  writeU32(header, strh + 8 + 36, maxSize);
  const dmlh = findFourcc(header, "dmlh");
  if (dmlh >= 0 && dmlh + 12 <= header.length) writeU32(header, dmlh + 8, frames.length);

  const bodyParts: Uint8Array[] = [];
  const index = new Uint8Array(frames.length * 16);
  const indexView = new DataView(index.buffer);
  let bodyLen = 0;
  frames.forEach((frame, n) => {
    const id = frame.id.length === 4 ? frame.id : "00dc";
    const size = frame.payload.length;
    const chunk = new Uint8Array(8 + size + (size & 1));
    chunk[0] = id.charCodeAt(0);
    chunk[1] = id.charCodeAt(1);
    chunk[2] = id.charCodeAt(2);
    chunk[3] = id.charCodeAt(3);
    new DataView(chunk.buffer).setUint32(4, size, true);
    chunk.set(frame.payload, 8);
    bodyParts.push(chunk);
    const ent = n * 16;
    index[ent] = chunk[0];
    index[ent + 1] = chunk[1];
    index[ent + 2] = chunk[2];
    index[ent + 3] = chunk[3];
    indexView.setUint32(ent + 4, frame.flags >>> 0, true);
    indexView.setUint32(ent + 8, 4 + bodyLen, true);
    indexView.setUint32(ent + 12, size, true);
    bodyLen += chunk.length;
  });

  const listSize = 4 + bodyLen;
  const movi = new Uint8Array(8 + listSize);
  movi.set([0x4c, 0x49, 0x53, 0x54], 0);
  new DataView(movi.buffer).setUint32(4, listSize, true);
  movi.set([0x6d, 0x6f, 0x76, 0x69], 8);
  let offset = 12;
  for (const part of bodyParts) {
    movi.set(part, offset);
    offset += part.length;
  }

  const idx = new Uint8Array(8 + index.length);
  idx.set([0x69, 0x64, 0x78, 0x31], 0);
  new DataView(idx.buffer).setUint32(4, index.length, true);
  idx.set(index, 8);

  const out = new Uint8Array(header.length + movi.length + idx.length);
  out.set(header, 0);
  out.set(movi, header.length);
  out.set(idx, header.length + movi.length);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}
