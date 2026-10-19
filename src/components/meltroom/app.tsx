import { useEffect, useMemo, useRef, useState } from "react";
import { MatrixField } from "@/components/meltroom/matrix-field";
import * as Slider from "@radix-ui/react-slider";
import * as Switch from "@radix-ui/react-switch";
import { ArrowDown, ArrowUp, Download, Plus, Trash2 } from "lucide-react";
import { glitchJpeg, zipStore, type JpegMode } from "@/lib/mosh/jpeg";
import { estimateMosh, type MoshStats } from "@/lib/mosh/ops";
import {
  DEFAULT_SETTINGS,
  PRESETS,
  encodeCount,
  frameSize,
  sanitizeSettings,
  type Clip,
  type ImageMotion,
  type Role,
  type Settings,
} from "@/lib/mosh/types";

const STORAGE_KEY = "meltroom-settings-v1";

const MOTIONS: { value: ImageMotion; label: string }[] = [
  { value: "hold", label: "Hold" },
  { value: "push", label: "Push in" },
  { value: "pull", label: "Pull out" },
  { value: "pan-left", label: "Pan left" },
  { value: "pan-right", label: "Pan right" },
  { value: "pan-up", label: "Pan up" },
  { value: "pan-down", label: "Pan down" },
  { value: "drift", label: "Drift" },
  { value: "orbit", label: "Orbit" },
  { value: "pulse", label: "Pulse" },
];

const ROLES: { value: Role; label: string; hint: string }[] = [
  { value: "full", label: "Picture + motion", hint: "Keep this clip’s key and its vectors." },
  { value: "seed", label: "Seed picture", hint: "Keep the opening picture. Later motion paints onto it." },
  { value: "motion", label: "Motion only", hint: "Drop this clip’s picture and donate its vectors." },
];

type StillItem = {
  id: string;
  file: File;
  name: string;
  url: string;
  resultUrl?: string;
  resultBytes?: Uint8Array<ArrayBuffer>;
  error?: string;
};

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function probeFile(file: File): Promise<{ kind: "video" | "image"; duration: number; width: number; height: number }> {
  const image =
    file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
  if (image) {
    const bitmap = await createImageBitmap(file);
    const meta = { kind: "image" as const, duration: 0, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return meta;
  }
  const url = URL.createObjectURL(file);
  try {
    const meta = await new Promise<{ w: number; h: number; d: number }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve({ w: video.videoWidth, h: video.videoHeight, d: video.duration });
      video.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      video.src = url;
    });
    return {
      kind: "video",
      duration: Number.isFinite(meta.d) ? meta.d : 0,
      width: meta.w,
      height: meta.h,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function makeClip(file: File, role?: Role): Promise<Clip> {
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
    length: kind === "video" ? Math.min(4, Math.max(0.4, meta.duration || 4)) : 1.6,
    motion: kind === "image" ? "push" : "hold",
    motionAmount: 70,
    jpegDent: 0,
  };
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span>{label}</span>
        <span className="text-muted tabular-nums">
          {Number.isInteger(step) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {suffix ?? ""}
        </span>
      </div>
      <Slider.Root
        className="relative mt-3 flex h-11 w-full touch-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      >
        <Slider.Track className="relative h-0.5 grow bg-border">
          <Slider.Range className="absolute h-0.5 bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block size-4 rotate-45 border-2 border-accent bg-bg" />
      </Slider.Root>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="relative h-11 w-16 shrink-0 border border-border bg-bg data-[state=checked]:border-accent data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="absolute top-1.5 left-1 block size-8 bg-muted transition-transform data-[state=checked]:translate-x-7 data-[state=checked]:bg-bg" />
      </Switch.Root>
    </div>
  );
}

function Choice<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={`h-11 border px-3 text-xs tracking-wide ${on ? "border-accent bg-accent text-bg" : "border-border bg-bg/70 text-fg"}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block py-2 text-xs">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full border border-border bg-bg px-3 text-sm text-fg"
      >
        {children}
      </select>
    </label>
  );
}

function Clock() {
  const [stamp, setStamp] = useState("--:--:--");
  useEffect(() => {
    const tick = () => setStamp(new Date().toISOString().slice(11, 19));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="hidden text-xs tracking-widest text-accent tabular-nums sm:block" aria-hidden>
      SYS {stamp}Z
    </p>
  );
}

export function Meltroom() {
  const [mode, setMode] = useState<"bench" | "stills">("bench");
  const [clips, setClips] = useState<Clip[]>([]);
  const [selected, setSelected] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [presetId, setPresetId] = useState<string | null>("cut-melt");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; ratio: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<MoshStats | null>(null);
  const [stills, setStills] = useState<StillItem[]>([]);
  const [jpegMode, setJpegMode] = useState<JpegMode>("repeat");
  const [jpegPasses, setJpegPasses] = useState(6);
  const [jpegIntensity, setJpegIntensity] = useState(36);
  const [jpegQuality, setJpegQuality] = useState(0.72);
  const [jpegSeed, setJpegSeed] = useState(4);
  const [denting, setDenting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stillRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<null | (() => void)>(null);
  const resultRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings(sanitizeSettings(JSON.parse(raw)));
    } catch {
      /* ignore broken storage */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    return () => {
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
    };
  }, []);

  const patch = (partial: Partial<Settings>) => {
    setPresetId(null);
    setSettings((current) => ({ ...current, ...partial }));
  };

  const size = frameSize(
    settings.width,
    settings.aspect,
    clips[0]?.width ?? 0,
    clips[0]?.height ?? 0,
  );

  const estimate = useMemo(() => {
    if (!clips.length) return { stats: null as MoshStats | null, error: null as string | null };
    try {
      return { stats: estimateMosh(clips, settings), error: null };
    } catch (caught) {
      return { stats: null, error: caught instanceof Error ? caught.message : "This setup is too heavy." };
    }
  }, [clips, settings]);

  const active = clips[selected] ?? clips[0];

  const updateClip = (id: string, partial: Partial<Clip>) => {
    setClips((current) => current.map((clip) => (clip.id === id ? { ...clip, ...partial } : clip)));
  };

  const addFiles = async (list: FileList | File[]) => {
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

  const removeClip = (index: number) => {
    setClips((current) => {
      const clip = current[index];
      if (clip) URL.revokeObjectURL(clip.url);
      return current.filter((_, i) => i !== index);
    });
    setSelected((value) => Math.max(0, Math.min(value, clips.length - 2)));
  };

  const moveClip = (index: number, dir: -1 | 1) => {
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
    setProgress({ phase: "Loading the demo reels", ratio: 0.4 });
    try {
      const specs: { href: string; name: string; type: string; role: Role }[] = [
        { href: "/demo/seed.png", name: "seed.png", type: "image/png", role: "seed" },
        { href: "/demo/rake.mp4", name: "rake.mp4", type: "video/mp4", role: "motion" },
        { href: "/demo/blocks.mp4", name: "blocks.mp4", type: "video/mp4", role: "motion" },
      ];
      const made: Clip[] = [];
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
      setSettings((current) => PRESETS[0].apply({ ...current, width: 480, fps: 12, quantizer: 3 }));
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
    setProgress({ phase: "Starting the codec engine", ratio: 0 });
    try {
      const engine = await import("@/lib/mosh/engine");
      cancelRef.current = engine.cancelMosh;
      const result = await engine.runMosh({
        clips,
        settings,
        onProgress: setProgress,
        onLog: (line) => setLogs((prev) => [...prev.slice(-70), line]),
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

  const addStills = (list: FileList | File[]) => {
    const images = [...list].filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));
    if (!images.length) {
      setError("Stills mode wants images.");
      return;
    }
    setError(null);
    setStills((current) => [
      ...current,
      ...images.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const dentStills = async () => {
    setDenting(true);
    setError(null);
    const next: StillItem[] = [];
    for (const still of stills) {
      try {
        const bitmap = await createImageBitmap(still.file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not draw.");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("JPEG encode failed."))), "image/jpeg", jpegQuality);
        });
        let bytes = new Uint8Array(await blob.arrayBuffer());
        let decoded = false;
        let passes = jpegPasses;
        let packed: Uint8Array<ArrayBuffer> | null = null;
        for (let attempt = 0; attempt < 4 && !decoded; attempt++) {
          const result = glitchJpeg(bytes, { seed: jpegSeed + attempt * 101, passes, mode: jpegMode, intensity: jpegIntensity });
          const nextPacked = new Uint8Array(new ArrayBuffer(result.byteLength));
          nextPacked.set(result);
          const url = URL.createObjectURL(new Blob([nextPacked.buffer], { type: "image/jpeg" }));
          decoded = await new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
          });
          URL.revokeObjectURL(url);
          if (decoded) packed = nextPacked;
          passes = Math.max(1, Math.floor(passes / 2));
        }
        if (!decoded || !packed) {
          next.push({ ...still, error: "The JPEG decoder rejected every dent. Lower the passes.", resultUrl: undefined, resultBytes: undefined });
        } else {
          if (still.resultUrl) URL.revokeObjectURL(still.resultUrl);
          next.push({
            ...still,
            error: undefined,
            resultBytes: packed,
            resultUrl: URL.createObjectURL(new Blob([packed.buffer], { type: "image/jpeg" })),
          });
        }
      } catch (caught) {
        next.push({ ...still, error: caught instanceof Error ? caught.message : "Dent failed." });
      }
    }
    setStills(next);
    setDenting(false);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-fg">
      <MatrixField />
      <div className="scanlines pointer-events-none fixed inset-0 z-20" aria-hidden />
      <div className="sweep pointer-events-none fixed inset-x-0 top-0 z-[1]" aria-hidden />
      <div className="relative z-10">
      <header className="border-b border-border bg-bg/80">
        <div className="h-0.5 bg-accent" aria-hidden />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center border border-accent" aria-hidden>
              <span className="sigil-core size-2 bg-accent" />
            </span>
            <div>
              <h1 className="font-display text-2xl leading-none font-bold tracking-widest text-accent">
                MELTROOM
                <span className="caret" aria-hidden />
              </h1>
              <p className="mt-1 text-xs text-muted">
                <span className="text-accent">root</span>@codec · mpeg-4 asp datamosh
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock />
            <div className="flex gap-1" role="tablist" aria-label="Mode">
              {(
                [
                  ["bench", "Vectors"],
                  ["stills", "Stills"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => setMode(id)}
                  className={`h-11 border px-4 text-xs tracking-widest ${mode === id ? "border-accent bg-accent text-bg" : "border-border bg-bg/70 text-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {mode === "bench" ? (
        <main className="mx-auto grid max-w-6xl gap-8 px-4 py-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.85fr)]">
          <section className="min-w-0">
            <div
              className="frame frame-stage relative"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (event.dataTransfer.files?.length) void addFiles(event.dataTransfer.files);
              }}
            >
              {resultUrl ? (
                <video key={resultUrl} src={resultUrl} controls playsInline className="aspect-video w-full bg-bg object-contain" />
              ) : active ? (
                active.kind === "video" ? (
                  <video src={active.url} controls playsInline className="aspect-video w-full bg-bg object-contain" />
                ) : (
                  <img src={active.url} alt={active.name} className="aspect-video w-full bg-bg object-contain" />
                )
              ) : (
                <div className="stage-scrim flex aspect-video flex-col items-start justify-end gap-3 p-5">
                  <p className="text-xs tracking-widest text-accent">AWAITING INPUT</p>
                  <p className="max-w-md font-display text-3xl leading-none font-bold tracking-tight">
                    Drop shots. Keep one picture. Steal the motion.
                  </p>
                  <p className="max-w-md text-sm text-muted">
                    Clips are encoded as MPEG-4 with no B-frames. Keyframes and delta frames are cut in the AVI, then decoded so the vectors stick. The download is a normal MP4.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted tabular-nums">
              <span>
                {size.w}×{size.h}
              </span>
              <span>{settings.fps} fps</span>
              <span>q{settings.quantizer}</span>
              <span>gop {settings.gop}</span>
              <span>b-frames off</span>
              {estimate.stats ? <span>{estimate.stats.outputFrames} frames out</span> : null}
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {clips.map((clip, index) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => setSelected(index)}
                  className={`w-28 shrink-0 border p-1 text-left ${index === selected ? "border-accent bg-bg/80" : "border-border bg-bg/50"}`}
                >
                  {clip.kind === "video" ? (
                    <video src={clip.url} muted className="aspect-video w-full bg-bg object-cover" />
                  ) : (
                    <img src={clip.url} alt="" className="aspect-video w-full bg-bg object-cover" />
                  )}
                  <span className="mt-1 block truncate text-xs">{clip.name}</span>
                  <span className="text-xs text-muted">
                    {index + 1} · {clip.role}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-video w-28 shrink-0 flex-col items-center justify-center gap-2 border border-dashed border-accent/50 bg-bg/40 text-xs text-muted"
              >
                <Plus className="size-4" />
                Add
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,image/*"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
            />

            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="btn-line h-11 px-4 text-sm">
                Add media
              </button>
              <button type="button" onClick={() => void loadDemo()} className="btn-line h-11 px-4 text-sm">
                Load demo
              </button>
              {clips.length ? (
                <button
                  type="button"
                  onClick={() => {
                    clips.forEach((clip) => URL.revokeObjectURL(clip.url));
                    setClips([]);
                    setStats(null);
                  }}
                  className="h-11 px-4 text-sm text-muted"
                >
                  Clear timeline
                </button>
              ) : null}
            </div>

            {active ? (
              <div className="frame mt-5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-xl font-bold">{active.name}</h2>
                    <p className="text-xs text-muted">
                      {active.kind === "video"
                        ? `${active.sourceDuration.toFixed(1)}s source · using ${active.length.toFixed(1)}s from ${active.inPoint.toFixed(1)}s`
                        : `${active.width}×${active.height} still`}
                      {" · "}
                      {encodeCount(active, settings.fps)} encoded frames
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label="Move earlier" onClick={() => moveClip(selected, -1)} className="flex size-11 items-center justify-center border border-border">
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" aria-label="Move later" onClick={() => moveClip(selected, 1)} className="flex size-11 items-center justify-center border border-border">
                      <ArrowDown className="size-4" />
                    </button>
                    <button type="button" aria-label="Remove clip" onClick={() => removeClip(selected)} className="flex size-11 items-center justify-center border border-border">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <Select label="Contribution" value={active.role} onChange={(value) => updateClip(active.id, { role: value as Role })}>
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted">{ROLES.find((role) => role.value === active.role)?.hint}</p>
                <div className="mt-3">
                  <Toggle
                    label="Hard cut"
                    hint="Protect this clip’s keyframe so the melt resets instead of pouring through."
                    checked={active.protectKey}
                    onChange={(protectKey) => updateClip(active.id, { protectKey })}
                  />
                </div>
                {active.role === "seed" ? (
                  <Range label="Seed tail" min={0} max={24} step={1} suffix=" frames" value={active.seedTail} onChange={(seedTail) => updateClip(active.id, { seedTail })} />
                ) : (
                  <Range
                    label="Length"
                    min={0.4}
                    max={active.kind === "video" ? Math.min(20, Math.max(0.4, active.sourceDuration || 8)) : 8}
                    step={0.1}
                    suffix="s"
                    value={active.length}
                    onChange={(length) => updateClip(active.id, { length })}
                  />
                )}
                {active.kind === "video" && active.role !== "seed" ? (
                  <Range
                    label="In point"
                    min={0}
                    max={Math.max(0, (active.sourceDuration || 1) - 0.2)}
                    step={0.1}
                    suffix="s"
                    value={active.inPoint}
                    onChange={(inPoint) => updateClip(active.id, { inPoint })}
                  />
                ) : null}
                {active.kind === "image" ? (
                  <>
                    <Select label="Still motion" value={active.motion} onChange={(value) => updateClip(active.id, { motion: value as ImageMotion })}>
                      {MOTIONS.map((motion) => (
                        <option key={motion.value} value={motion.value}>
                          {motion.label}
                        </option>
                      ))}
                    </Select>
                    {active.motion !== "hold" ? (
                      <Range label="Motion amount" min={0} max={100} step={1} value={active.motionAmount} onChange={(motionAmount) => updateClip(active.id, { motionAmount })} />
                    ) : null}
                    <Range label="JPEG dent before encode" min={0} max={100} step={1} value={active.jpegDent} onChange={(jpegDent) => updateClip(active.id, { jpegDent })} />
                  </>
                ) : null}
                <p className="mt-2 text-xs text-muted">The first clip always plants the opening picture, even if it is set to motion only.</p>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="mt-4 border border-accent px-3 py-3 text-sm text-accent">
                {error}
              </p>
            ) : null}
            {estimate.error ? (
              <p role="alert" className="mt-4 border border-accent px-3 py-3 text-sm text-accent">
                {estimate.error}
              </p>
            ) : null}

            <div className="frame sticky bottom-0 z-10 mt-4 bg-bg/95 p-3">
              {progress ? (
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{progress.phase}</span>
                    <span className="tabular-nums">{Math.round(progress.ratio * 100)}%</span>
                  </div>
                  <div className="mt-2 h-0.5 bg-border">
                    <div className="h-0.5 bg-accent" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
                  </div>
                </div>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={running || !clips.length || Boolean(estimate.error)}
                  onClick={() => void mosh()}
                  className="btn-hot h-12 flex-1 font-display text-lg font-bold tracking-widest disabled:opacity-40"
                >
                  {running ? "Moshing" : "Mosh"}
                </button>
                {running ? (
                  <button type="button" onClick={() => cancelRef.current?.()} className="btn-line h-12 px-4 text-sm">
                    Cancel
                  </button>
                ) : null}
                {resultUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      void fetch(resultUrl)
                        .then((response) => response.blob())
                        .then((blob) => downloadBlob(blob, `meltroom-${Date.now()}.mp4`));
                    }}
                    className="btn-line flex h-12 items-center gap-2 px-4 text-sm"
                  >
                    <Download className="size-4" />
                    MP4
                  </button>
                ) : null}
              </div>
              {stats ? (
                <p className="mt-3 text-xs text-muted">
                  {stats.inputFrames} in · {stats.outputFrames} out · {Math.max(0, stats.keysBefore - stats.keysAfter)} keys removed · {stats.donatedKeys} motion keys dropped · {stats.repeated} repeated frames · {stats.bent} bent deltas
                  {stats.warnings.length ? ` · ${stats.warnings.join(" ")}` : ""}
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted">Order runs before repeats. The first keyframe is never deleted.</p>
              )}
            </div>

            <details className="mt-4 text-xs text-muted">
              <summary className="cursor-pointer text-fg">Codec log</summary>
              <pre className="mt-2 max-h-48 overflow-auto border border-border bg-bg/80 p-3 whitespace-pre-wrap text-accent">{logs.length ? logs.join("\n") : "Quiet until the next mosh."}</pre>
            </details>
          </section>

          <aside className="frame min-w-0 p-4 lg:self-start">
            <h2 className="font-display text-lg font-bold">Bench</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">Presets set the surgery. Every switch under them is the real operation, not a lookalike filter.</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.blurb}
                  onClick={() => {
                    setSettings((current) => preset.apply({ ...DEFAULT_SETTINGS, width: current.width, aspect: current.aspect, fit: current.fit, fps: current.fps, keepAudio: current.keepAudio, crf: current.crf, quantizer: current.quantizer }));
                    setPresetId(preset.id);
                  }}
                  className={`h-11 px-3 text-xs tracking-wide ${presetId === preset.id ? "border border-accent bg-accent text-bg" : "border border-border bg-bg/70 text-fg"}`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            {presetId ? <p className="mt-2 text-xs text-muted">{PRESETS.find((preset) => preset.id === presetId)?.blurb}</p> : null}

            <div className="mt-4 border-t border-border pt-3">
              <h3 className="kicker">ENCODE</h3>
              <div className="mt-2">
                <span className="text-xs">Width</span>
                <div className="mt-2">
                  <Choice value={settings.width} options={[256, 384, 480, 640].map((value) => ({ value, label: String(value) }))} onChange={(width) => patch({ width })} />
                </div>
              </div>
              <Select label="Frame" value={settings.aspect} onChange={(value) => patch({ aspect: value as Settings["aspect"] })}>
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
                <option value="1:1">1:1</option>
                <option value="9:16">9:16</option>
                <option value="source">Source, from the first clip</option>
              </Select>
              <Select label="Fit" value={settings.fit} onChange={(value) => patch({ fit: value as Settings["fit"] })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </Select>
              <div className="py-2">
                <span className="text-xs">Frame rate</span>
                <div className="mt-2">
                  <Choice value={settings.fps} options={[8, 12, 15, 24].map((value) => ({ value, label: String(value) }))} onChange={(fps) => patch({ fps })} />
                </div>
              </div>
              <Range label="Quantizer" min={2} max={12} step={1} value={settings.quantizer} onChange={(quantizer) => patch({ quantizer })} />
              <p className="-mt-1 text-xs text-muted">Low is sharp vectors. High is chunky blocks.</p>
              <Range label="Key interval" min={4} max={600} step={1} suffix=" frames" value={settings.gop} onChange={(gop) => patch({ gop })} />
              <p className="-mt-1 text-xs text-muted">The encoder refuses a gap longer than 600. Shorter gaps smear a single shot once those keys are stripped.</p>
              <div className="py-2">
                <span className="text-xs">Vectors</span>
                <div className="mt-2">
                  <Choice
                    value={settings.precision}
                    options={[
                      { value: "fast", label: "Fast" },
                      { value: "fine", label: "Fine RD" },
                    ]}
                    onChange={(precision) => patch({ precision })}
                  />
                </div>
              </div>
              <Range label="Bake CRF" min={14} max={28} step={1} value={settings.crf} onChange={(crf) => patch({ crf })} />
              <Toggle label="Keep audio" hint="Lay the first video’s audio under the bake. It will not follow melted time." checked={settings.keepAudio} onChange={(keepAudio) => patch({ keepAudio })} />
              <Range label="Seed" min={0} max={9999} step={1} value={settings.seed} onChange={(seed) => patch({ seed })} />
            </div>

            <div className="mt-2 border-t border-border pt-3">
              <h3 className="kicker">KEY SURGERY</h3>
              <Select label="Intermediate keys" value={settings.keyMode} onChange={(value) => patch({ keyMode: value as Settings["keyMode"] })}>
                <option value="delete">Delete them</option>
                <option value="replace">Replace with the next delta</option>
                <option value="off">Leave them</option>
              </Select>
              <Range label="Surgery start" min={0} max={100} step={1} suffix="%" value={settings.keyStart} onChange={(keyStart) => patch({ keyStart })} />
              <Range label="Surgery end" min={0} max={100} step={1} suffix="%" value={settings.keyEnd} onChange={(keyEnd) => patch({ keyEnd })} />
            </div>

            <div className="mt-2 border-t border-border pt-3">
              <h3 className="kicker">DELTA ORDER</h3>
              <Select label="Reorder" value={settings.orderMode} onChange={(value) => patch({ orderMode: value as Settings["orderMode"] })}>
                <option value="off">Leave order</option>
                <option value="reverse">Reverse</option>
                <option value="shuffle">Shuffle blocks</option>
                <option value="sort-large">Sort largest delta first</option>
                <option value="sort-small">Sort smallest delta first</option>
              </Select>
              <Range label="Order start" min={0} max={100} step={1} suffix="%" value={settings.orderStart} onChange={(orderStart) => patch({ orderStart })} />
              <Range label="Order end" min={0} max={100} step={1} suffix="%" value={settings.orderEnd} onChange={(orderEnd) => patch({ orderEnd })} />
              {settings.orderMode === "shuffle" ? (
                <Range label="Block" min={1} max={24} step={1} suffix=" frames" value={settings.shuffleBlock} onChange={(shuffleBlock) => patch({ shuffleBlock })} />
              ) : null}
            </div>

            <div className="mt-2 border-t border-border pt-3">
              <h3 className="kicker">DELTA REPEAT</h3>
              <Toggle label="Bloom" hint="Repeat one delta so the same vectors accumulate." checked={settings.bloomOn} onChange={(bloomOn) => patch({ bloomOn })} />
              {settings.bloomOn ? (
                <>
                  <Range label="At" min={0} max={100} step={1} suffix="%" value={settings.bloomAt} onChange={(bloomAt) => patch({ bloomAt })} />
                  <Range label="Span" min={1} max={8} step={1} suffix=" frames" value={settings.bloomSpan} onChange={(bloomSpan) => patch({ bloomSpan })} />
                  <Range label="Extra copies" min={1} max={40} step={1} value={settings.bloomExtra} onChange={(bloomExtra) => patch({ bloomExtra })} />
                </>
              ) : null}
              <Toggle label="Glide" hint="Duplicate every delta inside a range." checked={settings.glideOn} onChange={(glideOn) => patch({ glideOn })} />
              {settings.glideOn ? (
                <>
                  <Range label="Glide start" min={0} max={100} step={1} suffix="%" value={settings.glideStart} onChange={(glideStart) => patch({ glideStart })} />
                  <Range label="Glide end" min={0} max={100} step={1} suffix="%" value={settings.glideEnd} onChange={(glideEnd) => patch({ glideEnd })} />
                  <Range label="Copies each" min={1} max={8} step={1} value={settings.glideExtra} onChange={(glideExtra) => patch({ glideExtra })} />
                </>
              ) : null}
              <Toggle label="Pulse" hint="Every few frames, repeat the next group." checked={settings.pulseOn} onChange={(pulseOn) => patch({ pulseOn })} />
              {settings.pulseOn ? (
                <>
                  <Range label="Every" min={2} max={24} step={1} suffix=" frames" value={settings.pulseEvery} onChange={(pulseEvery) => patch({ pulseEvery })} />
                  <Range label="Group" min={1} max={8} step={1} value={settings.pulseGroup} onChange={(pulseGroup) => patch({ pulseGroup })} />
                  <Range label="Extra pulses" min={1} max={8} step={1} value={settings.pulseExtra} onChange={(pulseExtra) => patch({ pulseExtra })} />
                </>
              ) : null}
              <Toggle label="Echo" hint="Repeat a whole span of deltas." checked={settings.echoOn} onChange={(echoOn) => patch({ echoOn })} />
              {settings.echoOn ? (
                <>
                  <Range label="Echo start" min={0} max={100} step={1} suffix="%" value={settings.echoStart} onChange={(echoStart) => patch({ echoStart })} />
                  <Range label="Echo end" min={0} max={100} step={1} suffix="%" value={settings.echoEnd} onChange={(echoEnd) => patch({ echoEnd })} />
                  <Range label="Echoes" min={1} max={6} step={1} value={settings.echoExtra} onChange={(echoExtra) => patch({ echoExtra })} />
                </>
              ) : null}
            </div>

            <div className="mt-2 border-t border-border pt-3">
              <h3 className="kicker">DATABEND</h3>
              <Toggle label="Bend delta bytes" hint="Mutate P-frame payloads after the VOP header. Start codes are left alone." checked={settings.bendOn} onChange={(bendOn) => patch({ bendOn })} />
              {settings.bendOn ? (
                <>
                  <Select label="Bend" value={settings.bendMode} onChange={(value) => patch({ bendMode: value as Settings["bendMode"] })}>
                    <option value="xor">XOR</option>
                    <option value="repeat">Repeat a slice</option>
                    <option value="shift">Rotate bytes</option>
                    <option value="swap">Swap two slices</option>
                  </Select>
                  <Range label="Intensity" min={1} max={100} step={1} value={settings.bendIntensity} onChange={(bendIntensity) => patch({ bendIntensity })} />
                  <Range label="How many deltas" min={1} max={100} step={1} suffix="%" value={settings.bendFrequency} onChange={(bendFrequency) => patch({ bendFrequency })} />
                </>
              ) : null}
            </div>

            <div className="mt-2 border-t border-border pt-3">
              <h3 className="kicker">AFTER THE MELT</h3>
              <p className="mt-1 text-xs text-muted">These run on the decoded picture while it is baked. They are not the mosh.</p>
              <Toggle label="Channel shift" hint="Offset R and B on the baked frames." checked={settings.shiftOn} onChange={(shiftOn) => patch({ shiftOn })} />
              {settings.shiftOn ? <Range label="Shift" min={1} max={40} step={1} suffix=" px" value={settings.shiftPixels} onChange={(shiftPixels) => patch({ shiftPixels })} /> : null}
              <Toggle label="Chroma shift" hint="Pull Cb and Cr apart." checked={settings.chromaOn} onChange={(chromaOn) => patch({ chromaOn })} />
              {settings.chromaOn ? <Range label="Chroma" min={1} max={40} step={1} suffix=" px" value={settings.chromaPixels} onChange={(chromaPixels) => patch({ chromaPixels })} /> : null}
              <Toggle label="Noise" hint="Add temporal noise on the bake." checked={settings.noiseOn} onChange={(noiseOn) => patch({ noiseOn })} />
              {settings.noiseOn ? <Range label="Amount" min={1} max={40} step={1} value={settings.noiseAmount} onChange={(noiseAmount) => patch({ noiseAmount })} /> : null}
              <Toggle label="Phosphor trail" hint="lagfun. Dark pixels update slowly." checked={settings.trailOn} onChange={(trailOn) => patch({ trailOn })} />
              {settings.trailOn ? <Range label="Decay" min={70} max={99} step={1} value={settings.trailDecay} onChange={(trailDecay) => patch({ trailDecay })} /> : null}
              <Toggle label="Amplify change" hint="Exaggerate frame-to-frame difference on the bake." checked={settings.amplifyOn} onChange={(amplifyOn) => patch({ amplifyOn })} />
              {settings.amplifyOn ? <Range label="Factor" min={2} max={8} step={1} value={settings.amplifyFactor} onChange={(amplifyFactor) => patch({ amplifyFactor })} /> : null}
            </div>
          </aside>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl px-4 py-6">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <section>
              <p className="max-w-xl text-sm text-muted">
                JPEG entropy denting. Bytes inside the scan are repeated, moved, or deleted without forging markers. This is the still-image cousin of a datamosh, not a pixel shader.
              </p>
              <div
                className="mt-4 flex min-h-40 flex-col items-start justify-center border border-dashed border-accent/50 bg-bg/40 p-5"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.files?.length) addStills(event.dataTransfer.files);
                }}
              >
                <button type="button" onClick={() => stillRef.current?.click()} className="btn-hot h-11 px-4 text-sm font-display tracking-widest">
                  Add stills
                </button>
                <p className="mt-3 text-xs text-muted">PNG, JPEG, WebP. They are re-encoded to JPEG, then the scan is bent.</p>
              </div>
              <input
                ref={stillRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) addStills(event.target.files);
                  event.target.value = "";
                }}
              />
              {error ? (
                <p role="alert" className="mt-4 border border-accent px-3 py-3 text-sm text-accent">
                  {error}
                </p>
              ) : null}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {stills.map((still) => (
                  <figure key={still.id} className="frame p-2">
                    <div className="grid grid-cols-2 gap-2">
                      <img src={still.url} alt={still.name} className="aspect-square w-full object-cover" />
                      {still.resultUrl ? (
                        <img src={still.resultUrl} alt={`Dented ${still.name}`} className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square items-center justify-center bg-bg text-xs text-muted">Waiting</div>
                      )}
                    </div>
                    <figcaption className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{still.error ?? still.name}</span>
                      {still.resultBytes ? (
                        <button
                          type="button"
                          className="btn-line h-10 shrink-0 px-3"
                          onClick={() => {
                            const bytes = still.resultBytes;
                            if (!bytes) return;
                            downloadBlob(new Blob([bytes.buffer], { type: "image/jpeg" }), still.name.replace(/\.\w+$/, "") + "-dent.jpg");
                          }}
                        >
                          Save
                        </button>
                      ) : null}
                    </figcaption>
                  </figure>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={denting || !stills.length} onClick={() => void dentStills()} className="btn-hot h-12 px-5 font-display text-lg font-bold tracking-widest disabled:opacity-40">
                  {denting ? "Denting" : "Dent JPEGs"}
                </button>
                <button
                  type="button"
                  disabled={!stills.some((still) => still.resultBytes)}
                  onClick={() => {
                    const files = stills.flatMap((still) =>
                      still.resultBytes ? [{ name: still.name.replace(/\.\w+$/, "") + "-dent.jpg", data: still.resultBytes }] : [],
                    );
                    downloadBlob(new Blob([zipStore(files)], { type: "application/zip" }), "meltroom-stills.zip");
                  }}
                  className="btn-line h-12 px-4 text-sm disabled:opacity-40"
                >
                  Download zip
                </button>
              </div>
            </section>
            <aside className="frame p-4 lg:self-start">
              <h2 className="font-display text-lg font-bold">Scan</h2>
              <Select label="Operation" value={jpegMode} onChange={(value) => setJpegMode(value as JpegMode)}>
                <option value="repeat">Repeat a slice</option>
                <option value="delete">Delete a slice</option>
                <option value="swap">Swap two slices</option>
                <option value="shift">Move a slice</option>
              </Select>
              <Range label="Passes" min={1} max={24} step={1} value={jpegPasses} onChange={setJpegPasses} />
              <Range label="Slice size" min={8} max={100} step={1} value={jpegIntensity} onChange={setJpegIntensity} />
              <Range label="JPEG quality" min={0.4} max={0.95} step={0.01} value={jpegQuality} onChange={setJpegQuality} />
              <Range label="Seed" min={0} max={9999} step={1} value={jpegSeed} onChange={setJpegSeed} />
            </aside>
          </div>
        </main>
      )}
      </div>
    </div>
  );
}
