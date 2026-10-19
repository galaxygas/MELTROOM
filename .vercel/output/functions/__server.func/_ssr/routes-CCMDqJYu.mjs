import { i as __toESM } from "../_runtime.mjs";
import { a as require_jsx_runtime, o as require_react } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { a as ArrowUp, i as Download, n as Trash2, o as ArrowDown, r as Plus } from "../_libs/lucide-react.mjs";
import { i as SliderTrack, n as SliderRange, r as SliderThumb, t as Slider } from "../_libs/@radix-ui/react-slider+[...].mjs";
import { n as SwitchThumb, t as Switch } from "../_libs/radix-ui__react-switch.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CCMDqJYu.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
function view(buf) {
	return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}
function readU32(buf, offset) {
	return view(buf).getUint32(offset, true);
}
function writeU32(buf, offset, value) {
	view(buf).setUint32(offset, value >>> 0, true);
}
function fourcc(buf, offset) {
	return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}
function findFourcc(buf, id) {
	const a = id.charCodeAt(0);
	const b = id.charCodeAt(1);
	const c = id.charCodeAt(2);
	const d = id.charCodeAt(3);
	for (let i = 0; i <= buf.length - 4; i++) if (buf[i] === a && buf[i + 1] === b && buf[i + 2] === c && buf[i + 3] === d) return i;
	return -1;
}
/** MPEG-4 Part 2: 00 00 01 B6, then 2-bit vop_coding_type. 00 = I, 01 = P, 10 = B. */
function vopCodingType(payload) {
	const end = payload.length - 4;
	for (let i = 0; i < end; i++) if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1 && payload[i + 3] === 182) return payload[i + 4] >> 6;
	return null;
}
function isIFrame(frame) {
	const coding = vopCodingType(frame.payload);
	if (coding !== null) return coding === 0;
	return (frame.flags & 16) !== 0;
}
function cloneFrame(frame) {
	return {
		id: frame.id,
		flags: frame.flags,
		payload: frame.payload.slice(),
		protect: frame.protect
	};
}
function parseAvi(buf) {
	if (buf.length < 12 || fourcc(buf, 0) !== "RIFF") throw new Error("The encoder did not return an AVI.");
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
	if (movi < 0 || idx < 0) throw new Error("This AVI has no frame index. Shorten the clip and try again.");
	const count = Math.floor(readU32(buf, idx + 4) / 16);
	if (count <= 0) throw new Error("The AVI contains no frames.");
	const entries = [];
	for (let n = 0; n < count; n++) {
		const o = idx + 8 + n * 16;
		entries.push({
			flags: readU32(buf, o + 4),
			offset: readU32(buf, o + 8)
		});
	}
	let base = -1;
	for (const candidate of [
		movi + 8,
		movi,
		movi + 4,
		0
	]) {
		const pos = candidate + entries[0].offset;
		if (pos < 0 || pos + 4 > buf.length) continue;
		const tag = fourcc(buf, pos);
		if (tag === "00dc" || tag === "00db" || tag === "00wb") {
			base = candidate;
			break;
		}
	}
	if (base < 0) throw new Error("Could not locate frames in the AVI.");
	const frames = [];
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
			protect: false
		});
	}
	return {
		frames,
		moviAt: movi
	};
}
function reflag(frames) {
	return frames.map((frame, index) => {
		const keepKey = frame.protect && isIFrame(frame);
		return {
			...frame,
			flags: index === 0 || keepKey ? 16 : 0
		};
	});
}
/** Rebuild a standard (non-OpenDML) AVI using the template's hdrl and a new movi/idx1. */
function rebuildAvi(template, frames) {
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
	const bodyParts = [];
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
	movi.set([
		76,
		73,
		83,
		84
	], 0);
	new DataView(movi.buffer).setUint32(4, listSize, true);
	movi.set([
		109,
		111,
		118,
		105
	], 8);
	let offset = 12;
	for (const part of bodyParts) {
		movi.set(part, offset);
		offset += part.length;
	}
	const idx = new Uint8Array(8 + index.length);
	idx.set([
		105,
		100,
		120,
		49
	], 0);
	new DataView(idx.buffer).setUint32(4, index.length, true);
	idx.set(index, 8);
	const out = new Uint8Array(header.length + movi.length + idx.length);
	out.set(header, 0);
	out.set(movi, header.length);
	out.set(idx, header.length + movi.length);
	new DataView(out.buffer).setUint32(4, out.length - 8, true);
	return out;
}
var DEFAULT_SETTINGS = {
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
	crf: 18
};
function withEffects(base, patch) {
	return {
		...base,
		...patch
	};
}
var PRESETS = [
	{
		id: "transfer",
		name: "Transfer",
		blurb: "Later clips donate motion onto the opening picture.",
		apply: (base) => withEffects(base, {
			keyMode: "delete",
			gop: 600,
			orderMode: "off",
			bloomOn: false,
			glideOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false
		})
	},
	{
		id: "cut-melt",
		name: "Cut melt",
		blurb: "One key per clip. Every later key is deleted so shots pour together.",
		apply: (base) => withEffects(base, {
			keyMode: "delete",
			gop: 600,
			orderMode: "off",
			bloomOn: false,
			glideOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false
		})
	},
	{
		id: "open-gop",
		name: "Open GOP",
		blurb: "Plant a key every 8 frames, then delete them. Works on a single shot.",
		apply: (base) => withEffects(base, {
			keyMode: "delete",
			gop: 8,
			orderMode: "off",
			bloomOn: false,
			glideOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false
		})
	},
	{
		id: "replace",
		name: "Replace",
		blurb: "Swap each intermediate key for the next delta, so that motion hits twice.",
		apply: (base) => withEffects(base, {
			keyMode: "replace",
			gop: 12,
			orderMode: "off",
			bloomOn: false,
			glideOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false
		})
	},
	{
		id: "bloom",
		name: "Bloom",
		blurb: "Repeat one delta so its motion vectors pile up and smear.",
		apply: (base) => withEffects(base, {
			keyMode: "off",
			bloomOn: true,
			bloomAt: 25,
			bloomSpan: 1,
			bloomExtra: 16,
			glideOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false,
			orderMode: "off"
		})
	},
	{
		id: "glide",
		name: "Glide",
		blurb: "Duplicate every delta in a range. Motion keeps stepping.",
		apply: (base) => withEffects(base, {
			keyMode: "delete",
			gop: 600,
			glideOn: true,
			glideStart: 15,
			glideEnd: 85,
			glideExtra: 2,
			bloomOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false
		})
	},
	{
		id: "reverse",
		name: "Reverse",
		blurb: "Play delta frames backward onto the picture they were never meant for.",
		apply: (base) => withEffects(base, {
			keyMode: "delete",
			gop: 48,
			orderMode: "reverse",
			orderStart: 8,
			orderEnd: 100,
			bloomOn: false,
			glideOn: false,
			pulseOn: false,
			echoOn: false,
			bendOn: false
		})
	},
	{
		id: "tape",
		name: "Broken tape",
		blurb: "Delete keys, then XOR the delta bitstream. Real databend, not a filter.",
		apply: (base) => withEffects(base, {
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
			echoOn: false
		})
	}
];
function sanitizeSettings(raw) {
	if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
	const merged = {
		...DEFAULT_SETTINGS,
		...raw
	};
	merged.width = [
		256,
		384,
		480,
		640
	].includes(merged.width) ? merged.width : 480;
	merged.fps = [
		8,
		12,
		15,
		24
	].includes(merged.fps) ? merged.fps : 12;
	merged.quantizer = clamp(Math.round(merged.quantizer), 2, 12);
	merged.gop = clamp(Math.round(merged.gop), 4, 600);
	merged.crf = clamp(Math.round(merged.crf), 14, 28);
	merged.seed = clamp(Math.round(merged.seed), 0, 999999);
	return merged;
}
function clamp(n, min, max) {
	if (Number.isNaN(n)) return min;
	return Math.min(max, Math.max(min, n));
}
function frameSize(width, aspect, sourceW, sourceH) {
	const w = width % 2 === 0 ? width : width + 1;
	let ratio = 16 / 9;
	if (aspect === "source" && sourceW > 0 && sourceH > 0) ratio = sourceW / sourceH;
	else if (aspect === "4:3") ratio = 4 / 3;
	else if (aspect === "1:1") ratio = 1;
	else if (aspect === "9:16") ratio = 9 / 16;
	let h = Math.round(w / ratio);
	if (h % 2) h += 1;
	return {
		w,
		h: Math.max(2, h)
	};
}
function encodeCount(clip, fps) {
	if (clip.role === "seed") return Math.max(1, 1 + clamp(Math.round(clip.seedTail), 0, 48));
	const seconds = Math.max(.08, clip.length);
	return Math.max(1, Math.round(seconds * fps));
}
function mulberry32$2(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function findEntropy(bytes) {
	let sos = -1;
	for (let i = 0; i < bytes.length - 3; i++) if (bytes[i] === 255 && bytes[i + 1] === 218) sos = i;
	if (sos < 0) return null;
	const segLen = bytes[sos + 2] << 8 | bytes[sos + 3];
	const start = sos + 2 + segLen;
	let end = -1;
	for (let i = bytes.length - 2; i > start; i--) if (bytes[i] === 255 && bytes[i + 1] === 217) {
		end = i;
		break;
	}
	if (end < 0 || end - start < 48) return null;
	return {
		start,
		end
	};
}
function safe(buf, at, len) {
	if (at < 1 || at + len > buf.length) return false;
	if (buf[at - 1] === 255) return false;
	for (let i = 0; i < len; i++) if (buf[at + i] === 255) return false;
	return true;
}
function locate(buf, rng, len) {
	if (buf.length < len + 4) return -1;
	for (let attempt = 0; attempt < 32; attempt++) {
		const at = 1 + Math.floor(rng() * Math.max(1, buf.length - len - 1));
		if (safe(buf, at, len)) return at;
	}
	for (let at = 1; at + len <= buf.length; at++) if (safe(buf, at, len)) return at;
	return -1;
}
function mutate(entropy, mode, rng, intensity) {
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
function glitchJpeg(input, opts) {
	const bounds = findEntropy(input);
	if (!bounds) throw new Error("That file is not a JPEG with a dentable scan.");
	let entropy = input.slice(bounds.start, bounds.end);
	const rng = mulberry32$2(opts.seed);
	const passes = Math.max(1, Math.min(48, Math.round(opts.passes)));
	for (let i = 0; i < passes; i++) entropy = mutate(entropy, opts.mode, rng, opts.intensity);
	const out = new Uint8Array(new ArrayBuffer(bounds.start + entropy.length + (input.length - bounds.end)));
	out.set(input.subarray(0, bounds.start), 0);
	out.set(entropy, bounds.start);
	out.set(input.subarray(bounds.end), bounds.start + entropy.length);
	return out;
}
var CRC_TABLE = (() => {
	const table = /* @__PURE__ */ new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();
function crc32(data) {
	let c = 4294967295;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ c >>> 8;
	return (c ^ 4294967295) >>> 0;
}
function u16(n) {
	return new Uint8Array([n & 255, n >>> 8 & 255]);
}
function u32(n) {
	return new Uint8Array([
		n & 255,
		n >>> 8 & 255,
		n >>> 16 & 255,
		n >>> 24 & 255
	]);
}
/** Uncompressed ZIP (store). Enough to hand back a folder of dented stills. */
function zipStore(files) {
	const parts = [];
	const central = [];
	let offset = 0;
	for (const file of files) {
		const name = new TextEncoder().encode(file.name);
		const crc = crc32(file.data);
		const localBytes = concat([
			u32(67324752),
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
			file.data
		]);
		parts.push(localBytes);
		central.push(concat([
			u32(33639248),
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
			name
		]));
		offset += localBytes.length;
	}
	const centralBytes = concat(central);
	const end = concat([
		u32(101010256),
		u16(0),
		u16(0),
		u16(files.length),
		u16(files.length),
		u32(centralBytes.length),
		u32(offset),
		u16(0)
	]);
	return concat([
		...parts,
		centralBytes,
		end
	]);
}
function concat(parts) {
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
function mulberry32$1(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function range(length, startPct, endPct, floorAtOne) {
	const start = Math.floor(length * Math.min(startPct, endPct) / 100);
	const end = Math.ceil(length * Math.max(startPct, endPct) / 100);
	const a = floorAtOne ? Math.max(1, start) : Math.max(0, start);
	return [a, Math.max(a, Math.min(length, end))];
}
function assemble(clips) {
	const out = [];
	let droppedKeys = 0;
	clips.forEach((clip, index) => {
		let frames = clip.frames.map(cloneFrame);
		if (!frames.length) return;
		if (clip.role === "seed") frames = frames.slice(0, Math.max(1, 1 + clip.seedTail));
		else if (clip.role === "motion" && index !== 0) {
			const deltas = frames.filter((frame) => !isIFrame(frame));
			if (deltas.length) {
				droppedKeys += frames.length - deltas.length;
				frames = deltas;
			}
		}
		if (clip.protectKey) {
			const at = frames.findIndex((frame) => isIFrame(frame));
			if (at >= 0) frames[at] = {
				...frames[at],
				protect: true
			};
		}
		out.push(...frames);
	});
	if (!out.length) throw new Error("Nothing to mosh. Add a clip that actually has frames.");
	if (!isIFrame(out[0])) throw new Error("The timeline has to open on a real keyframe. Put a picture or a full clip first.");
	return {
		frames: out,
		droppedKeys
	};
}
function applyKeySurgery(frames, settings) {
	if (settings.keyMode === "off") return frames.map(cloneFrame);
	const [start, end] = range(frames.length, settings.keyStart, settings.keyEnd, false);
	const out = [];
	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i];
		if (!(i > 0 && i >= start && i < end && !frame.protect && isIFrame(frame))) {
			out.push(cloneFrame(frame));
			continue;
		}
		if (settings.keyMode === "delete") continue;
		let donor;
		for (let j = i + 1; j < frames.length; j++) if (!isIFrame(frames[j])) {
			donor = frames[j];
			break;
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
			protect: false
		});
	}
	if (!out.length || !isIFrame(out[0])) throw new Error("Key surgery removed the opening picture. Narrow the key range.");
	return reflag(out);
}
function shuffleBlocks(frames, block, seed) {
	const size = Math.max(1, Math.round(block));
	const blocks = [];
	for (let i = 0; i < frames.length; i += size) blocks.push(frames.slice(i, i + size));
	const rng = mulberry32$1(seed);
	for (let i = blocks.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = blocks[i];
		blocks[i] = blocks[j];
		blocks[j] = tmp;
	}
	return blocks.flat();
}
function applyOrder(frames, settings) {
	if (settings.orderMode === "off" || frames.length < 3) return frames;
	const [start, end] = range(frames.length, settings.orderStart, settings.orderEnd, true);
	if (end - start < 2) return frames;
	const slice = frames.slice(start, end).map(cloneFrame);
	let next = slice;
	if (settings.orderMode === "reverse") next = slice.reverse();
	else if (settings.orderMode === "shuffle") next = shuffleBlocks(slice, settings.shuffleBlock, settings.seed);
	else if (settings.orderMode === "sort-large") next = slice.slice().sort((a, b) => b.payload.length - a.payload.length);
	else if (settings.orderMode === "sort-small") next = slice.slice().sort((a, b) => a.payload.length - b.payload.length);
	const out = frames.slice();
	out.splice(start, slice.length, ...next);
	return reflag(out);
}
function guard(count) {
	if (count > 720) throw new Error(`This mosh would be ${count} frames, over the 720-frame limit. Lower repeats, frame rate, or clip length.`);
}
function applyRepeats(frames, settings) {
	let out = frames;
	if (settings.bloomOn && settings.bloomExtra > 0 && out.length > 1) {
		const span = Math.max(1, Math.round(settings.bloomSpan));
		const extra = Math.max(0, Math.round(settings.bloomExtra));
		let at = Math.round((out.length - 1) * settings.bloomAt / 100);
		if (at === 0) at = 1;
		const take = out.slice(at, Math.min(out.length, at + span)).map(cloneFrame);
		const insert = [];
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
			const insert = [];
			for (let r = 0; r < extra; r++) insert.push(...slice.map(cloneFrame));
			guard(out.length + insert.length);
			out = out.slice();
			out.splice(end, 0, ...insert);
		}
	}
	if (settings.glideOn && settings.glideExtra > 0 && out.length > 1) {
		const [start, end] = range(out.length, settings.glideStart, settings.glideEnd, true);
		const extra = Math.max(0, Math.round(settings.glideExtra));
		const next = [];
		for (let i = 0; i < out.length; i++) {
			next.push(out[i]);
			if (i >= start && i < end) for (let r = 0; r < extra; r++) next.push(cloneFrame(out[i]));
		}
		guard(next.length);
		out = next;
	}
	if (settings.pulseOn && settings.pulseExtra > 0 && out.length > 1) {
		const every = Math.max(2, Math.round(settings.pulseEvery));
		const group = Math.max(1, Math.round(settings.pulseGroup));
		const extra = Math.max(0, Math.round(settings.pulseExtra));
		const next = [];
		let i = 0;
		while (i < out.length) if (i > 0 && i % every === 0) {
			const chunk = out.slice(i, Math.min(out.length, i + group)).map(cloneFrame);
			next.push(...chunk);
			for (let r = 0; r < extra; r++) next.push(...chunk.map(cloneFrame));
			i += chunk.length;
		} else {
			next.push(out[i]);
			i += 1;
		}
		guard(next.length);
		out = next;
	}
	return reflag(out);
}
function headerEnd(payload) {
	const end = payload.length - 5;
	for (let i = 0; i < end; i++) if (payload[i] === 0 && payload[i + 1] === 0 && payload[i + 2] === 1 && payload[i + 3] === 182) return Math.min(payload.length, i + 12);
	return Math.min(payload.length, 24);
}
function createsStartCode(buf, index) {
	for (let s = Math.max(0, index - 2); s <= index && s + 2 < buf.length; s++) if (buf[s] === 0 && buf[s + 1] === 0 && buf[s + 2] === 1) return true;
	return false;
}
function safeWindow(buf, at, len) {
	if (at < 1 || at + len > buf.length) return false;
	if (buf[at - 1] === 255) return false;
	for (let i = 0; i < len; i++) if (buf[at + i] === 255) return false;
	return true;
}
function findWindow(buf, rng, len) {
	const start = headerEnd(buf);
	if (buf.length - start < len + 2) return -1;
	for (let attempt = 0; attempt < 24; attempt++) {
		const at = start + Math.floor(rng() * Math.max(1, buf.length - start - len));
		if (safeWindow(buf, at, len)) return at;
	}
	for (let at = start; at + len <= buf.length; at++) if (safeWindow(buf, at, len)) return at;
	return -1;
}
function bendPayload(payload, settings, rng) {
	const intensity = Math.max(1, Math.min(100, settings.bendIntensity));
	if (settings.bendMode === "xor") {
		const out = payload.slice();
		const start = headerEnd(out);
		const stride = Math.max(2, Math.round(40 - intensity * .32));
		const salt = 1 + Math.floor(rng() * 254);
		let hits = 0;
		for (let i = start; i < out.length; i += stride) {
			if (rng() > .65) continue;
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
		if (out.length - start < 8) return null;
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
function applyBend(frames, settings) {
	if (!settings.bendOn) return {
		frames,
		bent: 0
	};
	const rng = mulberry32$1(settings.seed ^ 2654435769);
	let bent = 0;
	return {
		frames: frames.map((frame, index) => {
			if (index === 0 || frame.protect || isIFrame(frame)) return frame;
			if (rng() * 100 > settings.bendFrequency) return frame;
			const payload = bendPayload(frame.payload, settings, rng);
			if (!payload) return frame;
			bent += 1;
			return {
				...frame,
				payload
			};
		}),
		bent
	};
}
function moshFrames(clips, settings) {
	const warnings = [];
	const assembledResult = assemble(clips);
	const assembled = assembledResult.frames;
	const keysBefore = assembled.filter((frame) => isIFrame(frame)).length;
	let frames = applyKeySurgery(assembled, settings);
	const keysAfter = frames.filter((frame) => isIFrame(frame)).length;
	if (settings.keyMode !== "off" && keysBefore - keysAfter === 0 && assembledResult.droppedKeys === 0) warnings.push("No intermediate keyframe was removed. Add another clip, or shorten the key interval.");
	frames = applyOrder(frames, settings);
	const beforeRepeat = frames.length;
	frames = applyRepeats(frames, settings);
	const repeated = frames.length - beforeRepeat;
	const bentResult = applyBend(frames, settings);
	frames = reflag(bentResult.frames);
	if (frames[0]) frames[0].flags = 16;
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
			warnings
		}
	};
}
function fakeClipFrames(count, gop, seedSize) {
	const frames = [];
	const gap = Math.max(1, gop);
	for (let i = 0; i < count; i++) {
		const iFrame = i % gap === 0;
		const payload = new Uint8Array(iFrame ? 48 : 32 + i % 7 * 4);
		payload[0] = 0;
		payload[1] = 0;
		payload[2] = 1;
		payload[3] = 182;
		payload[4] = iFrame ? 0 : 64;
		payload[8] = seedSize & 255;
		frames.push({
			id: "00dc",
			flags: iFrame ? 16 : 0,
			payload,
			protect: false
		});
	}
	return frames;
}
function estimateMosh(clips, settings) {
	const inputs = clips.map((clip) => ({
		frames: fakeClipFrames(encodeCount(clip, settings.fps), settings.gop, clip.seedTail),
		role: clip.role,
		protectKey: clip.protectKey,
		seedTail: clip.seedTail
	}));
	if (!inputs.length) return {
		inputFrames: 0,
		outputFrames: 0,
		keysBefore: 0,
		keysAfter: 0,
		donatedKeys: 0,
		repeated: 0,
		bent: 0,
		warnings: []
	};
	const result = moshFrames(inputs, settings);
	result.stats.repeated = Math.max(0, result.stats.outputFrames - result.stats.inputFrames);
	return result.stats;
}
var KATA = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ";
var HEX = "0123456789ABCDEF";
var SETS = [
	KATA,
	HEX,
	"01",
	"MELTROOMVOP"
];
var COLS = 72;
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = a + 1831565813 >>> 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function glyph(set, rand) {
	return set[Math.floor(rand() * set.length)] ?? "0";
}
function buildDrops(seed) {
	const rand = mulberry32(seed);
	const drops = [];
	let lines = 0;
	while (lines < 64) {
		const set = SETS[Math.floor(rand() * SETS.length)] ?? HEX;
		const bodyN = 4 + Math.floor(rand() * 14);
		const tailN = 2 + Math.floor(rand() * 6);
		const gap = 6 + Math.floor(rand() * 16);
		let body = "";
		for (let i = 0; i < bodyN; i++) body += `${glyph(set, rand)}\n`;
		let tail = "";
		for (let i = 0; i < tailN; i++) tail += `${glyph(set, rand)}\n`;
		drops.push({
			head: glyph(set, rand),
			body,
			tail,
			gap
		});
		lines += 1 + bodyN + tailN + gap;
	}
	return drops;
}
var COLUMNS = Array.from({ length: COLS }, (_, index) => ({
	id: index,
	drops: buildDrops(20973 + index * 131),
	opacity: .55 + index % 5 * .09
}));
function Stream({ drops }) {
	return drops.map((drop, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "rain-drop",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "rain-head",
				children: drop.head
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "rain-body",
				children: drop.body
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "rain-tail",
				children: drop.tail
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "rain-gap",
				style: { height: `${drop.gap}em` }
			})
		]
	}, index));
}
function MatrixField() {
	const rootRef = (0, import_react.useRef)(null);
	const [shown, setShown] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		setShown(true);
	}, []);
	(0, import_react.useLayoutEffect)(() => {
		if (!shown) return;
		const root = rootRef.current;
		if (!root) return;
		const tracks = Array.from(root.querySelectorAll("[data-rain]"));
		let alive = true;
		let raf = 0;
		const measure = () => tracks.map((el, index) => {
			const rand = mulberry32(45312 + index * 19);
			const half = el.offsetHeight / 2 || window.innerHeight;
			return {
				el,
				half,
				y: -rand() * half,
				speed: 50 + rand() * 230
			};
		});
		let drops = measure();
		const paint = () => {
			for (const drop of drops) drop.el.style.transform = `translate3d(0,${drop.y}px,0)`;
		};
		paint();
		let last = performance.now();
		const frame = (now) => {
			if (!alive) return;
			const dt = Math.min(.05, (now - last) / 1e3);
			last = now;
			for (const drop of drops) {
				drop.y += drop.speed * dt;
				if (drop.y >= 0) drop.y -= drop.half;
				drop.el.style.transform = `translate3d(0,${drop.y.toFixed(1)}px,0)`;
			}
			raf = requestAnimationFrame(frame);
		};
		const onVis = () => {
			cancelAnimationFrame(raf);
			if (!document.hidden) {
				last = performance.now();
				raf = requestAnimationFrame(frame);
			}
		};
		const onResize = () => {
			drops = measure();
			paint();
		};
		raf = requestAnimationFrame(frame);
		document.addEventListener("visibilitychange", onVis);
		window.addEventListener("resize", onResize);
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			document.removeEventListener("visibilitychange", onVis);
			window.removeEventListener("resize", onResize);
		};
	}, [shown]);
	if (!shown) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"aria-hidden": true,
		className: "pointer-events-none fixed inset-0 z-0 bg-bg"
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: rootRef,
		"aria-hidden": true,
		className: "matrix-field pointer-events-none fixed inset-0 z-0 overflow-hidden select-none",
		children: COLUMNS.map((col) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "matrix-col",
			style: { opacity: col.opacity },
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "matrix-track",
				"data-rain": true,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rain-half",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stream, { drops: col.drops })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "rain-half",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stream, { drops: col.drops })
				})]
			})
		}, col.id))
	});
}
var STORAGE_KEY = "meltroom-settings-v1";
var MOTIONS = [
	{
		value: "hold",
		label: "Hold"
	},
	{
		value: "push",
		label: "Push in"
	},
	{
		value: "pull",
		label: "Pull out"
	},
	{
		value: "pan-left",
		label: "Pan left"
	},
	{
		value: "pan-right",
		label: "Pan right"
	},
	{
		value: "pan-up",
		label: "Pan up"
	},
	{
		value: "pan-down",
		label: "Pan down"
	},
	{
		value: "drift",
		label: "Drift"
	},
	{
		value: "orbit",
		label: "Orbit"
	},
	{
		value: "pulse",
		label: "Pulse"
	}
];
var ROLES = [
	{
		value: "full",
		label: "Picture + motion",
		hint: "Keep this clip’s key and its vectors."
	},
	{
		value: "seed",
		label: "Seed picture",
		hint: "Keep the opening picture. Later motion paints onto it."
	},
	{
		value: "motion",
		label: "Motion only",
		hint: "Drop this clip’s picture and donate its vectors."
	}
];
function downloadBlob(blob, name) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	URL.revokeObjectURL(url);
}
async function probeFile(file) {
	if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
		const bitmap = await createImageBitmap(file);
		const meta = {
			kind: "image",
			duration: 0,
			width: bitmap.width,
			height: bitmap.height
		};
		bitmap.close();
		return meta;
	}
	const url = URL.createObjectURL(file);
	try {
		const meta = await new Promise((resolve, reject) => {
			const video = document.createElement("video");
			video.preload = "metadata";
			video.onloadedmetadata = () => resolve({
				w: video.videoWidth,
				h: video.videoHeight,
				d: video.duration
			});
			video.onerror = () => reject(/* @__PURE__ */ new Error(`Could not read ${file.name}.`));
			video.src = url;
		});
		return {
			kind: "video",
			duration: Number.isFinite(meta.d) ? meta.d : 0,
			width: meta.w,
			height: meta.h
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}
async function makeClip(file, role) {
	const meta = await probeFile(file);
	const kind = meta.kind;
	return {
		id: crypto.randomUUID(),
		file,
		name: file.name,
		kind,
		url: URL.createObjectURL(file),
		sourceDuration: meta.duration,
		width: meta.width,
		height: meta.height,
		role: role ?? (kind === "image" ? "full" : "full"),
		protectKey: false,
		seedTail: 0,
		inPoint: 0,
		length: kind === "video" ? Math.min(4, Math.max(.4, meta.duration || 4)) : 1.6,
		motion: kind === "image" ? "push" : "hold",
		motionAmount: 70,
		jpegDent: 0
	};
}
function Range({ label, value, min, max, step, suffix, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "py-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-baseline justify-between gap-3 text-xs",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "text-muted tabular-nums",
				children: [Number.isInteger(step) ? value : value.toFixed(step < .1 ? 2 : 1), suffix ?? ""]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider, {
			className: "relative mt-3 flex h-11 w-full touch-none items-center",
			value: [value],
			min,
			max,
			step,
			onValueChange: ([next]) => onChange(next),
			"aria-label": label,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderTrack, {
				className: "relative h-0.5 grow bg-border",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRange, { className: "absolute h-0.5 bg-accent" })
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderThumb, { className: "block size-4 rotate-45 border-2 border-accent bg-bg" })]
		})]
	});
}
function Toggle({ label, hint, checked, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center justify-between gap-4 py-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-sm",
				children: label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-xs leading-relaxed text-muted",
				children: hint
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
			checked,
			onCheckedChange: onChange,
			"aria-label": label,
			className: "relative h-11 w-16 shrink-0 border border-border bg-bg data-[state=checked]:border-accent data-[state=checked]:bg-accent",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SwitchThumb, { className: "absolute top-1.5 left-1 block size-8 bg-muted transition-transform data-[state=checked]:translate-x-7 data-[state=checked]:bg-bg" })
		})]
	});
}
function Choice({ value, options, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex flex-wrap gap-1",
		children: options.map((option) => {
			const on = option.value === value;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onChange(option.value),
				className: `h-11 border px-3 text-xs tracking-wide ${on ? "border-accent bg-accent text-bg" : "border-border bg-bg/70 text-fg"}`,
				children: option.label
			}, String(option.value));
		})
	});
}
function Select({ label, value, onChange, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block py-2 text-xs",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
			value,
			onChange: (event) => onChange(event.target.value),
			className: "mt-2 h-11 w-full border border-border bg-bg px-3 text-sm text-fg",
			children
		})]
	});
}
function Clock() {
	const [stamp, setStamp] = (0, import_react.useState)("--:--:--");
	(0, import_react.useEffect)(() => {
		const tick = () => setStamp((/* @__PURE__ */ new Date()).toISOString().slice(11, 19));
		tick();
		const id = window.setInterval(tick, 1e3);
		return () => window.clearInterval(id);
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
		className: "hidden text-xs tracking-widest text-accent tabular-nums sm:block",
		"aria-hidden": true,
		children: [
			"SYS ",
			stamp,
			"Z"
		]
	});
}
function Meltroom() {
	const [mode, setMode] = (0, import_react.useState)("bench");
	const [clips, setClips] = (0, import_react.useState)([]);
	const [selected, setSelected] = (0, import_react.useState)(0);
	const [settings, setSettings] = (0, import_react.useState)(DEFAULT_SETTINGS);
	const [presetId, setPresetId] = (0, import_react.useState)("cut-melt");
	const [running, setRunning] = (0, import_react.useState)(false);
	const [progress, setProgress] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [logs, setLogs] = (0, import_react.useState)([]);
	const [resultUrl, setResultUrl] = (0, import_react.useState)(null);
	const [stats, setStats] = (0, import_react.useState)(null);
	const [stills, setStills] = (0, import_react.useState)([]);
	const [jpegMode, setJpegMode] = (0, import_react.useState)("repeat");
	const [jpegPasses, setJpegPasses] = (0, import_react.useState)(6);
	const [jpegIntensity, setJpegIntensity] = (0, import_react.useState)(36);
	const [jpegQuality, setJpegQuality] = (0, import_react.useState)(.72);
	const [jpegSeed, setJpegSeed] = (0, import_react.useState)(4);
	const [denting, setDenting] = (0, import_react.useState)(false);
	const fileRef = (0, import_react.useRef)(null);
	const stillRef = (0, import_react.useRef)(null);
	const cancelRef = (0, import_react.useRef)(null);
	const resultRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) setSettings(sanitizeSettings(JSON.parse(raw)));
		} catch {}
	}, []);
	(0, import_react.useEffect)(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	}, [settings]);
	(0, import_react.useEffect)(() => {
		return () => {
			if (resultRef.current) URL.revokeObjectURL(resultRef.current);
		};
	}, []);
	const patch = (partial) => {
		setPresetId(null);
		setSettings((current) => ({
			...current,
			...partial
		}));
	};
	const size = frameSize(settings.width, settings.aspect, clips[0]?.width ?? 0, clips[0]?.height ?? 0);
	const estimate = (0, import_react.useMemo)(() => {
		if (!clips.length) return {
			stats: null,
			error: null
		};
		try {
			return {
				stats: estimateMosh(clips, settings),
				error: null
			};
		} catch (caught) {
			return {
				stats: null,
				error: caught instanceof Error ? caught.message : "This setup is too heavy."
			};
		}
	}, [clips, settings]);
	const active = clips[selected] ?? clips[0];
	const updateClip = (id, partial) => {
		setClips((current) => current.map((clip) => clip.id === id ? {
			...clip,
			...partial
		} : clip));
	};
	const addFiles = async (list) => {
		const incoming = [...list].filter((file) => file.type.startsWith("video/") || file.type.startsWith("image/") || /\.(mp4|mov|webm|mkv|avi|png|jpe?g|webp|gif)$/i.test(file.name));
		if (!incoming.length) {
			setError("Add a video or a still. Other file types are ignored.");
			return;
		}
		setError(null);
		try {
			const made = await Promise.all(incoming.map((file) => makeClip(file)));
			setClips((current) => [...current, ...made]);
			setSelected(clips.length);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Could not read that file.");
		}
	};
	const removeClip = (index) => {
		setClips((current) => {
			const clip = current[index];
			if (clip) URL.revokeObjectURL(clip.url);
			return current.filter((_, i) => i !== index);
		});
		setSelected((value) => Math.max(0, Math.min(value, clips.length - 2)));
	};
	const moveClip = (index, dir) => {
		const target = index + dir;
		if (target < 0 || target >= clips.length) return;
		setClips((current) => {
			const next = current.slice();
			const [item] = next.splice(index, 1);
			next.splice(target, 0, item);
			return next;
		});
		setSelected(target);
	};
	const loadDemo = async () => {
		setError(null);
		setProgress({
			phase: "Loading the demo reels",
			ratio: .4
		});
		try {
			const specs = [
				{
					href: "/demo/seed.png",
					name: "seed.png",
					type: "image/png",
					role: "seed"
				},
				{
					href: "/demo/rake.mp4",
					name: "rake.mp4",
					type: "video/mp4",
					role: "motion"
				},
				{
					href: "/demo/blocks.mp4",
					name: "blocks.mp4",
					type: "video/mp4",
					role: "motion"
				}
			];
			const made = [];
			for (const spec of specs) {
				const response = await fetch(spec.href);
				if (!response.ok) throw new Error("Demo media failed to load.");
				const blob = await response.blob();
				made.push(await makeClip(new File([blob], spec.name, { type: spec.type }), spec.role));
			}
			setClips((current) => {
				current.forEach((clip) => URL.revokeObjectURL(clip.url));
				return made;
			});
			setSelected(0);
			setSettings((current) => PRESETS[0].apply({
				...current,
				width: 480,
				fps: 12,
				quantizer: 3
			}));
			setPresetId("transfer");
			setProgress(null);
		} catch (caught) {
			setProgress(null);
			setError(caught instanceof Error ? caught.message : "Demo failed to load.");
		}
	};
	const mosh = async () => {
		setRunning(true);
		setError(null);
		setLogs([]);
		setStats(null);
		setProgress({
			phase: "Starting the codec engine",
			ratio: 0
		});
		try {
			const engine = await import("./engine-9Ndypz77.mjs");
			cancelRef.current = engine.cancelMosh;
			const result = await engine.runMosh({
				clips,
				settings,
				onProgress: setProgress,
				onLog: (line) => setLogs((prev) => [...prev.slice(-70), line])
			});
			if (resultRef.current) URL.revokeObjectURL(resultRef.current);
			const url = URL.createObjectURL(result.mp4);
			resultRef.current = url;
			setResultUrl(url);
			setStats(result.stats);
			setProgress(null);
		} catch (caught) {
			setProgress(null);
			setError(caught instanceof Error ? caught.message : "The mosh failed.");
		} finally {
			cancelRef.current = null;
			setRunning(false);
		}
	};
	const addStills = (list) => {
		const images = [...list].filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));
		if (!images.length) {
			setError("Stills mode wants images.");
			return;
		}
		setError(null);
		setStills((current) => [...current, ...images.map((file) => ({
			id: crypto.randomUUID(),
			file,
			name: file.name,
			url: URL.createObjectURL(file)
		}))]);
	};
	const dentStills = async () => {
		setDenting(true);
		setError(null);
		const next = [];
		for (const still of stills) try {
			const bitmap = await createImageBitmap(still.file);
			const canvas = document.createElement("canvas");
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("Could not draw.");
			ctx.drawImage(bitmap, 0, 0);
			bitmap.close();
			const blob = await new Promise((resolve, reject) => {
				canvas.toBlob((value) => value ? resolve(value) : reject(/* @__PURE__ */ new Error("JPEG encode failed.")), "image/jpeg", jpegQuality);
			});
			let bytes = new Uint8Array(await blob.arrayBuffer());
			let decoded = false;
			let passes = jpegPasses;
			let packed = null;
			for (let attempt = 0; attempt < 4 && !decoded; attempt++) {
				const result = glitchJpeg(bytes, {
					seed: jpegSeed + attempt * 101,
					passes,
					mode: jpegMode,
					intensity: jpegIntensity
				});
				const nextPacked = new Uint8Array(new ArrayBuffer(result.byteLength));
				nextPacked.set(result);
				const url = URL.createObjectURL(new Blob([nextPacked.buffer], { type: "image/jpeg" }));
				decoded = await new Promise((resolve) => {
					const img = new Image();
					img.onload = () => resolve(true);
					img.onerror = () => resolve(false);
					img.src = url;
				});
				URL.revokeObjectURL(url);
				if (decoded) packed = nextPacked;
				passes = Math.max(1, Math.floor(passes / 2));
			}
			if (!decoded || !packed) next.push({
				...still,
				error: "The JPEG decoder rejected every dent. Lower the passes.",
				resultUrl: void 0,
				resultBytes: void 0
			});
			else {
				if (still.resultUrl) URL.revokeObjectURL(still.resultUrl);
				next.push({
					...still,
					error: void 0,
					resultBytes: packed,
					resultUrl: URL.createObjectURL(new Blob([packed.buffer], { type: "image/jpeg" }))
				});
			}
		} catch (caught) {
			next.push({
				...still,
				error: caught instanceof Error ? caught.message : "Dent failed."
			});
		}
		setStills(next);
		setDenting(false);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative min-h-screen overflow-x-hidden text-fg",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MatrixField, {}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "scanlines pointer-events-none fixed inset-0 z-20",
				"aria-hidden": true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "sweep pointer-events-none fixed inset-x-0 top-0 z-[1]",
				"aria-hidden": true
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "relative z-10",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "border-b border-border bg-bg/80",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-0.5 bg-accent",
						"aria-hidden": true
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "grid size-9 place-items-center border border-accent",
								"aria-hidden": true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sigil-core size-2 bg-accent" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
								className: "font-display text-2xl leading-none font-bold tracking-widest text-accent",
								children: ["MELTROOM", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "caret",
									"aria-hidden": true
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-1 text-xs text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-accent",
									children: "root"
								}), "@codec · mpeg-4 asp datamosh"]
							})] })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clock, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex gap-1",
								role: "tablist",
								"aria-label": "Mode",
								children: [["bench", "Vectors"], ["stills", "Stills"]].map(([id, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									role: "tab",
									"aria-selected": mode === id,
									onClick: () => setMode(id),
									className: `h-11 border px-4 text-xs tracking-widest ${mode === id ? "border-accent bg-accent text-bg" : "border-border bg-bg/70 text-muted"}`,
									children: label
								}, id))
							})]
						})]
					})]
				}), mode === "bench" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
					className: "mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.85fr)]",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "min-w-0",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "frame frame-stage relative",
								onDragOver: (event) => event.preventDefault(),
								onDrop: (event) => {
									event.preventDefault();
									if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
								},
								children: resultUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
									src: resultUrl,
									controls: true,
									playsInline: true,
									className: "aspect-video w-full bg-bg object-contain"
								}, resultUrl) : active ? active.kind === "video" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
									src: active.url,
									controls: true,
									playsInline: true,
									className: "aspect-video w-full bg-bg object-contain"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: active.url,
									alt: active.name,
									className: "aspect-video w-full bg-bg object-contain"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "stage-scrim flex aspect-video flex-col items-start justify-end gap-3 p-5",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "text-xs tracking-widest text-accent",
											children: "AWAITING INPUT"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "max-w-md font-display text-3xl leading-none font-bold tracking-tight",
											children: "Drop shots. Keep one picture. Steal the motion."
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
											className: "max-w-md text-sm text-muted",
											children: "Clips are encoded as MPEG-4 with no B-frames. Keyframes and delta frames are cut in the AVI, then decoded so the vectors stick. The download is a normal MP4."
										})
									]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-3 flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
										size.w,
										"×",
										size.h
									] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [settings.fps, " fps"] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["q", settings.quantizer] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["gop ", settings.gop] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "b-frames off" }),
									estimate.stats ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [estimate.stats.outputFrames, " frames out"] }) : null
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex gap-2 overflow-x-auto pb-2",
								children: [clips.map((clip, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => setSelected(index),
									className: `w-28 shrink-0 border p-1 text-left ${index === selected ? "border-accent bg-bg/80" : "border-border bg-bg/50"}`,
									children: [
										clip.kind === "video" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
											src: clip.url,
											muted: true,
											className: "aspect-video w-full bg-bg object-cover"
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: clip.url,
											alt: "",
											className: "aspect-video w-full bg-bg object-cover"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "mt-1 block truncate text-xs",
											children: clip.name
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "text-xs text-muted",
											children: [
												index + 1,
												" · ",
												clip.role
											]
										})
									]
								}, clip.id)), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => fileRef.current?.click(),
									className: "flex aspect-video w-28 shrink-0 flex-col items-center justify-center gap-2 border border-dashed border-accent/50 bg-bg/40 text-xs text-muted",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), "Add"]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								ref: fileRef,
								type: "file",
								accept: "video/*,image/*",
								multiple: true,
								className: "sr-only",
								onChange: (event) => {
									if (event.target.files) addFiles(event.target.files);
									event.target.value = "";
								}
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 flex flex-wrap gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => fileRef.current?.click(),
										className: "btn-line h-11 px-4 text-sm",
										children: "Add media"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => void loadDemo(),
										className: "btn-line h-11 px-4 text-sm",
										children: "Load demo"
									}),
									clips.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => {
											clips.forEach((clip) => URL.revokeObjectURL(clip.url));
											setClips([]);
											setStats(null);
										},
										className: "h-11 px-4 text-sm text-muted",
										children: "Clear timeline"
									}) : null
								]
							}),
							active ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "frame mt-5 p-4",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex items-start justify-between gap-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
												className: "truncate font-display text-xl font-bold",
												children: active.name
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
												className: "text-xs text-muted",
												children: [
													active.kind === "video" ? `${active.sourceDuration.toFixed(1)}s source · using ${active.length.toFixed(1)}s from ${active.inPoint.toFixed(1)}s` : `${active.width}×${active.height} still`,
													" · ",
													encodeCount(active, settings.fps),
													" encoded frames"
												]
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex shrink-0 gap-1",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													"aria-label": "Move earlier",
													onClick: () => moveClip(selected, -1),
													className: "flex size-11 items-center justify-center border border-border",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowUp, { className: "size-4" })
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													"aria-label": "Move later",
													onClick: () => moveClip(selected, 1),
													className: "flex size-11 items-center justify-center border border-border",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowDown, { className: "size-4" })
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													"aria-label": "Remove clip",
													onClick: () => removeClip(selected),
													className: "flex size-11 items-center justify-center border border-border",
													children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
										label: "Contribution",
										value: active.role,
										onChange: (value) => updateClip(active.id, { role: value }),
										children: ROLES.map((role) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: role.value,
											children: role.label
										}, role.value))
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "text-xs text-muted",
										children: ROLES.find((role) => role.value === active.role)?.hint
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "mt-3",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
											label: "Hard cut",
											hint: "Protect this clip’s keyframe so the melt resets instead of pouring through.",
											checked: active.protectKey,
											onChange: (protectKey) => updateClip(active.id, { protectKey })
										})
									}),
									active.role === "seed" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Seed tail",
										min: 0,
										max: 24,
										step: 1,
										suffix: " frames",
										value: active.seedTail,
										onChange: (seedTail) => updateClip(active.id, { seedTail })
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Length",
										min: .4,
										max: active.kind === "video" ? Math.min(20, Math.max(.4, active.sourceDuration || 8)) : 8,
										step: .1,
										suffix: "s",
										value: active.length,
										onChange: (length) => updateClip(active.id, { length })
									}),
									active.kind === "video" && active.role !== "seed" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "In point",
										min: 0,
										max: Math.max(0, (active.sourceDuration || 1) - .2),
										step: .1,
										suffix: "s",
										value: active.inPoint,
										onChange: (inPoint) => updateClip(active.id, { inPoint })
									}) : null,
									active.kind === "image" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Select, {
											label: "Still motion",
											value: active.motion,
											onChange: (value) => updateClip(active.id, { motion: value }),
											children: MOTIONS.map((motion) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: motion.value,
												children: motion.label
											}, motion.value))
										}),
										active.motion !== "hold" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Motion amount",
											min: 0,
											max: 100,
											step: 1,
											value: active.motionAmount,
											onChange: (motionAmount) => updateClip(active.id, { motionAmount })
										}) : null,
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "JPEG dent before encode",
											min: 0,
											max: 100,
											step: 1,
											value: active.jpegDent,
											onChange: (jpegDent) => updateClip(active.id, { jpegDent })
										})
									] }) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-xs text-muted",
										children: "The first clip always plants the opening picture, even if it is set to motion only."
									})
								]
							}) : null,
							error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								role: "alert",
								className: "mt-4 border border-accent px-3 py-3 text-sm text-accent",
								children: error
							}) : null,
							estimate.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								role: "alert",
								className: "mt-4 border border-accent px-3 py-3 text-sm text-accent",
								children: estimate.error
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "frame sticky bottom-0 z-10 mt-4 bg-bg/95 p-3",
								children: [
									progress ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mb-3",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex justify-between text-xs text-muted",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: progress.phase }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "tabular-nums",
												children: [Math.round(progress.ratio * 100), "%"]
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2 h-0.5 bg-border",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "h-0.5 bg-accent",
												style: { width: `${Math.round(progress.ratio * 100)}%` }
											})
										})]
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "flex gap-2",
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: running || !clips.length || Boolean(estimate.error),
												onClick: () => void mosh(),
												className: "btn-hot h-12 flex-1 font-display text-lg font-bold tracking-widest disabled:opacity-40",
												children: running ? "Moshing" : "Mosh"
											}),
											running ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: () => cancelRef.current?.(),
												className: "btn-line h-12 px-4 text-sm",
												children: "Cancel"
											}) : null,
											resultUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												onClick: () => {
													fetch(resultUrl).then((response) => response.blob()).then((blob) => downloadBlob(blob, `meltroom-${Date.now()}.mp4`));
												},
												className: "btn-line flex h-12 items-center gap-2 px-4 text-sm",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), "MP4"]
											}) : null
										]
									}),
									stats ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "mt-3 text-xs text-muted",
										children: [
											stats.inputFrames,
											" in · ",
											stats.outputFrames,
											" out · ",
											Math.max(0, stats.keysBefore - stats.keysAfter),
											" keys removed · ",
											stats.donatedKeys,
											" motion keys dropped · ",
											stats.repeated,
											" repeated frames · ",
											stats.bent,
											" bent deltas",
											stats.warnings.length ? ` · ${stats.warnings.join(" ")}` : ""
										]
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-3 text-xs text-muted",
										children: "Order runs before repeats. The first keyframe is never deleted."
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
								className: "mt-4 text-xs text-muted",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
									className: "cursor-pointer text-fg",
									children: "Codec log"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
									className: "mt-2 max-h-48 overflow-auto border border-border bg-bg/80 p-3 whitespace-pre-wrap text-accent",
									children: logs.length ? logs.join("\n") : "Quiet until the next mosh."
								})]
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
						className: "frame min-w-0 p-4 lg:self-start",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-lg font-bold",
								children: "Bench"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-xs leading-relaxed text-muted",
								children: "Presets set the surgery. Every switch under them is the real operation, not a lookalike filter."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-3 flex flex-wrap gap-1",
								children: PRESETS.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									title: preset.blurb,
									onClick: () => {
										setSettings((current) => preset.apply({
											...DEFAULT_SETTINGS,
											width: current.width,
											aspect: current.aspect,
											fit: current.fit,
											fps: current.fps,
											keepAudio: current.keepAudio,
											crf: current.crf,
											quantizer: current.quantizer
										}));
										setPresetId(preset.id);
									},
									className: `h-11 px-3 text-xs tracking-wide ${presetId === preset.id ? "border border-accent bg-accent text-bg" : "border border-border bg-bg/70 text-fg"}`,
									children: preset.name
								}, preset.id))
							}),
							presetId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-2 text-xs text-muted",
								children: PRESETS.find((preset) => preset.id === presetId)?.blurb
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "kicker",
										children: "ENCODE"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-xs",
											children: "Width"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
												value: settings.width,
												options: [
													256,
													384,
													480,
													640
												].map((value) => ({
													value,
													label: String(value)
												})),
												onChange: (width) => patch({ width })
											})
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
										label: "Frame",
										value: settings.aspect,
										onChange: (value) => patch({ aspect: value }),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "16:9",
												children: "16:9"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "4:3",
												children: "4:3"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "1:1",
												children: "1:1"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "9:16",
												children: "9:16"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "source",
												children: "Source, from the first clip"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
										label: "Fit",
										value: settings.fit,
										onChange: (value) => patch({ fit: value }),
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "cover",
											children: "Cover"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "contain",
											children: "Contain"
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "py-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-xs",
											children: "Frame rate"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
												value: settings.fps,
												options: [
													8,
													12,
													15,
													24
												].map((value) => ({
													value,
													label: String(value)
												})),
												onChange: (fps) => patch({ fps })
											})
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Quantizer",
										min: 2,
										max: 12,
										step: 1,
										value: settings.quantizer,
										onChange: (quantizer) => patch({ quantizer })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "-mt-1 text-xs text-muted",
										children: "Low is sharp vectors. High is chunky blocks."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Key interval",
										min: 4,
										max: 600,
										step: 1,
										suffix: " frames",
										value: settings.gop,
										onChange: (gop) => patch({ gop })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "-mt-1 text-xs text-muted",
										children: "The encoder refuses a gap longer than 600. Shorter gaps smear a single shot once those keys are stripped."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "py-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "text-xs",
											children: "Vectors"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "mt-2",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Choice, {
												value: settings.precision,
												options: [{
													value: "fast",
													label: "Fast"
												}, {
													value: "fine",
													label: "Fine RD"
												}],
												onChange: (precision) => patch({ precision })
											})
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Bake CRF",
										min: 14,
										max: 28,
										step: 1,
										value: settings.crf,
										onChange: (crf) => patch({ crf })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Keep audio",
										hint: "Lay the first video’s audio under the bake. It will not follow melted time.",
										checked: settings.keepAudio,
										onChange: (keepAudio) => patch({ keepAudio })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Seed",
										min: 0,
										max: 9999,
										step: 1,
										value: settings.seed,
										onChange: (seed) => patch({ seed })
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "kicker",
										children: "KEY SURGERY"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
										label: "Intermediate keys",
										value: settings.keyMode,
										onChange: (value) => patch({ keyMode: value }),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "delete",
												children: "Delete them"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "replace",
												children: "Replace with the next delta"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "off",
												children: "Leave them"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Surgery start",
										min: 0,
										max: 100,
										step: 1,
										suffix: "%",
										value: settings.keyStart,
										onChange: (keyStart) => patch({ keyStart })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Surgery end",
										min: 0,
										max: 100,
										step: 1,
										suffix: "%",
										value: settings.keyEnd,
										onChange: (keyEnd) => patch({ keyEnd })
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "kicker",
										children: "DELTA ORDER"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
										label: "Reorder",
										value: settings.orderMode,
										onChange: (value) => patch({ orderMode: value }),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "off",
												children: "Leave order"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "reverse",
												children: "Reverse"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "shuffle",
												children: "Shuffle blocks"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "sort-large",
												children: "Sort largest delta first"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "sort-small",
												children: "Sort smallest delta first"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Order start",
										min: 0,
										max: 100,
										step: 1,
										suffix: "%",
										value: settings.orderStart,
										onChange: (orderStart) => patch({ orderStart })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Order end",
										min: 0,
										max: 100,
										step: 1,
										suffix: "%",
										value: settings.orderEnd,
										onChange: (orderEnd) => patch({ orderEnd })
									}),
									settings.orderMode === "shuffle" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Block",
										min: 1,
										max: 24,
										step: 1,
										suffix: " frames",
										value: settings.shuffleBlock,
										onChange: (shuffleBlock) => patch({ shuffleBlock })
									}) : null
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "kicker",
										children: "DELTA REPEAT"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Bloom",
										hint: "Repeat one delta so the same vectors accumulate.",
										checked: settings.bloomOn,
										onChange: (bloomOn) => patch({ bloomOn })
									}),
									settings.bloomOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "At",
											min: 0,
											max: 100,
											step: 1,
											suffix: "%",
											value: settings.bloomAt,
											onChange: (bloomAt) => patch({ bloomAt })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Span",
											min: 1,
											max: 8,
											step: 1,
											suffix: " frames",
											value: settings.bloomSpan,
											onChange: (bloomSpan) => patch({ bloomSpan })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Extra copies",
											min: 1,
											max: 40,
											step: 1,
											value: settings.bloomExtra,
											onChange: (bloomExtra) => patch({ bloomExtra })
										})
									] }) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Glide",
										hint: "Duplicate every delta inside a range.",
										checked: settings.glideOn,
										onChange: (glideOn) => patch({ glideOn })
									}),
									settings.glideOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Glide start",
											min: 0,
											max: 100,
											step: 1,
											suffix: "%",
											value: settings.glideStart,
											onChange: (glideStart) => patch({ glideStart })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Glide end",
											min: 0,
											max: 100,
											step: 1,
											suffix: "%",
											value: settings.glideEnd,
											onChange: (glideEnd) => patch({ glideEnd })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Copies each",
											min: 1,
											max: 8,
											step: 1,
											value: settings.glideExtra,
											onChange: (glideExtra) => patch({ glideExtra })
										})
									] }) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Pulse",
										hint: "Every few frames, repeat the next group.",
										checked: settings.pulseOn,
										onChange: (pulseOn) => patch({ pulseOn })
									}),
									settings.pulseOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Every",
											min: 2,
											max: 24,
											step: 1,
											suffix: " frames",
											value: settings.pulseEvery,
											onChange: (pulseEvery) => patch({ pulseEvery })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Group",
											min: 1,
											max: 8,
											step: 1,
											value: settings.pulseGroup,
											onChange: (pulseGroup) => patch({ pulseGroup })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Extra pulses",
											min: 1,
											max: 8,
											step: 1,
											value: settings.pulseExtra,
											onChange: (pulseExtra) => patch({ pulseExtra })
										})
									] }) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Echo",
										hint: "Repeat a whole span of deltas.",
										checked: settings.echoOn,
										onChange: (echoOn) => patch({ echoOn })
									}),
									settings.echoOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Echo start",
											min: 0,
											max: 100,
											step: 1,
											suffix: "%",
											value: settings.echoStart,
											onChange: (echoStart) => patch({ echoStart })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Echo end",
											min: 0,
											max: 100,
											step: 1,
											suffix: "%",
											value: settings.echoEnd,
											onChange: (echoEnd) => patch({ echoEnd })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Echoes",
											min: 1,
											max: 6,
											step: 1,
											value: settings.echoExtra,
											onChange: (echoExtra) => patch({ echoExtra })
										})
									] }) : null
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "kicker",
										children: "DATABEND"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Bend delta bytes",
										hint: "Mutate P-frame payloads after the VOP header. Start codes are left alone.",
										checked: settings.bendOn,
										onChange: (bendOn) => patch({ bendOn })
									}),
									settings.bendOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
											label: "Bend",
											value: settings.bendMode,
											onChange: (value) => patch({ bendMode: value }),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "xor",
													children: "XOR"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "repeat",
													children: "Repeat a slice"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "shift",
													children: "Rotate bytes"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "swap",
													children: "Swap two slices"
												})
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "Intensity",
											min: 1,
											max: 100,
											step: 1,
											value: settings.bendIntensity,
											onChange: (bendIntensity) => patch({ bendIntensity })
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
											label: "How many deltas",
											min: 1,
											max: 100,
											step: 1,
											suffix: "%",
											value: settings.bendFrequency,
											onChange: (bendFrequency) => patch({ bendFrequency })
										})
									] }) : null
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-2 border-t border-border pt-3",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										className: "kicker",
										children: "AFTER THE MELT"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 text-xs text-muted",
										children: "These run on the decoded picture while it is baked. They are not the mosh."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Channel shift",
										hint: "Offset R and B on the baked frames.",
										checked: settings.shiftOn,
										onChange: (shiftOn) => patch({ shiftOn })
									}),
									settings.shiftOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Shift",
										min: 1,
										max: 40,
										step: 1,
										suffix: " px",
										value: settings.shiftPixels,
										onChange: (shiftPixels) => patch({ shiftPixels })
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Chroma shift",
										hint: "Pull Cb and Cr apart.",
										checked: settings.chromaOn,
										onChange: (chromaOn) => patch({ chromaOn })
									}),
									settings.chromaOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Chroma",
										min: 1,
										max: 40,
										step: 1,
										suffix: " px",
										value: settings.chromaPixels,
										onChange: (chromaPixels) => patch({ chromaPixels })
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Noise",
										hint: "Add temporal noise on the bake.",
										checked: settings.noiseOn,
										onChange: (noiseOn) => patch({ noiseOn })
									}),
									settings.noiseOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Amount",
										min: 1,
										max: 40,
										step: 1,
										value: settings.noiseAmount,
										onChange: (noiseAmount) => patch({ noiseAmount })
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Phosphor trail",
										hint: "lagfun. Dark pixels update slowly.",
										checked: settings.trailOn,
										onChange: (trailOn) => patch({ trailOn })
									}),
									settings.trailOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Decay",
										min: 70,
										max: 99,
										step: 1,
										value: settings.trailDecay,
										onChange: (trailDecay) => patch({ trailDecay })
									}) : null,
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
										label: "Amplify change",
										hint: "Exaggerate frame-to-frame difference on the bake.",
										checked: settings.amplifyOn,
										onChange: (amplifyOn) => patch({ amplifyOn })
									}),
									settings.amplifyOn ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
										label: "Factor",
										min: 2,
										max: 8,
										step: 1,
										value: settings.amplifyFactor,
										onChange: (amplifyFactor) => patch({ amplifyFactor })
									}) : null
								]
							})
						]
					})]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: "mx-auto max-w-6xl px-4 py-6",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "max-w-xl text-sm text-muted",
								children: "JPEG entropy denting. Bytes inside the scan are repeated, moved, or deleted without forging markers. This is the still-image cousin of a datamosh, not a pixel shader."
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex min-h-40 flex-col items-start justify-center border border-dashed border-accent/50 bg-bg/40 p-5",
								onDragOver: (event) => event.preventDefault(),
								onDrop: (event) => {
									event.preventDefault();
									if (event.dataTransfer.files?.length) addStills(event.dataTransfer.files);
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => stillRef.current?.click(),
									className: "btn-hot h-11 px-4 text-sm font-display tracking-widest",
									children: "Add stills"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-3 text-xs text-muted",
									children: "PNG, JPEG, WebP. They are re-encoded to JPEG, then the scan is bent."
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								ref: stillRef,
								type: "file",
								accept: "image/*",
								multiple: true,
								className: "sr-only",
								onChange: (event) => {
									if (event.target.files) addStills(event.target.files);
									event.target.value = "";
								}
							}),
							error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								role: "alert",
								className: "mt-4 border border-accent px-3 py-3 text-sm text-accent",
								children: error
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2",
								children: stills.map((still) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figure", {
									className: "frame p-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "grid grid-cols-2 gap-2",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: still.url,
											alt: still.name,
											className: "aspect-square w-full object-cover"
										}), still.resultUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
											src: still.resultUrl,
											alt: `Dented ${still.name}`,
											className: "aspect-square w-full object-cover"
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "flex aspect-square items-center justify-center bg-bg text-xs text-muted",
											children: "Waiting"
										})]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("figcaption", {
										className: "mt-2 flex items-center justify-between gap-2 text-xs",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "truncate",
											children: still.error ?? still.name
										}), still.resultBytes ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											className: "btn-line h-10 shrink-0 px-3",
											onClick: () => {
												const bytes = still.resultBytes;
												if (!bytes) return;
												downloadBlob(new Blob([bytes.buffer], { type: "image/jpeg" }), still.name.replace(/\.\w+$/, "") + "-dent.jpg");
											},
											children: "Save"
										}) : null]
									})]
								}, still.id))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 flex flex-wrap gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: denting || !stills.length,
									onClick: () => void dentStills(),
									className: "btn-hot h-12 px-5 font-display text-lg font-bold tracking-widest disabled:opacity-40",
									children: denting ? "Denting" : "Dent JPEGs"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									disabled: !stills.some((still) => still.resultBytes),
									onClick: () => {
										const files = stills.flatMap((still) => still.resultBytes ? [{
											name: still.name.replace(/\.\w+$/, "") + "-dent.jpg",
											data: still.resultBytes
										}] : []);
										downloadBlob(new Blob([zipStore(files)], { type: "application/zip" }), "meltroom-stills.zip");
									},
									className: "btn-line h-12 px-4 text-sm disabled:opacity-40",
									children: "Download zip"
								})]
							})
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
							className: "frame p-4 lg:self-start",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
									className: "font-display text-lg font-bold",
									children: "Scan"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									label: "Operation",
									value: jpegMode,
									onChange: (value) => setJpegMode(value),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "repeat",
											children: "Repeat a slice"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "delete",
											children: "Delete a slice"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "swap",
											children: "Swap two slices"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
											value: "shift",
											children: "Move a slice"
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
									label: "Passes",
									min: 1,
									max: 24,
									step: 1,
									value: jpegPasses,
									onChange: setJpegPasses
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
									label: "Slice size",
									min: 8,
									max: 100,
									step: 1,
									value: jpegIntensity,
									onChange: setJpegIntensity
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
									label: "JPEG quality",
									min: .4,
									max: .95,
									step: .01,
									value: jpegQuality,
									onChange: setJpegQuality
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Range, {
									label: "Seed",
									min: 0,
									max: 9999,
									step: 1,
									value: jpegSeed,
									onChange: setJpegSeed
								})
							]
						})]
					})
				})]
			})
		]
	});
}
var routes_exports = /* @__PURE__ */ __exportAll({ component: () => Home });
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Meltroom, {});
}
//#endregion
export { encodeCount as a, rebuildAvi as c, clamp as i, moshFrames as n, frameSize as o, glitchJpeg as r, parseAvi as s, routes_exports as t };
