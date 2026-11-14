/**
 * Le plan de travail en longueurs du commerce, en calcul pur : chaque plan de travail d'une cuisine est coupé en
 * morceaux d'au plus une barre vendue (3 m, 3,05 m, 4,10 m, 4,20 m), les joints posés sur le côté d'un meuble (pour
 * être portés) et jamais à moins de 10 cm d'une découpe d'évier ou de plaque ; à l'angle de deux plans, joint droit
 * (l'un passe, l'autre vient contre) ou coupe d'onglet (le plan qui vient contre s'allonge de la profondeur de
 * l'autre). Les morceaux sont rangés dans le moins de barres possible (même matière, épaisseur et largeur de barre) ;
 * chaque joint prend deux ferrures de jonction. Le devis compte ces barres, au lieu de la surface du plan de travail.
 */
import { cabinetBox } from "./kitchen-catalog";
import { bodyInfo, MATERIALS } from "./materials";
import type { CutRow, CutTotals } from "./cut-list";
import { worktops } from "./tech-plan";
import type { CadDocument, Vec3 } from "./types";

export interface WorktopSettings {
  /** The length of the bars sold (mm). */
  bar: number;
  /** At a corner: a butt joint (one runs through) or a mitre. */
  corner: "butt" | "mitre";
}

export const BAR_LENGTHS = [3000, 3050, 4100, 4200];
/** The widths bars are sold in (mm): the narrowest that takes the worktop. */
const BAR_DEPTHS = [600, 650, 900, 1200];
export const WORKTOP_DEFAULTS: WorktopSettings = { bar: 4100, corner: "butt" };
export const WORKTOP_FITTING = "Ferrure de jonction de plan de travail";
/** Kept from a cut-out's edge, and from an end of the worktop (mm); added to each piece for the saw. */
const FROM_CUT = 100;
const SHORTEST = 300;
const SAW = 20;

let current: WorktopSettings = { ...WORKTOP_DEFAULTS };
export const worktopSettings = (): WorktopSettings => current;
export const setWorktopSettings = (s: WorktopSettings) => {
  current = { ...s };
};

type Box = [Vec3, Vec3];

export interface WorktopPiece {
  /** From the low end of the worktop along its length (mm). */
  from: number;
  to: number;
  /** What it takes of a bar: its length, a mitre's extra, the saw. */
  buy: number;
}

export interface WorktopPlan {
  id: string;
  name: string;
  material: string;
  length: number;
  depth: number;
  thickness: number;
  /** The way it runs (0: X, 1: Y), and where it starts along it. */
  axis: 0 | 1;
  start: number;
  pieces: WorktopPiece[];
  joints: number[];
  cutouts: [number, number][];
  /** Its ends against another worktop: which, and how they meet. */
  corners: { end: "start" | "end"; with: string; joint: "butt" | "mitre" }[];
}

export interface BarBuy {
  material: string;
  thickness: number;
  depth: number;
  length: number;
  count: number;
}

const inside = (p: number[], b: Box, tol = 2) => p[0]! >= b[0][0] - tol && p[0]! <= b[1][0] + tol && p[1]! >= b[0][1] - tol && p[1]! <= b[1][1] + tol;

/** The pieces, joints, corners and bars of the kitchen's worktops. */
export function worktopBars(doc: CadDocument, s: WorktopSettings = current): { tops: WorktopPlan[]; bars: BarBuy[]; fittings: number; problems: string[] } {
  const all = worktops(doc);
  const problems: string[] = [];
  const cabinets = doc.features.flatMap((f) => (f.type === "cabinet" && !f.suppressed ? [cabinetBox(f) as Box] : []));
  const tops: WorktopPlan[] = all.map((t) => {
    const [lo, hi] = t.box;
    const axis: 0 | 1 = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
    const across = 1 - axis;
    const length = hi[axis]! - lo[axis]!;
    const info = bodyInfo(doc, t.id);
    const material = MATERIALS.find((m) => m.id === info.material)?.name ?? info.material ?? "Plan de travail";
    const cuts = doc.features.flatMap((f) => (f.type === "machining" && f.kind === "cutout" && f.target === t.id && !f.suppressed ? (f.cutouts ?? []) : []));
    const cutouts = cuts.map((c): [number, number] => {
      const half = (c.size?.[0] ?? c.diameter ?? (c.appliance.startsWith("sink") ? 780 : c.appliance.startsWith("hob") ? 560 : 60)) / 2;
      return [c.along - half, c.along + half];
    });
    return { id: t.id, name: t.name, material, length, depth: hi[across]! - lo[across]!, thickness: hi[2] - lo[2], axis, start: lo[axis]!, pieces: [], joints: [], cutouts, corners: [] };
  });
  // Corners: an end of one worktop inside another (which runs through it).
  for (const a of tops) {
    const box = all.find((t) => t.id === a.id)!.box;
    const mid = (box[0][1 - a.axis]! + box[1][1 - a.axis]!) / 2;
    for (const [end, at] of [["start", a.start], ["end", a.start + a.length]] as const) {
      const p = [0, 0];
      p[a.axis] = end === "start" ? at - 5 : at + 5;
      p[1 - a.axis] = mid;
      const other = tops.find((b) => b !== a && b.axis !== a.axis && inside(p, all.find((t) => t.id === b.id)!.box));
      if (other) a.corners.push({ end, with: other.name, joint: s.corner });
    }
  }
  const room = s.bar - SAW;
  for (const t of tops) {
    const box = all.find((x) => x.id === t.id)!.box;
    // Where a joint is carried: a side of a cabinet under the worktop.
    const supports = cabinets
      .filter((c) => c[0][1 - t.axis]! < box[1][1 - t.axis]! && c[1][1 - t.axis]! > box[0][1 - t.axis]!)
      .flatMap((c) => [c[0][t.axis]! - t.start, c[1][t.axis]! - t.start])
      .filter((x) => x > SHORTEST && x < t.length - SHORTEST);
    const free = (x: number) => x >= SHORTEST && x <= t.length - SHORTEST && t.cutouts.every(([a, b]) => x < a - FROM_CUT || x > b + FROM_CUT);
    // A mitred end: that piece takes the other worktop's depth more.
    const extra = (end: "start" | "end") => (t.corners.some((c) => c.end === end && c.joint === "mitre") ? (tops.find((o) => o.name === t.corners.find((c) => c.end === end)!.with)?.depth ?? 0) : 0);
    let from = 0;
    for (let guard = 0; guard < 50; guard++) {
      const need = t.length - from + extra("end") + (from === 0 ? extra("start") : 0);
      if (need <= room) break;
      const reach = from + room - (from === 0 ? extra("start") : 0);
      const carried = supports.filter((x) => x > from + SHORTEST && x <= reach && free(x)).sort((a, b) => b - a)[0];
      const anywhere = Array.from({ length: Math.floor((reach - from - SHORTEST) / 10) + 1 }, (_, k) => reach - k * 10).find((x) => x > from + SHORTEST && free(x));
      const joint = carried ?? anywhere;
      if (joint === undefined) {
        problems.push(`${t.name} : pas de place pour un joint entre deux découpes — prenez une barre plus longue.`);
        break;
      }
      t.joints.push(Math.round(joint));
      from = joint;
    }
    const cuts = [0, ...t.joints, t.length];
    t.pieces = cuts.slice(1).map((to, i) => {
      const a = cuts[i]!;
      const buy = to - a + (i === 0 ? extra("start") : 0) + (i === cuts.length - 2 ? extra("end") : 0) + SAW;
      if (buy > s.bar) problems.push(`${t.name} : un morceau de ${Math.round(buy)} mm ne tient pas dans une barre de ${s.bar} mm.`);
      return { from: a, to, buy: Math.round(buy) };
    });
  }
  // The bars: the pieces of one material, thickness and bar width, the longest first, each in the first bar it fits.
  const groups = new Map<string, { material: string; thickness: number; depth: number; left: number[] }>();
  for (const t of tops) {
    const depth = BAR_DEPTHS.find((d) => d >= t.depth - 0.5) ?? Math.ceil(t.depth / 50) * 50;
    const key = `${t.material}|${t.thickness}|${depth}`;
    const g = groups.get(key) ?? { material: t.material, thickness: t.thickness, depth, left: [] };
    groups.set(key, g);
    for (const p of [...t.pieces].sort((a, b) => b.buy - a.buy)) {
      const i = g.left.findIndex((room) => room >= p.buy);
      if (i >= 0) g.left[i]! -= p.buy;
      else g.left.push(s.bar - p.buy);
    }
  }
  const bars = [...groups.values()].map((g) => ({ material: g.material, thickness: g.thickness, depth: g.depth, length: s.bar, count: g.left.length }));
  // Two fittings at each joint, straight or at a corner (counted once).
  const joints = tops.reduce((n, t) => n + t.joints.length, 0) + tops.reduce((n, t) => n + t.corners.length, 0);
  return { tops, bars, fittings: 2 * joints, problems: [...new Set(problems)] };
}

/** The bar's line in the quote: "Plan de travail Chêne massif 38 mm — barre 4,1 m × 65 cm". */
export const barName = (b: BarBuy) => `Plan de travail ${b.material} ${Math.round(b.thickness)} mm — barre ${String(b.length / 1000).replace(".", ",")} m × ${b.depth / 10} cm`;

/**
 * The quote counting the bars bought instead of the worktops' area: the cut list's totals without the worktops, and a
 * line per kind of bar at its price (`price`: of a m² of that material).
 */
export function withWorktopBars(rows: readonly CutRow[], totals: readonly CutTotals[], buy: readonly BarBuy[], price: (material: string) => number): { totals: CutTotals[]; items: { name: string; quantity: number; unit: string; price: number }[] } {
  if (!buy.length) return { totals: [...totals], items: [] };
  const out = totals.map((t) => ({ ...t }));
  for (const r of rows.filter((x) => x.names.some((n) => /^Plan de travail/.test(n)))) {
    const t = out.find((x) => x.material === r.material && Math.abs(x.thickness - r.thickness) < 0.05);
    if (!t) continue;
    t.area = Math.max(0, Math.round((t.area - (r.length * r.width * r.quantity) / 1e6) * 1000) / 1000);
    t.parts = Math.max(0, t.parts - r.quantity);
  }
  return {
    totals: out.filter((t) => t.parts > 0 || t.area > 0.001),
    items: buy.map((b) => ({ name: barName(b), quantity: b.count, unit: "barre", price: Math.round(((b.length * b.depth) / 1e6) * price(b.material) * 100) / 100 })),
  };
}
