import { AVIIF_KEYFRAME, cloneFrame, isIFrame, reflag, type AviFrame } from "./avi";
import { MAX_FRAMES, encodeCount, type Clip, type Settings } from "./types";

export type ClipInput = {
  frames: AviFrame[];
  role: Clip["role"];
  protectKey: boolean;
  seedTail: number;
};

export type MoshStats = {
  inputFrames: number;
  outputFrames: number;
  keysBefore: number;
  keysAfter: number;
  donatedKeys: number;
  repeated: number;
  bent: number;
  warnings: string[];
};

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

function range(length: number, startPct: number, endPct: number, floorAtOne: boolean): [number, number] {
  const start = Math.floor((length * Math.min(startPct, endPct)) / 100);
  const end = Math.ceil((length * Math.max(startPct, endPct)) / 100);
  const a = floorAtOne ? Math.max(1, start) : Math.max(0, start);
  const b = Math.max(a, Math.min(length, end));
  return [a, b];
}

export function assemble(clips: ClipInput[]): { frames: AviFrame[]; droppedKeys: number } {
  const out: AviFrame[] = [];
  let droppedKeys = 0;
  clips.forEach((clip, index) => {
    let frames = clip.frames.map(cloneFrame);
    if (!frames.length) return;
    if (clip.role === "seed") {
      frames = frames.slice(0, Math.max(1, 1 + clip.seedTail));
    } else if (clip.role === "motion" && index !== 0) {
      const deltas = frames.filter((frame) => !isIFrame(frame));
      if (deltas.length) {
        droppedKeys += frames.length - deltas.length;
        frames = deltas;
      }
    }
    if (clip.protectKey) {
      const at = frames.findIndex((frame) => isIFrame(frame));
      if (at >= 0) frames[at] = { ...frames[at], protect: true };
    }
    out.push(...frames);
  });
  if (!out.length) throw new Error("Nothing to mosh. Add a clip that actually has frames.");
  if (!isIFrame(out[0])) {
    throw new Error("The timeline has to open on a real keyframe. Put a picture or a full clip first.");
  }
  return { frames: out, droppedKeys };
}

export function applyKeySurgery(frames: AviFrame[], settings: Settings): AviFrame[] {
  if (settings.keyMode === "off") return frames.map(cloneFrame);
  const [start, end] = range(frames.length, settings.keyStart, settings.keyEnd, false);
  const out: AviFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const removable = i > 0 && i >= start && i < end && !frame.protect && isIFrame(frame);
    if (!removable) {
      out.push(cloneFrame(frame));
      continue;
    }
    if (settings.keyMode === "delete") continue;
    let donor: AviFrame | undefined;
    for (let j = i + 1; j < frames.length; j++) {
      if (!isIFrame(frames[j])) {
        donor = frames[j];
        break;
      }
    }
    if (!donor && out.length) donor = out[out.length - 1];
    if (!donor) {
      out.push(cloneFrame(frame));
      continue;
    }
    out.push({
      id: frame.id,
      flags: 0,
      payload: donor.payload.slice(),
      protect: false,
    });
  }
  if (!out.length || !isIFrame(out[0])) {
    throw new Error("Key surgery removed the opening picture. Narrow the key range.");
  }
  return reflag(out);
}

function shuffleBlocks(frames: AviFrame[], block: number, seed: number): AviFrame[] {
  const size = Math.max(1, Math.round(block));
  const blocks: AviFrame[][] = [];
  for (let i = 0; i < frames.length; i += size) blocks.push(frames.slice(i, i + size));
  const rng = mulberry32(seed);
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = blocks[i];
    blocks[i] = blocks[j];
    blocks[j] = tmp;
  }
  return blocks.flat();
}

export function applyOrder(frames: AviFrame[], settings: Settings): AviFrame[] {
  if (settings.orderMode === "off" || frames.length < 3) return frames;
  const [start, end] = range(frames.length, settings.orderStart, settings.orderEnd, true);
  if (end - start < 2) return frames;
  const slice = frames.slice(start, end).map(cloneFrame);
  let next = slice;
  if (settings.orderMode === "reverse") next = slice.reverse();
  else if (settings.orderMode === "shuffle") next = shuffleBlocks(slice, settings.shuffleBlock, settings.seed);
  else if (settings.orderMode === "sort-large") {
    next = slice.slice().sort((a, b) => b.payload.length - a.payload.length);
  } else if (settings.orderMode === "sort-small") {
    next = slice.slice().sort((a, b) => a.payload.length - b.payload.length);
  }
  const out = frames.slice();
  out.splice(start, slice.length, ...next);
  return reflag(out);
}

function guard(count: number): void {
  if (count > MAX_FRAMES) {
    throw new Error(
      `This mosh would be ${count} frames, over the ${MAX_FRAMES}-frame limit. Lower repeats, frame rate, or clip length.`,
    );
  }
}

export function applyRepeats(frames: AviFrame[], settings: Settings): AviFrame[] {
  let out = frames;

  if (settings.bloomOn && settings.bloomExtra > 0 && out.length > 1) {
    const span = Math.max(1, Math.round(settings.bloomSpan));
    const extra = Math.max(0, Math.round(settings.bloomExtra));
    let at = Math.round(((out.length - 1) * settings.bloomAt) / 100);
    if (at === 0) at = 1;
    const take = out.slice(at, Math.min(out.length, at + span)).map(cloneFrame);
    const insert: AviFrame[] = [];
    for (let r = 0; r < extra; r++) insert.push(...take.map(cloneFrame));
    guard(out.length + insert.length);
    out = out.slice();
    out.splice(at + take.length, 0, ...insert);
  }

  if (settings.echoOn && settings.echoExtra > 0 && out.length > 1) {
    const [start, end] = range(out.length, settings.echoStart, settings.echoEnd, true);
    const slice = out.slice(start, end).map(cloneFrame);
    if (slice.length) {
      const extra = Math.max(0, Math.round(settings.echoExtra));
      const insert: AviFrame[] = [];
      for (let r = 0; r < extra; r++) insert.push(...slice.map(cloneFrame));
      guard(out.length + insert.length);
      out = out.slice();
      out.splice(end, 0, ...insert);
    }
  }

  if (settings.glideOn && settings.glideExtra > 0 && out.length > 1) {
    const [start, end] = range(out.length, settings.glideStart, settings.glideEnd, true);
    const extra = Math.max(0, Math.round(settings.glideExtra));
    const next: AviFrame[] = [];
    for (let i = 0; i < out.length; i++) {
      next.push(out[i]);
      if (i >= start && i < end) {
        for (let r = 0; r < extra; r++) next.push(cloneFrame(out[i]));
      }
    }
    guard(next.length);
    out = next;
  }

  if (settings.pulseOn && settings.pulseExtra > 0 && out.length > 1) {
    const every = Math.max(2, Math.round(settings.pulseEvery));
    const group = Math.max(1, Math.round(settings.pulseGroup));
    const extra = Math.max(0, Math.round(settings.pulseExtra));
    const next: AviFrame[] = [];
    let i = 0;
    while (i < out.length) {
      if (i > 0 && i % every === 0) {
        const chunk = out.slice(i, Math.min(out.length, i + group)).map(cloneFrame);
        next.push(...chunk);
        for (let r = 0; r < extra; r++) next.push(...chunk.map(cloneFrame));
        i += chunk.length;
      } else {
        next.push(out[i]);
        i += 1;
      }
    }
    guard(next.length);
    out = next;
  }

  return reflag(out);
}

function headerEnd(payload: Uint8Array): number {
  const end = payload.length - 5;
  for (let i = 0; i < end; i++) {
    if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1 && payload[i + 3] === 0xb6) {
      return Math.min(payload.length, i + 12);
    }
  }
  return Math.min(payload.length, 24);
}

function createsStartCode(buf: Uint8Array, index: number): boolean {
  for (let s = Math.max(0, index - 2); s <= index && s + 2 < buf.length; s++) {
    if (buf[s] === 0 && buf[s + 1] === 0 && buf[s + 2] === 1) return true;
  }
  return false;
}

function safeWindow(buf: Uint8Array, at: number, len: number): boolean {
  if (at < 1 || at + len > buf.length) return false;
  if (buf[at - 1] === 0xff) return false;
  for (let i = 0; i < len; i++) if (buf[at + i] === 0xff) return false;
  return true;
}

function findWindow(buf: Uint8Array, rng: () => number, len: number): number {
  const start = headerEnd(buf);
  if (buf.length - start < len + 2) return -1;
  for (let attempt = 0; attempt < 24; attempt++) {
    const at = start + Math.floor(rng() * Math.max(1, buf.length - start - len));
    if (safeWindow(buf, at, len)) return at;
  }
  for (let at = start; at + len <= buf.length; at++) if (safeWindow(buf, at, len)) return at;
  return -1;
}

function bendPayload(payload: Uint8Array, settings: Settings, rng: () => number): Uint8Array | null {
  const intensity = Math.max(1, Math.min(100, settings.bendIntensity));
  if (settings.bendMode === "xor") {
    const out = payload.slice();
    const start = headerEnd(out);
    const stride = Math.max(2, Math.round(40 - intensity * 0.32));
    const salt = 1 + Math.floor(rng() * 254);
    let hits = 0;
    for (let i = start; i < out.length; i += stride) {
      if (rng() > 0.65) continue;
      const prev = out[i];
      out[i] = prev ^ salt;
      if (createsStartCode(out, i)) out[i] = prev;
      else hits += 1;
    }
    return hits ? out : null;
  }

  const len = Math.max(6, Math.round(8 + intensity / 5));
  if (settings.bendMode === "shift") {
    const out = payload.slice();
    const start = headerEnd(out);
    const region = out.length - start;
    if (region < 8) return null;
    const shift = 1 + Math.floor(rng() * Math.max(1, Math.round(intensity / 8)));
    const copy = out.slice(start);
    for (let i = 0; i < copy.length; i++) out[start + i] = copy[(i + shift) % copy.length];
    return out;
  }

  const at = findWindow(payload, rng, len);
  if (at < 0) return null;
  if (settings.bendMode === "repeat") {
    const chunk = payload.slice(at, at + len);
    const out = new Uint8Array(payload.length + chunk.length);
    out.set(payload.subarray(0, at + len), 0);
    out.set(chunk, at + len);
    out.set(payload.subarray(at + len), at + len + chunk.length);
    return out;
  }
  const at2 = findWindow(payload, rng, len);
  if (at2 < 0 || Math.abs(at2 - at) < len) return null;
  const out = payload.slice();
  const a = out.slice(at, at + len);
  const b = out.slice(at2, at2 + len);
  out.set(b, at);
  out.set(a, at2);
  return out;
}

export function applyBend(frames: AviFrame[], settings: Settings): { frames: AviFrame[]; bent: number } {
  if (!settings.bendOn) return { frames, bent: 0 };
  const rng = mulberry32(settings.seed ^ 0x9e3779b9);
  let bent = 0;
  const next = frames.map((frame, index) => {
    if (index === 0 || frame.protect || isIFrame(frame)) return frame;
    if (rng() * 100 > settings.bendFrequency) return frame;
    const payload = bendPayload(frame.payload, settings, rng);
    if (!payload) return frame;
    bent += 1;
    return { ...frame, payload };
  });
  return { frames: next, bent };
}

export function moshFrames(clips: ClipInput[], settings: Settings): { frames: AviFrame[]; stats: MoshStats } {
  const warnings: string[] = [];
  const assembledResult = assemble(clips);
  const assembled = assembledResult.frames;
  const keysBefore = assembled.filter((frame) => isIFrame(frame)).length;
  let frames = applyKeySurgery(assembled, settings);
  const keysAfter = frames.filter((frame) => isIFrame(frame)).length;
  if (settings.keyMode !== "off" && keysBefore - keysAfter === 0 && assembledResult.droppedKeys === 0) {
    warnings.push("No intermediate keyframe was removed. Add another clip, or shorten the key interval.");
  }
  frames = applyOrder(frames, settings);
  const beforeRepeat = frames.length;
  frames = applyRepeats(frames, settings);
  const repeated = frames.length - beforeRepeat;
  const bentResult = applyBend(frames, settings);
  frames = reflag(bentResult.frames);
  if (frames[0]) frames[0].flags = AVIIF_KEYFRAME;
  return {
    frames,
    stats: {
      inputFrames: assembled.length,
      outputFrames: frames.length,
      keysBefore,
      keysAfter,
      donatedKeys: assembledResult.droppedKeys,
      repeated,
      bent: bentResult.bent,
      warnings,
    },
  };
}

export function fakeClipFrames(count: number, gop: number, seedSize: number): AviFrame[] {
  const frames: AviFrame[] = [];
  const gap = Math.max(1, gop);
  for (let i = 0; i < count; i++) {
    const iFrame = i % gap === 0;
    const payload = new Uint8Array(iFrame ? 48 : 32 + (i % 7) * 4);
    payload[0] = 0;
    payload[1] = 0;
    payload[2] = 1;
    payload[3] = 0xb6;
    payload[4] = iFrame ? 0x00 : 0x40;
    payload[8] = seedSize & 0xff;
    frames.push({ id: "00dc", flags: iFrame ? AVIIF_KEYFRAME : 0, payload, protect: false });
  }
  return frames;
}

export function estimateMosh(clips: Clip[], settings: Settings): MoshStats {
  const inputs: ClipInput[] = clips.map((clip) => ({
    frames: fakeClipFrames(encodeCount(clip, settings.fps), settings.gop, clip.seedTail),
    role: clip.role,
    protectKey: clip.protectKey,
    seedTail: clip.seedTail,
  }));
  if (!inputs.length) {
    return { inputFrames: 0, outputFrames: 0, keysBefore: 0, keysAfter: 0, donatedKeys: 0, repeated: 0, bent: 0, warnings: [] };
  }
  const result = moshFrames(inputs, settings);
  result.stats.repeated = Math.max(0, result.stats.outputFrames - result.stats.inputFrames);
  return result.stats;
}
