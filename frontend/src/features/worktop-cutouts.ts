/**
 * Découpes du plan de travail, en géométrie pure : l'évier, la plaque de cuisson, le robinet ou un passe-câble, aux
 * cotes de découpe courantes du commerce (à vérifier sur la notice de l'appareil), placés le long du plan (leur
 * milieu depuis son bout bas) et depuis son bord avant ; ce sont des usinages du plan (une boîte retirée de part en
 * part, un trou), qui suivent la planche. Refuse une découpe qui sort du plan, en frôle le bord (moins de 50 mm de
 * matière) ou en chevauche une autre. Une découpe prend aussi ses propres cotes (celles de la notice) et le rayon de
 * ses angles : arrondie, elle est faite d'une croix de deux boîtes et d'un trou rond dans chaque angle. Le plan est vu de
 * devant, sa face avant vers −Y par défaut.
 */
import type { MachiningOp, Vec3 } from "../document/types";

export interface Appliance {
  id: string;
  label: string;
  /** A rectangle (length along the worktop × depth) or a round hole (diameter). */
  size: [number, number] | number;
  /** Default distance from the front edge of the worktop to the front edge of the cut (null: centred in the depth). */
  front: number | null;
  /** Radius of the corners of a rectangular cut (mm): a sink's are rounded, a hob's sharp. */
  radius?: number;
}

export const APPLIANCES: Appliance[] = [
  { id: "sink-1", label: "Évier 1 cuve à encastrer (découpe 780 × 480)", size: [780, 480], front: null, radius: 10 },
  { id: "sink-15", label: "Évier 1 cuve ½ à encastrer (découpe 960 × 480)", size: [960, 480], front: null, radius: 10 },
  { id: "sink-2", label: "Évier 2 cuves à encastrer (découpe 1140 × 480)", size: [1140, 480], front: null, radius: 10 },
  { id: "sink-under", label: "Évier sous plan 1 cuve (découpe 500 × 400)", size: [500, 400], front: 80, radius: 10 },
  { id: "hob-60", label: "Plaque de cuisson 60 cm (découpe 560 × 490)", size: [560, 490], front: null },
  { id: "hob-80", label: "Plaque de cuisson 80 cm (découpe 750 × 490)", size: [750, 490], front: null },
  { id: "hob-90", label: "Plaque de cuisson 90 cm (découpe 880 × 490)", size: [880, 490], front: null },
  { id: "tap", label: "Robinet (trou Ø35)", size: 35, front: null },
  { id: "cable", label: "Passe-câble (trou Ø60)", size: 60, front: null },
];

export interface Cutout {
  appliance: string;
  /** Its middle, from the low end of the worktop along its length (mm). */
  along: number;
  /** From the front edge of the worktop to the front edge of the cut (mm); null: centred in the depth. */
  front: number | null;
  /** Sizes of one's own, from the appliance's leaflet, over the catalogue's: length along the worktop × depth (mm). */
  size?: [number, number];
  /** The diameter of a round hole, over the catalogue's (mm). */
  diameter?: number;
  /** Radius of the corners, over the catalogue's (mm; 0: sharp). */
  radius?: number;
  /** Its own name (one of « Mes découpes »), instead of the catalogue's. */
  name?: string;
  /** Made by the Plan de cuisine for a unit of its run; one changed by hand in its tool no longer is. */
  auto?: boolean;
}

/**
 * The cut-outs of a worktop the kitchen plan makes again (`fresh`: those of its units now), with those put or changed
 * by hand in it before (`before`: what it had) kept: one's own stay where they were, and the plan's cut for a unit
 * leaves its place to the one changed by hand that stands there.
 */
export function mergedCutouts(fresh: readonly Cutout[], before: readonly Cutout[]): Cutout[] {
  const own = (c: Cutout) => c.size !== undefined || c.diameter !== undefined || c.radius !== undefined || c.name !== undefined || c.front !== null;
  // What the plan made itself, also before it marked them: the same appliance at the same place, untouched.
  const hand = before.filter((c) => !c.auto && (own(c) || !fresh.some((f) => f.appliance === c.appliance && Math.abs(f.along - c.along) < 1)));
  const over = (f: Cutout) => hand.some((c) => Math.abs(c.along - f.along) < ((cutShape(c)?.width ?? 0) + (cutShape(f)?.width ?? 0)) / 2);
  return [...fresh.filter((f) => !over(f)), ...hand];
}

/** A cut-out with its sizes settled: its own over the catalogue's. Null: an appliance the catalogue has not got. */
export function cutShape(c: Cutout): { name: string; round: boolean; width: number; depth: number; radius: number; front: number | null } | null {
  const a = APPLIANCES.find((x) => x.id === c.appliance);
  if (!a) return null;
  const name = c.name ?? a.label.replace(/ \(.*$/, "");
  if (typeof a.size === "number") {
    const diameter = c.diameter ?? a.size;
    return { name, round: true, width: diameter, depth: diameter, radius: diameter / 2, front: a.front };
  }
  const [width, depth] = c.size ?? a.size;
  return { name, round: false, width, depth, radius: Math.max(0, Math.min(c.radius ?? a.radius ?? 0, width / 2, depth / 2)), front: a.front };
}

type Box = [Vec3, Vec3];
const MIN_EDGE = 50;

/**
 * The machining of these cut-outs in a worktop (its box; `front`: the side it faces), or why not. Lengths run along
 * the worktop's longer horizontal side.
 */
export function cutoutOps(box: Box, cutouts: readonly Cutout[], frontSign: -1 | 1 = -1): { ops: MachiningOp[]; problems: string[] } {
  const [lo, hi] = box;
  const along = hi[0] - lo[0] >= hi[1] - lo[1] ? 0 : 1;
  const across = (1 - along) as 0 | 1;
  const length = hi[along]! - lo[along]!;
  const depth = hi[across]! - lo[across]!;
  const [bottom, top] = [lo[2]!, hi[2]!];
  // The front edge: low or high along the depth, depending on where the worktop faces (−Y: its low side).
  const frontEdge = frontSign < 0 ? lo[across]! : hi[across]!;
  const inward = -frontSign;
  const ops: MachiningOp[] = [];
  const problems: string[] = [];
  const rects: { name: string; a: [number, number]; b: [number, number] }[] = [];
  for (const c of cutouts) {
    const shape = cutShape(c);
    if (!shape) continue;
    const { name, round, width: w, depth: d, radius } = shape;
    const fromFront = c.front ?? shape.front ?? (depth - d) / 2;
    const u0 = c.along - w / 2;
    const v0 = fromFront;
    if (u0 < MIN_EDGE || u0 + w > length - MIN_EDGE || v0 < MIN_EDGE * (round ? 0.5 : 1) || v0 + d > depth - MIN_EDGE * (round ? 0.5 : 1)) {
      problems.push(`${name} : sort du plan ou laisse moins de ${MIN_EDGE} mm de matière au bord.`);
      continue;
    }
    for (const r of rects) {
      if (Math.min(r.b[0], u0 + w) - Math.max(r.a[0], u0) > 0 && Math.min(r.b[1], v0 + d) - Math.max(r.a[1], v0) > 0) problems.push(`${name} chevauche ${r.name}.`);
    }
    rects.push({ name, a: [u0, v0], b: [u0 + w, v0 + d] });
    // In the model: along the worktop from its left end, across it from its front edge inwards.
    const at = (u: number, v: number, z: number): Vec3 => {
      const p: Vec3 = [0, 0, z];
      p[along] = lo[along]! + u;
      p[across] = frontEdge + inward * v;
      return p;
    };
    const through = (u: number, v: number, diameter: number): MachiningOp => ({ kind: "hole", at: at(u, v, top), dir: [0, 0, -1], diameter, depth: top - bottom });
    const box = (ua: number, va: number, ub: number, vb: number): MachiningOp => {
      const [p, q] = [at(ua, va, bottom - 1), at(ub, vb, top + 1)];
      return { kind: "box", from: [0, 1, 2].map((i) => Math.min(p[i]!, q[i]!)) as Vec3, to: [0, 1, 2].map((i) => Math.max(p[i]!, q[i]!)) as Vec3, mode: "cut" };
    };
    if (round) ops.push(through(c.along, v0 + d / 2, w));
    else if (radius < 0.5) ops.push(box(u0, v0, u0 + w, v0 + d));
    else {
      // Rounded corners: a cross of two boxes, and a round hole in each corner.
      if (w - 2 * radius > 0.01) ops.push(box(u0 + radius, v0, u0 + w - radius, v0 + d));
      if (d - 2 * radius > 0.01) ops.push(box(u0, v0 + radius, u0 + w, v0 + d - radius));
      for (const u of [u0 + radius, u0 + w - radius]) for (const v of [v0 + radius, v0 + d - radius]) ops.push(through(u, v, 2 * radius));
    }
  }
  return { ops, problems };
}

/**
 * Where a new cut-out goes: a tap behind the last sink; else the middle of the worktop when it is free, else the first
 * free spot from its low end (every 10 mm), else after the last one (shown as a problem).
 */
export function placeCutout(box: Box, cutouts: readonly Cutout[], appliance: string, frontSign: -1 | 1 = -1): Cutout {
  const a = APPLIANCES.find((x) => x.id === appliance);
  const fits = (c: Cutout) => cutoutOps(box, [...cutouts, c], frontSign).problems.length === 0;
  const [lo, hi] = box;
  const length = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  const depth = Math.min(hi[0] - lo[0], hi[1] - lo[1]);
  if (a && typeof a.size === "number") {
    const sink = [...cutouts].reverse().find((c) => c.appliance.startsWith("sink"));
    const s = sink && cutShape(sink);
    if (sink && s && !s.round) {
      const behind = { appliance, along: sink.along, front: Math.round((sink.front ?? s.front ?? (depth - s.depth) / 2) + s.depth + 15) };
      if (fits(behind)) return behind;
    }
  }
  const middle = { appliance, along: Math.round(length / 2), front: null };
  if (fits(middle)) return middle;
  for (let along = MIN_EDGE; along <= length - MIN_EDGE; along += 10) if (fits({ appliance, along, front: null })) return { appliance, along, front: null };
  const half = (c: Cutout) => (cutShape(c)?.width ?? 0) / 2;
  const last = cutouts.at(-1);
  return { appliance, along: Math.round(last ? last.along + half(last) + 100 + half({ appliance, along: 0, front: null }) : length / 2), front: null };
}
