import { useEffect, useLayoutEffect, useRef, useState } from "react";

const KATA = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ";
const HEX = "0123456789ABCDEF";
const BIN = "01";
const SIG = "MELTROOMVOP";
const SETS = [KATA, HEX, BIN, SIG];
const COLS = 72;

type Drop = { head: string; body: string; tail: string; gap: number };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glyph(set: string, rand: () => number) {
  return set[Math.floor(rand() * set.length)] ?? "0";
}

function buildDrops(seed: number): Drop[] {
  const rand = mulberry32(seed);
  const drops: Drop[] = [];
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
    drops.push({ head: glyph(set, rand), body, tail, gap });
    lines += 1 + bodyN + tailN + gap;
  }
  return drops;
}

const COLUMNS = Array.from({ length: COLS }, (_, index) => ({
  id: index,
  drops: buildDrops(0x51ed + index * 131),
  opacity: 0.55 + (index % 5) * 0.09,
}));

function Stream({ drops }: { drops: Drop[] }) {
  return drops.map((drop, index) => (
    <span key={index} className="rain-drop">
      <span className="rain-head">{drop.head}</span>
      <span className="rain-body">{drop.body}</span>
      <span className="rain-tail">{drop.tail}</span>
      <span className="rain-gap" style={{ height: `${drop.gap}em` }} />
    </span>
  ));
}

export function MatrixField() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(true);
  }, []);

  useLayoutEffect(() => {
    if (!shown) return;
    const root = rootRef.current;
    if (!root) return;
    const tracks = Array.from(root.querySelectorAll<HTMLElement>("[data-rain]"));
    let alive = true;
    let raf = 0;

    const measure = () =>
      tracks.map((el, index) => {
        const rand = mulberry32(0xb100 + index * 19);
        const half = el.offsetHeight / 2 || window.innerHeight;
        return { el, half, y: -rand() * half, speed: 50 + rand() * 230 };
      });

    let drops = measure();
    const paint = () => {
      for (const drop of drops) drop.el.style.transform = `translate3d(0,${drop.y}px,0)`;
    };
    paint();

    let last = performance.now();
    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - last) / 1000);
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

  if (!shown) {
    return <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-bg" />;
  }

  return (
    <div ref={rootRef} aria-hidden className="matrix-field pointer-events-none fixed inset-0 z-0 overflow-hidden select-none">
      {COLUMNS.map((col) => (
        <div key={col.id} className="matrix-col" style={{ opacity: col.opacity }}>
          <div className="matrix-track" data-rain>
            <span className="rain-half">
              <Stream drops={col.drops} />
            </span>
            <span className="rain-half">
              <Stream drops={col.drops} />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
