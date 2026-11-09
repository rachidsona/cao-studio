/**
 * G-code pour une défonceuse à commande numérique, à partir des pièces mises à plat (io/dxf.ts) : les pièces d'une
 * même matière et épaisseur sont rangées en bandes sur les panneaux bruts (une pause M0 entre deux panneaux) ; pour
 * chaque panneau, les perçages au foret de leur diamètre et à leur vraie profondeur, les grands trous (boîtiers de
 * charnière) vidés en cercles concentriques à la fraise, les découpes intérieures, puis le contour, détouré en
 * plusieurs passes. La fraise est compensée dans le calcul (pas de G41/G42), en avalant à l'opposé (opposition).
 * Z = 0 sur le dessus du panneau ; la dernière passe descend un peu dans le martyr. Millimètres, G21 G90.
 */
import type { FlatEdge, FlatPart } from "./dxf";

type P2 = [number, number];
type Seg = { kind: "line"; a: P2; b: P2 } | { kind: "arc"; c: P2; r: number; a: P2; b: P2; ccw: boolean };

export interface GcodeOptions {
  /** Router bit diameter (mm). */
  tool: number;
  safeZ: number;
  /** Feeds (mm/min) and spindle speed (rpm). */
  feed: number;
  plunge: number;
  spindle: number;
  /** Depth of each pass (mm), and how far the last one goes into the spoilboard. */
  pass: number;
  overcut: number;
  /** Holes up to this diameter are drilled with a drill of their size; larger ones are milled. */
  drillMax: number;
  /** Space between parts, and around the sheet (mm). */
  spacing: number;
  margin: number;
}

export const GCODE: GcodeOptions = { tool: 6, safeZ: 5, feed: 4000, plunge: 800, spindle: 18000, pass: 6, overcut: 0.3, drillMax: 10, spacing: 16, margin: 10 };

const EPS = 1e-6;
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => mul(a, 1 / (len(a) || 1));
const cross = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const near = (a: P2, b: P2) => len(sub(a, b)) < 1e-3;

function segOf(e: Exclude<FlatEdge, { kind: "circle" }>): Seg {
  if (e.kind === "line") return { kind: "line", a: e.a, b: e.b };
  const at = (t: number): P2 => [e.center[0] + e.radius * Math.cos(t), e.center[1] + e.radius * Math.sin(t)];
  return { kind: "arc", c: e.center, r: e.radius, a: at(e.start), b: at(e.end), ccw: true };
}

const reversed = (s: Seg): Seg => (s.kind === "line" ? { ...s, a: s.b, b: s.a } : { ...s, a: s.b, b: s.a, ccw: !s.ccw });
const reverseLoop = (loop: Seg[]): Seg[] => loop.map(reversed).reverse();

/** The edges chained into closed loops. */
export function loopsOf(edges: FlatEdge[]): Seg[][] {
  const left = edges.filter((e): e is Exclude<FlatEdge, { kind: "circle" }> => e.kind !== "circle").map(segOf);
  const out: Seg[][] = [];
  while (left.length) {
    const loop = [left.shift()!];
    while (!near(loop.at(-1)!.b, loop[0]!.a)) {
      const end = loop.at(-1)!.b;
      const i = left.findIndex((s) => near(s.a, end) || near(s.b, end));
      if (i < 0) throw new Error("Contour ouvert : la pièce ne peut pas être détourée.");
      const s = left.splice(i, 1)[0]!;
      loop.push(near(s.a, end) ? s : reversed(s));
    }
    out.push(loop);
  }
  return out;
}

/** Points along a loop (arcs sampled), for its area. */
function samples(loop: Seg[]): P2[] {
  return loop.flatMap((s): P2[] => {
    if (s.kind === "line") return [s.a];
    const [t0, t1] = [Math.atan2(s.a[1] - s.c[1], s.a[0] - s.c[0]), Math.atan2(s.b[1] - s.c[1], s.b[0] - s.c[0])];
    let sweep = s.ccw ? t1 - t0 : t0 - t1;
    if (sweep <= EPS) sweep += 2 * Math.PI;
    return Array.from({ length: 12 }, (_, k): P2 => {
      const t = t0 + (s.ccw ? 1 : -1) * (sweep * k) / 12;
      return [s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)];
    });
  });
}

export function signedArea(loop: Seg[]): number {
  const p = samples(loop);
  return p.reduce((sum, a, i) => sum + cross(a, p[(i + 1) % p.length]!), 0) / 2;
}

function tangent(s: Seg, atEnd: boolean): P2 {
  if (s.kind === "line") return unit(sub(s.b, s.a));
  const radial = sub(atEnd ? s.b : s.a, s.c);
  return unit(s.ccw ? [-radial[1], radial[0]] : [radial[1], -radial[0]]);
}

/** The segment moved `d` to the right of its direction. */
function shifted(s: Seg, d: number): Seg {
  if (s.kind === "line") {
    const t = tangent(s, false);
    const n: P2 = [t[1], -t[0]];
    return { ...s, a: add(s.a, mul(n, d)), b: add(s.b, mul(n, d)) };
  }
  const r = s.ccw ? s.r + d : s.r - d;
  if (r <= EPS) throw new Error(`Un arrondi intérieur de rayon ${Number(s.r.toFixed(2))} mm est plus petit que la fraise.`);
  const moved = (p: P2) => add(s.c, mul(sub(p, s.c), r / s.r));
  return { ...s, r, a: moved(s.a), b: moved(s.b) };
}

/** Where two shifted segments (as whole lines or circles) cross, nearest to `v`. */
function crossing(p: Seg, q: Seg, v: P2): P2 | null {
  const pts: P2[] = [];
  const line = (s: Extract<Seg, { kind: "line" }>) => ({ o: s.a, d: unit(sub(s.b, s.a)) });
  const lineCircle = (o: P2, d: P2, c: Seg & { kind: "arc" }) => {
    const f = sub(o, c.c);
    const b = dot(f, d);
    const disc = b * b - (dot(f, f) - c.r * c.r);
    if (disc < -EPS) return;
    const r = Math.sqrt(Math.max(0, disc));
    pts.push(add(o, mul(d, -b - r)), add(o, mul(d, -b + r)));
  };
  if (p.kind === "line" && q.kind === "line") {
    const [a, b] = [line(p), line(q)];
    const den = cross(a.d, b.d);
    if (Math.abs(den) > EPS) pts.push(add(a.o, mul(a.d, cross(sub(b.o, a.o), b.d) / den)));
  } else if (p.kind === "line" && q.kind === "arc") lineCircle(line(p).o, line(p).d, q);
  else if (p.kind === "arc" && q.kind === "line") lineCircle(line(q).o, line(q).d, p);
  else if (p.kind === "arc" && q.kind === "arc") {
    const dc = sub(q.c, p.c);
    const dist = len(dc);
    if (dist > EPS && dist <= p.r + q.r + EPS && dist >= Math.abs(p.r - q.r) - EPS) {
      const a = (p.r * p.r - q.r * q.r + dist * dist) / (2 * dist);
      const h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
      const m = add(p.c, mul(dc, a / dist));
      const n: P2 = [-dc[1] / dist, dc[0] / dist];
      pts.push(add(m, mul(n, h)), add(m, mul(n, -h)));
    }
  }
  return pts.sort((x, y) => len(sub(x, v)) - len(sub(y, v)))[0] ?? null;
}

/** The path of the tool's centre `d` to the right of a closed loop: arcs round the outer corners, inner corners trimmed. */
export function offsetLoop(loop: Seg[], d: number): Seg[] {
  const off = loop.map((s) => shifted(s, d));
  const joins: (Seg | null)[] = loop.map(() => null);
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length;
    const v = loop[i]!.b;
    const turn = cross(tangent(loop[i]!, true), tangent(loop[j]!, false));
    if (turn > 1e-9) joins[i] = { kind: "arc", c: v, r: d, a: off[i]!.b, b: off[j]!.a, ccw: true };
    else if (turn < -1e-9) {
      const p = crossing(off[i]!, off[j]!, v);
      if (!p) throw new Error("Un angle rentrant est trop serré pour la fraise.");
      off[i] = { ...off[i]!, b: p };
      off[j] = { ...off[j]!, a: p };
    }
  }
  for (let i = 0; i < loop.length; i++) {
    const s = off[i]!;
    if (s.kind === "line" && dot(sub(s.b, s.a), sub(loop[i]!.b, loop[i]!.a)) <= 0) throw new Error("Une partie de la pièce est plus étroite que la fraise.");
  }
  return off.flatMap((s, i) => (joins[i] ? [s, joins[i]!] : [s]));
}

const n3 = (v: number) => (Math.abs(v) < 5e-4 ? "0" : Number(v.toFixed(3)).toString());

interface Hole {
  at: P2;
  diameter: number;
  depth: number;
}

/** A placed part: its contours (outer first) as tool paths, its holes, in sheet coordinates. */
interface Job {
  name: string;
  thickness: number;
  contours: Seg[][];
  holes: Hole[];
}

function jobOf(part: FlatPart, at: P2, o: GcodeOptions): Job {
  const r = o.tool / 2;
  const move = (s: Seg): Seg => (s.kind === "line" ? { ...s, a: add(s.a, at), b: add(s.b, at) } : { ...s, c: add(s.c, at), a: add(s.a, at), b: add(s.b, at) });
  const circles = part.edges.filter((e): e is Extract<FlatEdge, { kind: "circle" }> => e.kind === "circle");
  const contours: Seg[][] = [];
  const holes: Hole[] = [];
  if (circles.length === part.edges.length && circles.length === 1) {
    // A round part: its outline is the circle.
    const c = add(circles[0]!.center, at);
    const R = circles[0]!.radius + r;
    contours.push([{ kind: "arc", c, r: R, a: [c[0] + R, c[1]], b: [c[0] - R, c[1]], ccw: false }, { kind: "arc", c, r: R, a: [c[0] - R, c[1]], b: [c[0] + R, c[1]], ccw: false }]);
  } else {
    const loops = loopsOf(part.edges).sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
    // Material on the left: the outline counterclockwise, the cut-outs clockwise; the tool on the right, outside it.
    loops.forEach((loop, i) => {
      const area = signedArea(loop);
      const oriented = (i === 0) === area > 0 ? loop : reverseLoop(loop);
      contours.push(reverseLoop(offsetLoop(oriented, r)).map(move));
    });
    for (const c of circles) holes.push({ at: add(c.center, at), diameter: 2 * c.radius, depth: Math.min(c.depth ?? part.thickness, part.thickness) });
  }
  // Inner cut-outs before the outline, so the part is still held.
  return { name: part.name, thickness: part.thickness, contours: [...contours.slice(1), ...contours.slice(0, 1)], holes };
}

/** Depths of the passes down to `bottom` (negative). */
const passes = (bottom: number, pass: number) => {
  const out: number[] = [];
  for (let z = -pass; z > bottom + EPS; z -= pass) out.push(z);
  return [...out, bottom];
};

function pathCode(path: Seg[], z: number, o: GcodeOptions): string[] {
  const out = [`G0 X${n3(path[0]!.a[0])} Y${n3(path[0]!.a[1])}`, `G1 Z${n3(z)} F${o.plunge}`];
  for (const s of path) {
    if (s.kind === "line") out.push(`G1 X${n3(s.b[0])} Y${n3(s.b[1])} F${o.feed}`);
    else out.push(`${s.ccw ? "G3" : "G2"} X${n3(s.b[0])} Y${n3(s.b[1])} I${n3(s.c[0] - s.a[0])} J${n3(s.c[1] - s.a[1])} F${o.feed}`);
  }
  return [...out, `G0 Z${n3(o.safeZ)}`];
}

/** Rings of the tool's centre that clear a round pocket of radius `R`, from the inside out. */
function rings(R: number, o: GcodeOptions): number[] {
  const r = o.tool / 2;
  const out: number[] = [];
  for (let x = R - r; x > EPS; x -= 0.8 * o.tool) out.push(x);
  if (!out.length || out.at(-1)! > r) out.push(0);
  return out.reverse();
}

function sheetCode(jobs: Job[], o: GcodeOptions, tools: Map<number, number>): string[] {
  const out: string[] = [];
  const stop = (tool: number, label: string) => out.push("M5", `T${tool} M6 (${label})`, `S${o.spindle} M3`, `G0 Z${n3(o.safeZ)}`);
  // Drilling, one drill at a time.
  const drilled = jobs.flatMap((j) => j.holes.filter((h) => h.diameter <= o.drillMax + EPS).map((h) => ({ ...h, through: h.depth >= j.thickness - 0.01, thickness: j.thickness })));
  for (const [diameter, tool] of [...tools].sort((a, b) => a[0] - b[0])) {
    const these = drilled.filter((h) => Math.abs(h.diameter - diameter) < 0.01);
    if (!these.length) continue;
    stop(tool, `foret D${n3(diameter)}`);
    for (const h of these) out.push(`G0 X${n3(h.at[0])} Y${n3(h.at[1])}`, `G1 Z${n3(h.through ? -(h.thickness + o.overcut) : -h.depth)} F${o.plunge}`, `G0 Z${n3(o.safeZ)}`);
  }
  // The router: pockets, cut-outs, outlines.
  stop(1, `fraise D${n3(o.tool)}`);
  for (const j of jobs) {
    for (const h of j.holes.filter((x) => x.diameter > o.drillMax + EPS)) {
      if (h.diameter < o.tool) {
        out.push(`(trou D${n3(h.diameter)} plus petit que la fraise, non usiné)`);
        continue;
      }
      const bottom = h.depth >= j.thickness - 0.01 ? -(j.thickness + o.overcut) : -h.depth;
      out.push(`(${j.name} : trou D${n3(h.diameter)})`);
      for (const z of passes(bottom, o.pass)) {
        for (const x of rings(h.diameter / 2, o)) {
          if (x === 0) out.push(`G0 X${n3(h.at[0])} Y${n3(h.at[1])}`, `G1 Z${n3(z)} F${o.plunge}`);
          else out.push(`G1 X${n3(h.at[0] + x)} Y${n3(h.at[1])} F${o.feed}`, `G1 Z${n3(z)} F${o.plunge}`, `G2 X${n3(h.at[0] + x)} Y${n3(h.at[1])} I${n3(-x)} J0 F${o.feed}`);
        }
        out.push(`G0 Z${n3(o.safeZ)}`);
      }
    }
  }
  for (const j of jobs) {
    out.push(`(${j.name} : contour)`);
    for (const path of j.contours) for (const z of passes(-(j.thickness + o.overcut), o.pass)) out.push(...pathCode(path, z, o));
  }
  return out;
}

/** The parts packed in rows on sheets of `size` (their length along X); the parts too large are returned apart. */
export function packParts(parts: FlatPart[], size: [number, number], o: GcodeOptions): { sheets: { part: FlatPart; at: P2 }[][]; tooBig: string[] } {
  const r = o.tool / 2;
  const [W, H] = [size[0] - 2 * o.margin, size[1] - 2 * o.margin];
  const room = (p: FlatPart): P2 => [p.width + o.tool + o.spacing, p.height + o.tool + o.spacing];
  const sheets: { part: FlatPart; at: P2 }[][] = [];
  const tooBig: string[] = [];
  let sheet: { part: FlatPart; at: P2 }[] = [];
  let [x, y, row] = [0, 0, 0];
  for (const p of [...parts].sort((a, b) => b.height - a.height || b.width - a.width)) {
    const [w, h] = room(p);
    if (w - o.spacing > W || h - o.spacing > H) {
      tooBig.push(p.name);
      continue;
    }
    if (x + w - o.spacing > W) [x, y, row] = [0, y + row, 0];
    if (y + h - o.spacing > H) {
      sheets.push(sheet);
      [sheet, x, y, row] = [[], 0, 0, 0];
    }
    sheet.push({ part: p, at: [o.margin + x + r, o.margin + y + r] });
    x += w;
    row = Math.max(row, h);
  }
  if (sheet.length) sheets.push(sheet);
  return { sheets, tooBig };
}

/** The program for groups of parts (one group per material and thickness, on sheets of the given size). */
export function partsGcode(groups: { label: string; size: [number, number]; parts: FlatPart[] }[], o: GcodeOptions = GCODE): { code: string; sheets: number; skipped: string[] } {
  const drills = [...new Set(groups.flatMap((g) => g.parts.flatMap((p) => p.edges.flatMap((e) => (e.kind === "circle" && p.edges.length > 1 && 2 * e.radius <= o.drillMax + EPS ? [Number((2 * e.radius).toFixed(2))] : [])))))].sort((a, b) => a - b);
  const tools = new Map(drills.map((d, i) => [d, i + 2]));
  const out = ["%", "(CAO Studio : usinage des pièces)", `(fraise T1 D${n3(o.tool)} ; ${drills.map((d) => `T${tools.get(d)} foret D${n3(d)}`).join(", ") || "aucun foret"})`, "(Z0 sur le dessus du panneau)", "G21 G90 G17", `G0 Z${n3(o.safeZ)}`];
  const skipped: string[] = [];
  let count = 0;
  for (const g of groups) {
    const { sheets, tooBig } = packParts(g.parts, g.size, o);
    skipped.push(...tooBig.map((n) => `${n} (plus grande que le panneau)`));
    for (const sheet of sheets) {
      count++;
      out.push("", `(Panneau ${count} : ${g.label}, ${g.size[0]} x ${g.size[1]} mm, ${sheet.length} pièce${sheet.length > 1 ? "s" : ""})`);
      if (count > 1) out.push("M5", `M0 (posez le panneau ${count})`);
      const jobs: Job[] = [];
      for (const { part, at } of sheet) {
        try {
          jobs.push(jobOf(part, at, o));
        } catch (error) {
          skipped.push(`${part.name} (${error instanceof Error ? error.message : String(error)})`);
        }
      }
      out.push(...sheetCode(jobs, o, tools));
    }
  }
  out.push("M5", `G0 Z${n3(o.safeZ)}`, "M30", "%");
  return { code: `${out.join("\n")}\n`, sheets: count, skipped };
}
