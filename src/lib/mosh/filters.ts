import { clamp, type Clip, type Fit, type ImageMotion, type Settings } from "./types";

export type Size = { w: number; h: number };

function fitFilter(size: Size, fit: Fit, scale = 1): string {
  const w = size.w * scale;
  const h = size.h * scale;
  if (fit === "contain") {
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x100E0C`;
  }
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
}

function zoomExpr(motion: ImageMotion, amount: number, frames: number): string {
  const a = clamp(amount, 0, 100) / 100;
  const n = Math.max(1, frames - 1);
  const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  if (motion === "push") {
    const gain = (0.08 + 0.55 * a).toFixed(3);
    return `z='1+${gain}*on/${n}':${center}`;
  }
  if (motion === "pull") {
    const from = (1.12 + 0.7 * a).toFixed(3);
    const drop = (0.12 + 0.7 * a).toFixed(3);
    return `z='${from}-${drop}*on/${n}':${center}`;
  }
  if (motion === "pulse") {
    const amp = (0.06 + 0.34 * a).toFixed(3);
    return `z='1+${amp}*abs(sin(on*PI/5))':${center}`;
  }
  const z = (1.18 + 0.55 * a).toFixed(3);
  if (motion === "pan-left") return `z='${z}':x='(iw-iw/zoom)*(1-on/${n})':y='(ih-ih/zoom)/2'`;
  if (motion === "pan-right") return `z='${z}':x='(iw-iw/zoom)*(on/${n})':y='(ih-ih/zoom)/2'`;
  if (motion === "pan-up") return `z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*(1-on/${n})'`;
  if (motion === "pan-down") return `z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*(on/${n})'`;
  const driftZ = (1.16 + 0.4 * a).toFixed(3);
  return `z='${driftZ}':x='(iw-iw/zoom)*(0.5+0.5*sin(on/${n}*PI))':y='(ih-ih/zoom)*(on/${n})'`;
}

export function imageFilter(clip: Pick<Clip, "motion" | "motionAmount">, size: Size, fit: Fit, frames: number, fps: number): string {
  if (clip.motion === "hold" || frames <= 1) {
    return `${fitFilter(size, fit)},fps=${fps},setsar=1,format=yuv420p`;
  }
  if (clip.motion === "orbit") {
    const a = clamp(clip.motionAmount, 0, 100) / 100;
    const speed = (0.25 + 1.4 * a).toFixed(3);
    return `${fitFilter(size, fit, 2)},rotate=${speed}*t:c=0x100E0C:ow=iw:oh=ih,scale=${size.w}:${size.h},fps=${fps},setsar=1,format=yuv420p`;
  }
  const z = zoomExpr(clip.motion, clip.motionAmount, frames);
  return `${fitFilter(size, fit, 2)},zoompan=${z}:d=${frames}:s=${size.w}x${size.h}:fps=${fps},setsar=1,format=yuv420p`;
}

export function videoFilter(size: Size, fit: Fit, fps: number): string {
  return `${fitFilter(size, fit)},fps=${fps},setsar=1,format=yuv420p`;
}

function codecArgs(settings: Settings, frames: number): string[] {
  const args = [
    "-frames:v",
    String(frames),
    "-r",
    String(settings.fps),
    "-c:v",
    "mpeg4",
    "-vtag",
    "XVID",
    "-q:v",
    String(settings.quantizer),
    "-bf",
    "0",
    "-g",
    String(settings.gop),
    "-an",
  ];
  if (settings.precision === "fine") args.push("-mbd", "2", "-flags", "+mv4+aic", "-trellis", "1");
  return args;
}

export function imageEncodeArgs(
  input: string,
  output: string,
  clip: Pick<Clip, "motion" | "motionAmount">,
  settings: Settings,
  size: Size,
  frames: number,
): string[] {
  const filter = imageFilter(clip, size, settings.fit, frames, settings.fps);
  const head =
    clip.motion === "orbit" || clip.motion === "hold" || frames <= 1
      ? ["-loop", "1", "-t", (frames / settings.fps).toFixed(3), "-i", input]
      : ["-i", input];
  return [...head, "-vf", filter, ...codecArgs(settings, frames), output];
}

export function videoEncodeArgs(
  input: string,
  output: string,
  clip: Pick<Clip, "inPoint" | "length">,
  settings: Settings,
  size: Size,
  frames: number,
): string[] {
  return [
    "-ss",
    Math.max(0, clip.inPoint).toFixed(3),
    "-t",
    Math.max(0.08, clip.length).toFixed(3),
    "-i",
    input,
    "-vf",
    videoFilter(size, settings.fit, settings.fps),
    ...codecArgs(settings, frames),
    output,
  ];
}

export function bakeFilter(settings: Settings): string | null {
  const parts: string[] = [];
  if (settings.shiftOn && settings.shiftPixels > 0) {
    const p = Math.round(settings.shiftPixels);
    const v = Math.max(1, Math.round(p / 2));
    parts.push(`rgbashift=rh=${p}:bh=${-p}:gv=${v}:rv=${-v}`);
  }
  if (settings.chromaOn && settings.chromaPixels > 0) {
    const p = Math.round(settings.chromaPixels);
    const v = Math.max(1, Math.round(p / 2));
    parts.push(`chromashift=cbh=${p}:crh=${-p}:cbv=${v}:crv=${-v}`);
  }
  if (settings.noiseOn && settings.noiseAmount > 0) {
    parts.push(`noise=alls=${Math.round(settings.noiseAmount)}:allf=t+u`);
  }
  if (settings.trailOn) {
    parts.push(`lagfun=decay=${(clamp(settings.trailDecay, 70, 99) / 100).toFixed(2)}`);
  }
  if (settings.amplifyOn && settings.amplifyFactor > 1) {
    parts.push(`amplify=radius=2:factor=${Math.round(settings.amplifyFactor)}:threshold=10`);
  }
  if (!parts.length) return null;
  parts.push("format=yuv420p");
  return parts.join(",");
}
