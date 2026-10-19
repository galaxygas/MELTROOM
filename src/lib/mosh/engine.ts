import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import { parseAvi, rebuildAvi } from "./avi";
import { bakeFilter, imageEncodeArgs, videoEncodeArgs, type Size } from "./filters";
import { glitchJpeg } from "./jpeg";
import { moshFrames, type MoshStats } from "./ops";
import { encodeCount, frameSize, type Clip, type Settings } from "./types";

export type Progress = { phase: string; ratio: number };

let ffmpeg: FFmpeg | null = null;
let logSink: (line: string) => void = () => {};
let progressSink: (ratio: number) => void = () => {};
let cancelRequested = false;
let frameGoal = 0;

export function cancelMosh(): void {
  cancelRequested = true;
  try {
    ffmpeg?.terminate();
  } catch {
    /* already dead */
  }
  ffmpeg = null;
}

async function engine(): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  const instance = new FFmpeg();
  instance.on("log", ({ message }) => {
    if (!message) return;
    logSink(message);
    if (frameGoal > 0) {
      const match = message.match(/frame=\s*(\d+)/);
      if (match) progressSink(Math.min(0.98, Number(match[1]) / frameGoal));
    }
  });
  instance.on("progress", ({ progress }) => {
    if (Number.isFinite(progress)) progressSink(Math.max(0, Math.min(1, progress)));
  });
  ffmpeg = instance;
  const base = `${import.meta.env.BASE_URL}ffmpeg`;
  const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm");
  await instance.load({ coreURL, wasmURL });
  return instance;
}

function asBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === "string") throw new Error("The codec engine returned text instead of a file.");
  return data.slice();
}

async function writeInput(ff: FFmpeg, name: string, data: Uint8Array): Promise<void> {
  await ff.writeFile(name, data);
}

async function exec(ff: FFmpeg, args: string[], label: string): Promise<void> {
  const code = await ff.exec(args);
  if (code !== 0) {
    throw new Error(`${label} failed (codec exit ${code}). Open the codec log for the line that stopped it.`);
  }
}

async function jpegBytes(file: File, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw that still.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("JPEG encode failed."))), "image/jpeg", quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function fileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function runMosh(opts: {
  clips: Clip[];
  settings: Settings;
  onProgress: (progress: Progress) => void;
  onLog: (line: string) => void;
}): Promise<{ mp4: Blob; stats: MoshStats }> {
  if (!opts.clips.length) throw new Error("Add a video or a still first.");
  cancelRequested = false;
  logSink = opts.onLog;
  const ff = await engine();
  const trash: string[] = [];
  const cleanup = async () => {
    for (const name of trash) {
      try {
        await ff.deleteFile(name);
      } catch {
        /* already gone */
      }
    }
  };

  try {
    opts.onProgress({ phase: "Loading the MPEG-4 engine", ratio: 1 });
    const source = opts.clips[0];
    const size: Size = frameSize(opts.settings.width, opts.settings.aspect, source.width, source.height);
    const encoded: { name: string; bytes: Uint8Array; clip: Clip }[] = [];

    for (let i = 0; i < opts.clips.length; i++) {
      const clip = opts.clips[i];
      const frames = encodeCount(clip, opts.settings.fps);
      const inputName = `in${i}.${clip.kind === "image" ? "jpg" : "bin"}`;
      const outputName = `c${i}.avi`;
      trash.push(inputName, outputName);
      opts.onProgress({ phase: `Encoding ${i + 1} of ${opts.clips.length}`, ratio: 0 });
      progressSink = (ratio) => opts.onProgress({ phase: `Encoding ${i + 1} of ${opts.clips.length}`, ratio });

      let bytes: Uint8Array;
      if (clip.kind === "image") {
        const quality = clip.jpegDent > 0 ? 0.86 : 0.92;
        bytes = await jpegBytes(clip.file, quality);
        if (clip.jpegDent > 0) {
          bytes = glitchJpeg(bytes, {
            seed: opts.settings.seed + i * 17,
            passes: Math.max(1, Math.round(clip.jpegDent / 8)),
            mode: clip.jpegDent > 66 ? "repeat" : clip.jpegDent > 33 ? "shift" : "swap",
            intensity: clip.jpegDent,
          });
        }
      } else {
        bytes = await fileBytes(clip.file);
      }
      await writeInput(ff, inputName, bytes);
      const args =
        clip.kind === "image"
          ? imageEncodeArgs(inputName, outputName, clip, opts.settings, size, frames)
          : videoEncodeArgs(inputName, outputName, clip, opts.settings, size, frames);
      frameGoal = frames;
      await exec(ff, args, `Encode “${clip.name}”`);
      encoded.push({ name: outputName, bytes: asBytes(await ff.readFile(outputName)), clip });
    }

    opts.onProgress({ phase: "Cutting I-frames and P-frames", ratio: 0.4 });
    const parsed = encoded.map((item) => ({ ...parseAvi(item.bytes), clip: item.clip, bytes: item.bytes }));
    for (const item of parsed) {
      if (!item.frames.length) throw new Error(`“${item.clip.name}” encoded to zero frames.`);
    }
    const moshed = moshFrames(
      parsed.map((item) => ({
        frames: item.frames,
        role: item.clip.role,
        protectKey: item.clip.protectKey,
        seedTail: item.clip.seedTail,
      })),
      opts.settings,
    );
    const avi = rebuildAvi(parsed[0].bytes, moshed.frames);
    const round = parseAvi(avi);
    if (round.frames.length !== moshed.frames.length) {
      throw new Error("The rebuilt AVI did not round-trip. This mosh was not written.");
    }
    trash.push("mosh.avi", "out.mp4", "aud.m4a");
    await writeInput(ff, "mosh.avi", avi);

    let audio: string | null = null;
    if (opts.settings.keepAudio) {
      const audible = opts.clips.find((clip) => clip.kind === "video");
      if (audible) {
        const index = opts.clips.indexOf(audible);
        opts.onProgress({ phase: "Lifting audio", ratio: 0.2 });
        progressSink = (ratio) => opts.onProgress({ phase: "Lifting audio", ratio });
        const code = await ff.exec([
          "-ss",
          Math.max(0, audible.inPoint).toFixed(3),
          "-i",
          `in${index}.bin`,
          "-vn",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "aud.m4a",
        ]);
        if (code === 0) audio = "aud.m4a";
        else moshed.stats.warnings.push("No audio stream on the first video, so the bake is silent.");
      }
    }

    opts.onProgress({ phase: "Baking a playable MP4", ratio: 0 });
    progressSink = (ratio) => opts.onProgress({ phase: "Baking a playable MP4", ratio });
    const seconds = (moshed.frames.length / opts.settings.fps).toFixed(3);
    const filter = bakeFilter(opts.settings);
    const bake = ["-i", "mosh.avi"];
    if (audio) bake.push("-i", audio);
    if (filter) bake.push("-vf", filter);
    bake.push(
      "-t",
      seconds,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      String(opts.settings.crf),
      "-movflags",
      "+faststart",
    );
    if (audio) bake.push("-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac");
    else bake.push("-an");
    bake.push("out.mp4");
    frameGoal = moshed.frames.length;
    await exec(ff, bake, "Bake");
    const mp4 = asBytes(await ff.readFile("out.mp4"));
    const copy = new Uint8Array(new ArrayBuffer(mp4.byteLength));
    copy.set(mp4);
    opts.onProgress({ phase: "Done", ratio: 1 });
    return { mp4: new Blob([copy.buffer], { type: "video/mp4" }), stats: moshed.stats };
  } catch (error) {
    try {
      ffmpeg?.terminate();
    } catch {
      /* ignore */
    }
    ffmpeg = null;
    if (cancelRequested) throw new Error("Mosh cancelled.");
    throw error;
  } finally {
    if (ffmpeg?.loaded) await cleanup();
  }
}
