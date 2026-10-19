import { a as encodeCount, c as rebuildAvi, i as clamp, n as moshFrames, o as frameSize, r as glitchJpeg, s as parseAvi } from "./routes-CCMDqJYu.mjs";
import { t as FFmpeg } from "../_libs/ffmpeg__ffmpeg.mjs";
import { t as toBlobURL } from "../_libs/ffmpeg__util.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/engine-9Ndypz77.js
function fitFilter(size, fit, scale = 1) {
	const w = size.w * scale;
	const h = size.h * scale;
	if (fit === "contain") return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x100E0C`;
	return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
}
function zoomExpr(motion, amount, frames) {
	const a = clamp(amount, 0, 100) / 100;
	const n = Math.max(1, frames - 1);
	const center = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
	if (motion === "push") return `z='1+${(.08 + .55 * a).toFixed(3)}*on/${n}':${center}`;
	if (motion === "pull") return `z='${(1.12 + .7 * a).toFixed(3)}-${(.12 + .7 * a).toFixed(3)}*on/${n}':${center}`;
	if (motion === "pulse") return `z='1+${(.06 + .34 * a).toFixed(3)}*abs(sin(on*PI/5))':${center}`;
	const z = (1.18 + .55 * a).toFixed(3);
	if (motion === "pan-left") return `z='${z}':x='(iw-iw/zoom)*(1-on/${n})':y='(ih-ih/zoom)/2'`;
	if (motion === "pan-right") return `z='${z}':x='(iw-iw/zoom)*(on/${n})':y='(ih-ih/zoom)/2'`;
	if (motion === "pan-up") return `z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*(1-on/${n})'`;
	if (motion === "pan-down") return `z='${z}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*(on/${n})'`;
	return `z='${(1.16 + .4 * a).toFixed(3)}':x='(iw-iw/zoom)*(0.5+0.5*sin(on/${n}*PI))':y='(ih-ih/zoom)*(on/${n})'`;
}
function imageFilter(clip, size, fit, frames, fps) {
	if (clip.motion === "hold" || frames <= 1) return `${fitFilter(size, fit)},fps=${fps},setsar=1,format=yuv420p`;
	if (clip.motion === "orbit") {
		const speed = (.25 + 1.4 * (clamp(clip.motionAmount, 0, 100) / 100)).toFixed(3);
		return `${fitFilter(size, fit, 2)},rotate=${speed}*t:c=0x100E0C:ow=iw:oh=ih,scale=${size.w}:${size.h},fps=${fps},setsar=1,format=yuv420p`;
	}
	const z = zoomExpr(clip.motion, clip.motionAmount, frames);
	return `${fitFilter(size, fit, 2)},zoompan=${z}:d=${frames}:s=${size.w}x${size.h}:fps=${fps},setsar=1,format=yuv420p`;
}
function videoFilter(size, fit, fps) {
	return `${fitFilter(size, fit)},fps=${fps},setsar=1,format=yuv420p`;
}
function codecArgs(settings, frames) {
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
		"-an"
	];
	if (settings.precision === "fine") args.push("-mbd", "2", "-flags", "+mv4+aic", "-trellis", "1");
	return args;
}
function imageEncodeArgs(input, output, clip, settings, size, frames) {
	const filter = imageFilter(clip, size, settings.fit, frames, settings.fps);
	return [
		...clip.motion === "orbit" || clip.motion === "hold" || frames <= 1 ? [
			"-loop",
			"1",
			"-t",
			(frames / settings.fps).toFixed(3),
			"-i",
			input
		] : ["-i", input],
		"-vf",
		filter,
		...codecArgs(settings, frames),
		output
	];
}
function videoEncodeArgs(input, output, clip, settings, size, frames) {
	return [
		"-ss",
		Math.max(0, clip.inPoint).toFixed(3),
		"-t",
		Math.max(.08, clip.length).toFixed(3),
		"-i",
		input,
		"-vf",
		videoFilter(size, settings.fit, settings.fps),
		...codecArgs(settings, frames),
		output
	];
}
function bakeFilter(settings) {
	const parts = [];
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
	if (settings.noiseOn && settings.noiseAmount > 0) parts.push(`noise=alls=${Math.round(settings.noiseAmount)}:allf=t+u`);
	if (settings.trailOn) parts.push(`lagfun=decay=${(clamp(settings.trailDecay, 70, 99) / 100).toFixed(2)}`);
	if (settings.amplifyOn && settings.amplifyFactor > 1) parts.push(`amplify=radius=2:factor=${Math.round(settings.amplifyFactor)}:threshold=10`);
	if (!parts.length) return null;
	parts.push("format=yuv420p");
	return parts.join(",");
}
var ffmpeg = null;
var logSink = () => {};
var progressSink = () => {};
var cancelRequested = false;
var frameGoal = 0;
function cancelMosh() {
	cancelRequested = true;
	try {
		ffmpeg?.terminate();
	} catch {}
	ffmpeg = null;
}
async function engine() {
	if (ffmpeg?.loaded) return ffmpeg;
	const instance = new FFmpeg();
	instance.on("log", ({ message }) => {
		if (!message) return;
		logSink(message);
		if (frameGoal > 0) {
			const match = message.match(/frame=\s*(\d+)/);
			if (match) progressSink(Math.min(.98, Number(match[1]) / frameGoal));
		}
	});
	instance.on("progress", ({ progress }) => {
		if (Number.isFinite(progress)) progressSink(Math.max(0, Math.min(1, progress)));
	});
	ffmpeg = instance;
	const base = `/ffmpeg`;
	const coreURL = await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript");
	const wasmURL = await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm");
	await instance.load({
		coreURL,
		wasmURL
	});
	return instance;
}
function asBytes(data) {
	if (typeof data === "string") throw new Error("The codec engine returned text instead of a file.");
	return data.slice();
}
async function writeInput(ff, name, data) {
	await ff.writeFile(name, data);
}
async function exec(ff, args, label) {
	const code = await ff.exec(args);
	if (code !== 0) throw new Error(`${label} failed (codec exit ${code}). Open the codec log for the line that stopped it.`);
}
async function jpegBytes(file, quality) {
	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement("canvas");
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not draw that still.");
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const blob = await new Promise((resolve, reject) => {
		canvas.toBlob((result) => result ? resolve(result) : reject(/* @__PURE__ */ new Error("JPEG encode failed.")), "image/jpeg", quality);
	});
	return new Uint8Array(await blob.arrayBuffer());
}
async function fileBytes(file) {
	return new Uint8Array(await file.arrayBuffer());
}
async function runMosh(opts) {
	if (!opts.clips.length) throw new Error("Add a video or a still first.");
	cancelRequested = false;
	logSink = opts.onLog;
	const ff = await engine();
	const trash = [];
	const cleanup = async () => {
		for (const name of trash) try {
			await ff.deleteFile(name);
		} catch {}
	};
	try {
		opts.onProgress({
			phase: "Loading the MPEG-4 engine",
			ratio: 1
		});
		const source = opts.clips[0];
		const size = frameSize(opts.settings.width, opts.settings.aspect, source.width, source.height);
		const encoded = [];
		for (let i = 0; i < opts.clips.length; i++) {
			const clip = opts.clips[i];
			const frames = encodeCount(clip, opts.settings.fps);
			const inputName = `in${i}.${clip.kind === "image" ? "jpg" : "bin"}`;
			const outputName = `c${i}.avi`;
			trash.push(inputName, outputName);
			opts.onProgress({
				phase: `Encoding ${i + 1} of ${opts.clips.length}`,
				ratio: 0
			});
			progressSink = (ratio) => opts.onProgress({
				phase: `Encoding ${i + 1} of ${opts.clips.length}`,
				ratio
			});
			let bytes;
			if (clip.kind === "image") {
				const quality = clip.jpegDent > 0 ? .86 : .92;
				bytes = await jpegBytes(clip.file, quality);
				if (clip.jpegDent > 0) bytes = glitchJpeg(bytes, {
					seed: opts.settings.seed + i * 17,
					passes: Math.max(1, Math.round(clip.jpegDent / 8)),
					mode: clip.jpegDent > 66 ? "repeat" : clip.jpegDent > 33 ? "shift" : "swap",
					intensity: clip.jpegDent
				});
			} else bytes = await fileBytes(clip.file);
			await writeInput(ff, inputName, bytes);
			const args = clip.kind === "image" ? imageEncodeArgs(inputName, outputName, clip, opts.settings, size, frames) : videoEncodeArgs(inputName, outputName, clip, opts.settings, size, frames);
			frameGoal = frames;
			await exec(ff, args, `Encode “${clip.name}”`);
			encoded.push({
				name: outputName,
				bytes: asBytes(await ff.readFile(outputName)),
				clip
			});
		}
		opts.onProgress({
			phase: "Cutting I-frames and P-frames",
			ratio: .4
		});
		const parsed = encoded.map((item) => ({
			...parseAvi(item.bytes),
			clip: item.clip,
			bytes: item.bytes
		}));
		for (const item of parsed) if (!item.frames.length) throw new Error(`“${item.clip.name}” encoded to zero frames.`);
		const moshed = moshFrames(parsed.map((item) => ({
			frames: item.frames,
			role: item.clip.role,
			protectKey: item.clip.protectKey,
			seedTail: item.clip.seedTail
		})), opts.settings);
		const avi = rebuildAvi(parsed[0].bytes, moshed.frames);
		if (parseAvi(avi).frames.length !== moshed.frames.length) throw new Error("The rebuilt AVI did not round-trip. This mosh was not written.");
		trash.push("mosh.avi", "out.mp4", "aud.m4a");
		await writeInput(ff, "mosh.avi", avi);
		let audio = null;
		if (opts.settings.keepAudio) {
			const audible = opts.clips.find((clip) => clip.kind === "video");
			if (audible) {
				const index = opts.clips.indexOf(audible);
				opts.onProgress({
					phase: "Lifting audio",
					ratio: .2
				});
				progressSink = (ratio) => opts.onProgress({
					phase: "Lifting audio",
					ratio
				});
				if (await ff.exec([
					"-ss",
					Math.max(0, audible.inPoint).toFixed(3),
					"-i",
					`in${index}.bin`,
					"-vn",
					"-c:a",
					"aac",
					"-b:a",
					"128k",
					"aud.m4a"
				]) === 0) audio = "aud.m4a";
				else moshed.stats.warnings.push("No audio stream on the first video, so the bake is silent.");
			}
		}
		opts.onProgress({
			phase: "Baking a playable MP4",
			ratio: 0
		});
		progressSink = (ratio) => opts.onProgress({
			phase: "Baking a playable MP4",
			ratio
		});
		const seconds = (moshed.frames.length / opts.settings.fps).toFixed(3);
		const filter = bakeFilter(opts.settings);
		const bake = ["-i", "mosh.avi"];
		if (audio) bake.push("-i", audio);
		if (filter) bake.push("-vf", filter);
		bake.push("-t", seconds, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", String(opts.settings.crf), "-movflags", "+faststart");
		if (audio) bake.push("-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac");
		else bake.push("-an");
		bake.push("out.mp4");
		frameGoal = moshed.frames.length;
		await exec(ff, bake, "Bake");
		const mp4 = asBytes(await ff.readFile("out.mp4"));
		const copy = new Uint8Array(new ArrayBuffer(mp4.byteLength));
		copy.set(mp4);
		opts.onProgress({
			phase: "Done",
			ratio: 1
		});
		return {
			mp4: new Blob([copy.buffer], { type: "video/mp4" }),
			stats: moshed.stats
		};
	} catch (error) {
		try {
			ffmpeg?.terminate();
		} catch {}
		ffmpeg = null;
		if (cancelRequested) throw new Error("Mosh cancelled.");
		throw error;
	} finally {
		if (ffmpeg?.loaded) await cleanup();
	}
}
//#endregion
export { cancelMosh, runMosh };
