import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isIFrame, parseAvi, rebuildAvi } from "../src/lib/mosh/avi";
import { imageEncodeArgs, videoEncodeArgs } from "../src/lib/mosh/filters";
import { glitchJpeg } from "../src/lib/mosh/jpeg";
import { moshFrames } from "../src/lib/mosh/ops";
import { DEFAULT_SETTINGS, encodeCount, frameSize, type Clip, type Settings } from "../src/lib/mosh/types";

const root = mkdtempSync(join(tmpdir(), "meltroom-"));
const fail = (message: string): never => {
  throw new Error(message);
};

function run(args: string[]) {
  const result = spawnSync("ffmpeg", ["-y", ...args], { encoding: "utf8" });
  if (result.status !== 0) fail(`ffmpeg failed\n${args.join(" ")}\n${result.stderr.slice(-2000)}`);
}

function diff(a: string, b: string): number {
  const py = `
from PIL import Image
a=Image.open(${JSON.stringify(a)}).convert("RGB")
b=Image.open(${JSON.stringify(b)}).convert("RGB").resize(a.size)
ba, bb = a.tobytes(), b.tobytes()
print(sum(x!=y for x,y in zip(ba,bb)))
`;
  const result = spawnSync("python3", ["-c", py], { encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr);
  return Number(result.stdout.trim());
}

const settings: Settings = {
  ...DEFAULT_SETTINGS,
  width: 256,
  fps: 12,
  quantizer: 3,
  gop: 600,
  keyMode: "delete",
  precision: "fast",
  bloomOn: false,
  bendOn: false,
};
const size = frameSize(256, "16:9", 640, 360);
const seedClip = {
  motion: "push",
  motionAmount: 40,
  inPoint: 0,
  length: 1,
  role: "seed",
  seedTail: 0,
} as Pick<Clip, "motion" | "motionAmount" | "inPoint" | "length" | "role" | "seedTail">;

const seedFrames = encodeCount(seedClip, settings.fps);
run(imageEncodeArgs("/workspace/public/demo/seed.png", join(root, "seed.avi"), seedClip, settings, size, seedFrames));
run(
  videoEncodeArgs(
    "/workspace/public/demo/rake.mp4",
    join(root, "rake.avi"),
    { inPoint: 0, length: 1.2 },
    settings,
    size,
    Math.round(1.2 * settings.fps),
  ),
);
run(
  videoEncodeArgs(
    "/workspace/public/demo/blocks.mp4",
    join(root, "blocks.avi"),
    { inPoint: 0, length: 1.2 },
    settings,
    size,
    Math.round(1.2 * settings.fps),
  ),
);

const seedAvi = parseAvi(readFileSync(join(root, "seed.avi")));
const rakeAvi = parseAvi(readFileSync(join(root, "rake.avi")));
const blocksAvi = parseAvi(readFileSync(join(root, "blocks.avi")));
if (seedAvi.frames.length < 1) fail("seed encode empty");
if (!isIFrame(seedAvi.frames[0]) || !isIFrame(rakeAvi.frames[0])) fail("opening frame is not an I-frame");
if (rakeAvi.frames.filter((frame) => !isIFrame(frame)).length < 4) fail("rake has too few P-frames");

const moshed = moshFrames(
  [
    { frames: seedAvi.frames, role: "seed", protectKey: false, seedTail: 0 },
    { frames: rakeAvi.frames, role: "motion", protectKey: false, seedTail: 0 },
    { frames: blocksAvi.frames, role: "motion", protectKey: false, seedTail: 0 },
  ],
  settings,
);
if (moshed.frames.filter((frame) => isIFrame(frame)).length !== 1) fail("transfer should keep a single I-frame");
if (moshed.stats.outputFrames <= seedAvi.frames.length + 4) fail("motion frames were not appended");

const cut = moshFrames(
  [
    { frames: rakeAvi.frames, role: "full", protectKey: false, seedTail: 0 },
    { frames: blocksAvi.frames, role: "full", protectKey: false, seedTail: 0 },
  ],
  settings,
);
if (cut.stats.keysBefore < 2) fail(`cut melt expected multiple keys, got ${cut.stats.keysBefore}`);
if (cut.stats.keysAfter !== 1) fail(`cut melt keys left ${cut.stats.keysAfter}`);
const rebuilt = rebuildAvi(readFileSync(join(root, "seed.avi")), moshed.frames);
const round = parseAvi(rebuilt);
if (round.frames.length !== moshed.frames.length) fail("round trip length");
if ((round.frames[0].flags & 0x10) === 0) fail("first frame lost key flag");
writeFileSync(join(root, "mosh.avi"), rebuilt);
run(["-i", join(root, "mosh.avi"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", join(root, "mosh.mp4")]);
run(["-i", join(root, "seed.avi"), "-frames:v", "1", join(root, "seed.png")]);
run(["-ss", "0.15", "-i", join(root, "rake.avi"), "-frames:v", "1", join(root, "rake.png")]);
run(["-ss", "0.7", "-i", join(root, "mosh.mp4"), "-frames:v", "1", join(root, "melt.png")]);
run(["-ss", "1.5", "-i", join(root, "mosh.mp4"), "-frames:v", "1", join(root, "melt2.png")]);
const dSeed = diff(join(root, "melt.png"), join(root, "seed.png"));
const dRake = diff(join(root, "melt.png"), join(root, "rake.png"));
const dLate = diff(join(root, "melt2.png"), join(root, "seed.png"));
if (dSeed < 500) fail(`melt is too close to the seed (${dSeed})`);
if (dRake < 500) fail(`melt is too close to the motion source (${dRake})`);
if (dLate < 500) fail(`later melt is too close to the seed (${dLate})`);

const bloomSettings: Settings = { ...settings, keyMode: "off", bloomOn: true, bloomAt: 20, bloomSpan: 1, bloomExtra: 10 };
const bloom = moshFrames(
  [{ frames: rakeAvi.frames, role: "full", protectKey: false, seedTail: 0 }],
  bloomSettings,
);
if (bloom.stats.outputFrames <= rakeAvi.frames.length) fail("bloom did not add frames");
const bloomAvi = rebuildAvi(readFileSync(join(root, "rake.avi")), bloom.frames);
writeFileSync(join(root, "bloom.avi"), bloomAvi);
run(["-i", join(root, "bloom.avi"), "-frames:v", "1", join(root, "b0.png")]);
run(["-ss", "0.9", "-i", join(root, "bloom.avi"), "-frames:v", "1", join(root, "b1.png")]);
run(["-ss", "0.9", "-i", join(root, "rake.avi"), "-frames:v", "1", join(root, "r1.png")]);
const bloomDiff = diff(join(root, "b1.png"), join(root, "r1.png"));
if (bloomDiff < 100) fail(`bloom frame did not diverge (${bloomDiff})`);

const original = readFileSync("/workspace/public/demo/seed.png");
const jpeg = spawnSync("ffmpeg", ["-y", "-i", "/workspace/public/demo/seed.png", "-q:v", "4", join(root, "plain.jpg")], { encoding: "utf8" });
if (jpeg.status !== 0) fail(jpeg.stderr.slice(-500));
const plain = readFileSync(join(root, "plain.jpg"));
const dented = glitchJpeg(plain, { seed: 3, passes: 4, mode: "repeat", intensity: 40 });
writeFileSync(join(root, "dent.jpg"), dented);
const dec = spawnSync("ffmpeg", ["-y", "-i", join(root, "dent.jpg"), join(root, "dent.png")], { encoding: "utf8" });
if (dec.status !== 0) fail(`dented jpeg did not decode\n${dec.stderr.slice(-800)}`);
const jpegDiff = diff(join(root, "dent.png"), join(root, "plain.jpg"));
if (jpegDiff < 50) fail(`jpeg dent too subtle (${jpegDiff})`);
if (original.length < 10) fail("seed missing");

console.log(
  JSON.stringify({
    ok: true,
    keysBefore: moshed.stats.keysBefore,
    keysAfter: moshed.stats.keysAfter,
    out: moshed.stats.outputFrames,
    dSeed,
    dRake,
    dLate,
    bloomDiff,
    jpegDiff,
    dir: root,
  }),
);
rmSync(root, { recursive: true, force: true });
