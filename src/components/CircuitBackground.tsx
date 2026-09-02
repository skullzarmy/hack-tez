/**
 * CircuitBackground — generative PCB-trace art for the hero section.
 *
 * Pipeline:
 *  1. L-system turtle graphics (Hilbert, Koch-square, branching, bus traces)
 *     + a packing pass lay down a dense orthogonal trace skeleton.
 *  2. A drawing CA propagates a bright front along the skeleton, permanently
 *     revealing traces — the circuit board builds itself over ~15 s.
 *  3. Lifecycle: DRAWING → HOLDING → FADING → restart.
 *
 * StrictMode / CLS:
 *  - All mutable CA state lives in stateRef (persists across StrictMode
 *    unmount→remount). The RAF loop is re-attached on remount but the grid
 *    and draw-progress arrays are never reinitialized unless size changes.
 *    No visual restart in dev or prod.
 *  - Canvas is position:absolute — zero layout impact, zero CLS.
 *  - prefers-reduced-motion → static fully-drawn snapshot, no RAF.
 */
import { useLayoutEffect, useRef } from "react";

// ─── constants ────────────────────────────────────────────────────────────
const CELL       = 8;
const THICK      = 1.5;
const HOLD_TICKS = 80;
const FADE_RATE  = 0.009;
const DRAW_RATE  = 0.14;
const FPS        = 20;
const INTERVAL   = 1000 / FPS;

const TRACE = 1, PAD_SQ = 2, PAD_CIRC = 3;
const DX = [1, 0, -1, 0];
const DY = [0, 1,  0, -1];

// ─── seeded PRNG ──────────────────────────────────────────────────────────
function xorshift(seed: number): () => number {
  let s = ((seed ^ 0xdeadbeef) >>> 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

// ─── L-system ─────────────────────────────────────────────────────────────
function lexpand(axiom: string, rules: Record<string, string>, n: number): string {
  let s = axiom;
  for (let i = 0; i < n; i++) {
    const out: string[] = [];
    for (const c of s) out.push(rules[c] ?? c);
    s = out.join("");
    if (s.length > 8000) break;
  }
  return s;
}

// ─── grid ─────────────────────────────────────────────────────────────────
interface Grid {
  cells: Uint8Array;   // 0=empty | 1=trace | 2=pad_sq | 3=pad_circ
  conn:  Uint8Array;   // neighbour bitmask r=1,d=2,l=4,u=8
  cols:  number;
  rows:  number;
  count: number;
}

function buildGrid(cols: number, rows: number): Grid {
  const cells = new Uint8Array(cols * rows);
  const rng   = xorshift(cols * 9973 + rows * 31337);
  const STEP  = Math.max(2, Math.round(Math.min(cols, rows) / 12));

  function turtle(sentence: string, sx: number, sy: number, sd: number, step: number) {
    let x = sx, y = sy, d = sd;
    const stk: [number, number, number][] = [];
    for (const ch of sentence) {
      if (ch === "F" || ch === "G") {
        for (let s = 0; s < step; s++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;
          const i = ny * cols + nx;
          if (!cells[i]) cells[i] = TRACE;
          x = nx; y = ny;
        }
      } else if (ch === "+") { d = (d + 1) & 3;
      } else if (ch === "-") { d = (d + 3) & 3;
      } else if (ch === "[") {
        const i = y * cols + x; if (cells[i] < PAD_SQ) cells[i] = PAD_SQ;
        stk.push([x, y, d]);
      } else if (ch === "]") {
        const i = y * cols + x; if (cells[i] < PAD_CIRC) cells[i] = PAD_CIRC;
        const top = stk.pop(); if (top) [x, y, d] = top;
      }
    }
    const ti = y * cols + x; if (cells[ti] < PAD_CIRC) cells[ti] = PAD_CIRC;
  }

  const programs: [string, Record<string, string>, number][] = [
    ["A", { A: "+BF-AFA-FB+", B: "-AF+BFB+FA-" }, 5],
    ["F+F+F+F", { F: "F+F-F-FF+F+F-F" }, 3],
    ["X", { X: "F[+X][-X]FX", F: "FF" }, 5],
    ["A", { A: "F[+A]F[-A]+A", F: "FF" }, 4],
  ];

  for (let r = 0; r < 5 + Math.floor(rng() * 2); r++) {
    const [ax, ru, it] = programs[r % programs.length];
    turtle(lexpand(ax, ru, it), Math.floor(rng() * cols), Math.floor(rng() * rows), Math.floor(rng() * 4), STEP);
  }

  // Bus traces
  for (let b = 0; b < 4 + Math.floor(rng() * 4); b++) {
    if (rng() < 0.6) {
      const row = Math.floor(rng() * rows);
      const c0  = Math.floor(rng() * cols * 0.3);
      const c1  = Math.min(cols - 1, c0 + Math.floor(cols * (0.35 + rng() * 0.55)));
      for (let c = c0; c <= c1; c++) { const i = row * cols + c; if (!cells[i]) cells[i] = TRACE; }
      cells[row * cols + c0] = PAD_SQ; cells[row * cols + c1] = PAD_SQ;
    } else {
      const col = Math.floor(rng() * cols);
      const r0  = Math.floor(rng() * rows * 0.3);
      const r1  = Math.min(rows - 1, r0 + Math.floor(rows * (0.35 + rng() * 0.55)));
      for (let r = r0; r <= r1; r++) { const i = r * cols + col; if (!cells[i]) cells[i] = TRACE; }
      cells[r0 * cols + col] = PAD_SQ; cells[r1 * cols + col] = PAD_SQ;
    }
  }

  // Packing pass
  const TARGET = cols * rows * 0.44;
  let filled   = 0; for (let i = 0; i < cells.length; i++) if (cells[i]) filled++;
  const rng2   = xorshift(0xbeefcafe + cols);
  for (let attempt = 0; attempt < cols * rows && filled < TARGET; attempt++) {
    const x = Math.floor(rng2() * cols), y = Math.floor(rng2() * rows);
    const i = y * cols + x;
    if (cells[i]) continue;
    let adj = false;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && cells[ny * cols + nx]) { adj = true; break; }
    }
    if (!adj) continue;
    let cx = x, cy = y, cd = Math.floor(rng2() * 4);
    for (let s = 0, len = 3 + Math.floor(rng2() * 10); s < len; s++) {
      const nx = cx + DX[cd], ny = cy + DY[cd];
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) break;
      const ni = ny * cols + nx;
      if (!cells[ni]) { cells[ni] = TRACE; filled++; }
      cx = nx; cy = ny;
      if (rng2() < 0.18) cd = (cd + (rng2() < 0.5 ? 1 : -1) + 4) & 3;
    }
  }

  const conn = new Uint8Array(cols * rows);
  let count  = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const i = y * cols + x; if (!cells[i]) continue; count++;
    let c = 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && cells[ny * cols + nx]) c |= 1 << d;
    }
    conn[i] = c;
  }
  return { cells, conn, cols, rows, count };
}

// ─── persistent CA state (survives StrictMode remount) ───────────────────
interface CAState {
  g:         Grid | null;
  ph:        Uint8Array;   // 0=dormant 1=front 2=settled
  prog:      Float32Array; // 0→1 reveal progress
  glow:      Float32Array; // 0→1 flash brightness
  lifecycle: number;       // 0=drawing 1=holding 2=fading
  holdTick:  number;
  settled:   number;
}

function makeCAState(): CAState {
  return { g: null, ph: new Uint8Array(0), prog: new Float32Array(0), glow: new Float32Array(0), lifecycle: 0, holdTick: 0, settled: 0 };
}

// ─── component ────────────────────────────────────────────────────────────
export function CircuitBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Persists across StrictMode unmount→remount — only one set of state ever exists.
  const caRef = useRef<CAState>(makeCAState());

  useLayoutEffect(() => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    const ctx    = canvas.getContext("2d", { alpha: true }) as CanvasRenderingContext2D;
    const s      = caRef.current;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    let rafId   = 0;
    let lastTs  = 0;
    let visible = true;

    // ── theme colour ──────────────────────────────────────────────────────
    function rgb(): [number, number, number] {
      const light =
        document.documentElement.dataset.theme === "light" ||
        (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: light)").matches);
      return light ? [0, 110, 48] : [77, 255, 145];
    }

    // ── CA reset ──────────────────────────────────────────────────────────
    function resetCA() {
      if (!s.g) return;
      const n = s.g.cols * s.g.rows;
      s.ph   = new Uint8Array(n);
      s.prog = new Float32Array(n);
      s.glow = new Float32Array(n);
      s.lifecycle = 0; s.holdTick = 0; s.settled = 0;
      let placed = 0;
      for (let a = 0; placed < 6 && a < n * 2; a++) {
        const i = Math.floor(Math.random() * n);
        if (s.g.cells[i] && s.ph[i] === 0) { s.ph[i] = 1; s.glow[i] = 1; placed++; }
      }
    }

    // ── CA step ───────────────────────────────────────────────────────────
    function step() {
      if (!s.g) return;
      const { cells, cols, rows, count } = s.g;

      if (s.lifecycle === 0) {
        const snap = new Uint8Array(s.ph);
        for (let i = 0; i < cols * rows; i++) {
          if (!cells[i]) continue;
          if (snap[i] === 1) {
            s.prog[i] = Math.min(1, s.prog[i] + DRAW_RATE);
            s.glow[i] = Math.max(0, s.glow[i] - 0.05);
            if (s.prog[i] >= 1) { s.ph[i] = 2; s.settled++; }
          } else if (snap[i] === 2) {
            s.glow[i] = Math.max(0, s.glow[i] - 0.04);
            const x = i % cols, y = Math.floor(i / cols);
            for (let d = 0; d < 4; d++) {
              const nx = x + DX[d], ny = y + DY[d];
              if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
              const ni = ny * cols + nx;
              if (cells[ni] && snap[ni] === 0) { s.ph[ni] = 1; s.glow[ni] = 1; }
            }
          }
        }
        if (s.settled >= count * 0.96) { s.lifecycle = 1; s.holdTick = 0; }
      } else if (s.lifecycle === 1) {
        s.holdTick++;
        for (let i = 0; i < s.glow.length; i++) if (s.glow[i] > 0) s.glow[i] = Math.max(0, s.glow[i] - 0.04);
        if (s.holdTick >= HOLD_TICKS) s.lifecycle = 2;
      } else {
        let done = true;
        for (let i = 0; i < s.prog.length; i++) {
          if (!s.g.cells[i]) continue;
          if (s.prog[i] > 0) { s.prog[i] = Math.max(0, s.prog[i] - FADE_RATE);     done = false; }
          if (s.glow[i] > 0) { s.glow[i] = Math.max(0, s.glow[i] - FADE_RATE * 2); done = false; }
        }
        if (done) resetCA();
      }
    }

    // ── draw ──────────────────────────────────────────────────────────────
    function draw(w: number, h: number) {
      if (!s.g) return;
      ctx.clearRect(0, 0, w, h);
      const { cells, conn, cols, rows } = s.g;
      const [cr, cg, cb] = rgb();
      const H = CELL * 0.5;

      function addCell(x: number, y: number, i: number) {
        const px = x * CELL, py = y * CELL, cx = px + H, cy = py + H;
        const t = cells[i], c = conn[i];
        if (t === PAD_CIRC) {
          ctx.moveTo(cx + CELL * 0.38, cy);
          ctx.arc(cx, cy, CELL * 0.38, 0, Math.PI * 2);
        } else if (t === PAD_SQ) {
          const pad = CELL * 0.64, off = (CELL - pad) * 0.5;
          ctx.rect(px + off, py + off, pad, pad);
        } else {
          const hasH = c & 0b0101, hasV = c & 0b1010;
          if (hasH) ctx.rect(px, cy - THICK * 0.5, CELL, THICK);
          if (hasV) ctx.rect(cx - THICK * 0.5, py, THICK, CELL);
          ctx.rect(cx - THICK, cy - THICK, THICK * 2, THICK * 2);
        }
      }

      // ghost skeleton
      ctx.beginPath();
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x; if (cells[i] && s.ph[i] === 0) addCell(x, y, i);
      }
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.025)`;
      ctx.fill();

      // settled traces, bucketed by draw-progress
      for (let bk = 0; bk < 8; bk++) {
        const lo = bk / 8, hi = (bk + 1) / 8;
        ctx.beginPath();
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (cells[i] && s.ph[i] === 2 && s.glow[i] <= 0.05 && s.prog[i] >= lo && s.prog[i] < hi)
            addCell(x, y, i);
        }
        const a = (0.04 + (bk / 7) * 0.16).toFixed(3);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${a})`;
        ctx.fill();
      }

      // active front + glow
      ctx.beginPath();
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (cells[i] && (s.ph[i] === 1 || s.glow[i] > 0.05)) addCell(x, y, i);
      }
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.28)`;
      ctx.fill();
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.42)`;
      ctx.fill();

      // pad rings
      ctx.beginPath();
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (!cells[i] || cells[i] === TRACE || s.ph[i] < 2 || s.prog[i] < 0.5) continue;
        const px = x * CELL, py = y * CELL, cx = px + H, cy = py + H;
        if (cells[i] === PAD_CIRC) {
          ctx.moveTo(cx + CELL * 0.56, cy);
          ctx.arc(cx, cy, CELL * 0.56, 0, Math.PI * 2);
        } else {
          const pad = CELL * 0.64, off = (CELL - pad) * 0.5;
          ctx.rect(px + off - 1.5, py + off - 1.5, pad + 3, pad + 3);
        }
      }
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.10)`;
      ctx.lineWidth = 0.75;
      ctx.stroke();
    }

    // ── resize ────────────────────────────────────────────────────────────
    function resize() {
      const parent = canvas.parentElement;
      if (!parent) return;
      const w = parent.offsetWidth, h = parent.offsetHeight;
      if (!w || !h) return;
      const dpr  = Math.min(devicePixelRatio || 1, 2);
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(w / CELL) + 1;
      const rows = Math.ceil(h / CELL) + 1;

      // Only rebuild grid if dimensions actually changed.
      // This is the key to surviving StrictMode remount without visual restart.
      if (!s.g || s.g.cols !== cols || s.g.rows !== rows) {
        s.g = buildGrid(cols, rows);
        if (reduced) {
          const n = s.g.cols * s.g.rows;
          s.ph   = new Uint8Array(n);
          s.prog = new Float32Array(n);
          s.glow = new Float32Array(n);
          const rng = xorshift(0xfeedcafe);
          for (let i = 0; i < n; i++) if (s.g.cells[i]) { s.ph[i] = 2; s.prog[i] = 0.25 + rng() * 0.45; }
        } else {
          resetCA();
        }
      }

      draw(w, h); // synchronous first frame — no visible pop
    }

    // ── animation loop ────────────────────────────────────────────────────
    function animate(ts: number) {
      rafId = requestAnimationFrame(animate);
      if (!visible || ts - lastTs < INTERVAL) return;
      lastTs = ts;
      step();
      const p = canvas.parentElement; if (p) draw(p.offsetWidth, p.offsetHeight);
    }

    // ── observers ─────────────────────────────────────────────────────────
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    const io = new IntersectionObserver(
      (e) => { visible = e[0].isIntersecting; }, { threshold: 0 }
    );
    io.observe(canvas);

    resize(); // synchronous — first frame drawn before browser paint
    if (!reduced) rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      io.disconnect();
      // caRef.current is intentionally NOT cleared here.
      // On StrictMode remount, resize() will find s.g with the same cols/rows
      // and skip grid rebuild + CA reset → no visual restart.
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        display: "block", pointerEvents: "none",
      }}
    />
  );
}
