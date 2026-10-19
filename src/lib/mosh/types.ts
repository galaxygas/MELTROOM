export type Role = "full" | "seed" | "motion";

export type ImageMotion =
  | "hold"
  | "push"
  | "pull"
  | "pan-left"
  | "pan-right"
  | "pan-up"
  | "pan-down"
  | "orbit"
  | "drift"
  | "pulse";

export type Aspect = "source" | "16:9" | "4:3" | "1:1" | "9:16";
export type Fit = "cover" | "contain";
export type KeyMode = "off" | "delete" | "replace";
export type OrderMode = "off" | "reverse" | "shuffle" | "sort-large" | "sort-small";
export type BendMode = "xor" | "repeat" | "shift" | "swap";
export type JpegMode = "repeat" | "delete" | "swap" | "shift";

export type Clip = {
  id: string;
  file: File;
  name: string;
  kind: "video" | "image";
  url: string;
  sourceDuration: number;
  width: number;
  height: number;
  role: Role;
  protectKey: boolean;
  seedTail: number;
  inPoint: number;
  length: number;
  motion: ImageMotion;
  motionAmount: number;
  jpegDent: number;
};

export type Settings = {
  width: number;
  aspect: Aspect;
  fit: Fit;
  fps: number;
  quantizer: number;
  gop: number;
  precision: "fast" | "fine";
  keyMode: KeyMode;
  keyStart: number;
  keyEnd: number;
  orderMode: OrderMode;
  orderStart: number;
  orderEnd: number;
  shuffleBlock: number;
  seed: number;
  bloomOn: boolean;
  bloomAt: number;
  bloomSpan: number;
  bloomExtra: number;
  glideOn: boolean;
  glideStart: number;
  glideEnd: number;
  glideExtra: number;
  pulseOn: boolean;
  pulseEvery: number;
  pulseGroup: number;
  pulseExtra: number;
  echoOn: boolean;
  echoStart: number;
  echoEnd: number;
  echoExtra: number;
  bendOn: boolean;
  bendMode: BendMode;
  bendIntensity: number;
  bendFrequency: number;
  shiftOn: boolean;
  shiftPixels: number;
  chromaOn: boolean;
  chromaPixels: number;
  noiseOn: boolean;
  noiseAmount: number;
  trailOn: boolean;
  trailDecay: number;
  amplifyOn: boolean;
  amplifyFactor: number;
  keepAudio: boolean;
  crf: number;
};

export const MAX_FRAMES = 720;

export const DEFAULT_SETTINGS: Settings = {
  width: 480,
  aspect: "16:9",
  fit: "cover",
  fps: 12,
  quantizer: 4,
  gop: 600,
  precision: "fast",
  keyMode: "delete",
  keyStart: 0,
  keyEnd: 100,
  orderMode: "off",
  orderStart: 0,
  orderEnd: 100,
  shuffleBlock: 4,
  seed: 1,
  bloomOn: false,
  bloomAt: 30,
  bloomSpan: 1,
  bloomExtra: 12,
  glideOn: false,
  glideStart: 10,
  glideEnd: 90,
  glideExtra: 2,
  pulseOn: false,
  pulseEvery: 8,
  pulseGroup: 2,
  pulseExtra: 3,
  echoOn: false,
  echoStart: 20,
  echoEnd: 60,
  echoExtra: 1,
  bendOn: false,
  bendMode: "xor",
  bendIntensity: 24,
  bendFrequency: 40,
  shiftOn: false,
  shiftPixels: 8,
  chromaOn: false,
  chromaPixels: 10,
  noiseOn: false,
  noiseAmount: 12,
  trailOn: false,
  trailDecay: 94,
  amplifyOn: false,
  amplifyFactor: 3,
  keepAudio: false,
  crf: 18,
};

export type Preset = {
  id: string;
  name: string;
  blurb: string;
  apply: (base: Settings) => Settings;
};

function withEffects(base: Settings, patch: Partial<Settings>): Settings {
  return { ...base, ...patch };
}

export const PRESETS: Preset[] = [
  {
    id: "transfer",
    name: "Transfer",
    blurb: "Later clips donate motion onto the opening picture.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "delete",
        gop: 600,
        orderMode: "off",
        bloomOn: false,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
      }),
  },
  {
    id: "cut-melt",
    name: "Cut melt",
    blurb: "One key per clip. Every later key is deleted so shots pour together.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "delete",
        gop: 600,
        orderMode: "off",
        bloomOn: false,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
      }),
  },
  {
    id: "open-gop",
    name: "Open GOP",
    blurb: "Plant a key every 8 frames, then delete them. Works on a single shot.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "delete",
        gop: 8,
        orderMode: "off",
        bloomOn: false,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
      }),
  },
  {
    id: "replace",
    name: "Replace",
    blurb: "Swap each intermediate key for the next delta, so that motion hits twice.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "replace",
        gop: 12,
        orderMode: "off",
        bloomOn: false,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
      }),
  },
  {
    id: "bloom",
    name: "Bloom",
    blurb: "Repeat one delta so its motion vectors pile up and smear.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "off",
        bloomOn: true,
        bloomAt: 25,
        bloomSpan: 1,
        bloomExtra: 16,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
        orderMode: "off",
      }),
  },
  {
    id: "glide",
    name: "Glide",
    blurb: "Duplicate every delta in a range. Motion keeps stepping.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "delete",
        gop: 600,
        glideOn: true,
        glideStart: 15,
        glideEnd: 85,
        glideExtra: 2,
        bloomOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
      }),
  },
  {
    id: "reverse",
    name: "Reverse",
    blurb: "Play delta frames backward onto the picture they were never meant for.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "delete",
        gop: 48,
        orderMode: "reverse",
        orderStart: 8,
        orderEnd: 100,
        bloomOn: false,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
        bendOn: false,
      }),
  },
  {
    id: "tape",
    name: "Broken tape",
    blurb: "Delete keys, then XOR the delta bitstream. Real databend, not a filter.",
    apply: (base) =>
      withEffects(base, {
        keyMode: "delete",
        gop: 24,
        bendOn: true,
        bendMode: "xor",
        bendIntensity: 22,
        bendFrequency: 50,
        orderMode: "off",
        bloomOn: false,
        glideOn: false,
        pulseOn: false,
        echoOn: false,
      }),
  },
];

export function sanitizeSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const merged = { ...DEFAULT_SETTINGS, ...(raw as Partial<Settings>) };
  merged.width = [256, 384, 480, 640].includes(merged.width) ? merged.width : 480;
  merged.fps = [8, 12, 15, 24].includes(merged.fps) ? merged.fps : 12;
  merged.quantizer = clamp(Math.round(merged.quantizer), 2, 12);
  merged.gop = clamp(Math.round(merged.gop), 4, 600);
  merged.crf = clamp(Math.round(merged.crf), 14, 28);
  merged.seed = clamp(Math.round(merged.seed), 0, 999999);
  return merged;
}

export function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function frameSize(
  width: number,
  aspect: Aspect,
  sourceW: number,
  sourceH: number,
): { w: number; h: number } {
  const w = width % 2 === 0 ? width : width + 1;
  let ratio = 16 / 9;
  if (aspect === "source" && sourceW > 0 && sourceH > 0) ratio = sourceW / sourceH;
  else if (aspect === "4:3") ratio = 4 / 3;
  else if (aspect === "1:1") ratio = 1;
  else if (aspect === "9:16") ratio = 9 / 16;
  let h = Math.round(w / ratio);
  if (h % 2) h += 1;
  return { w, h: Math.max(2, h) };
}

export function encodeCount(clip: Pick<Clip, "role" | "length" | "seedTail">, fps: number): number {
  if (clip.role === "seed") return Math.max(1, 1 + clamp(Math.round(clip.seedTail), 0, 48));
  const seconds = Math.max(0.08, clip.length);
  return Math.max(1, Math.round(seconds * fps));
}
