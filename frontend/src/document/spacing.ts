/**
 * « Espacement » : l'espace entre deux éléments (deux corps, deux caissons avec leurs façades…) devient une cote qu'on
 * change — ou entre un élément et une esquisse, ou deux esquisses. La cote est la plus courte distance entre eux (ses deux points les plus proches), ou l'écart le long d'un axe
 * entre leurs boîtes ; la nouvelle valeur pousse le second élément, ou tire le premier, ou les deux de moitié, le long
 * de la cote. Un caisson glisse par sa position (ses façades suivent) ; un autre élément, par un déplacement de chacun
 * de ses corps ; une
 * esquisse, par son plan (tout ce qui en est extrudé la suit). Pur.
 */
import type { Closest } from "../measurements/closest";
import { moveSketchPlane } from "../sketcher/move";
import { findFeature } from "./operations";
import type { CadDocument, CabinetFeature, Feature, MoveFeature, Vec3 } from "./types";

export type Box = [Vec3, Vec3];
/** Which element moves to make the new space. */
export type Mover = "second" | "first" | "both";
/** Along what the space is taken: the shortest distance, or an axis (X, Y, Z). */
export type Along = "measure" | 0 | 1 | 2;

export interface Gap {
  /** The space (mm): negative along an axis when the boxes overlap. */
  distance: number;
  /** The cote: from the first element to the second. */
  from: Vec3;
  to: Vec3;
  /** Unit vector from the first element towards the second. */
  dir: Vec3;
}

/** What moves: the bodies of an element, and whether they are a whole element (a cabinet slides by its position). */
export interface Moving {
  key: string;
  bodies: string[];
  whole: boolean;
  shift: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mid = (b: Box, i: number) => (b[0][i]! + b[1][i]!) / 2;
const round = (v: number) => Number(v.toFixed(3));

/** A direction within ~2° of an axis becomes that axis exactly (boxes side by side: no drift in the other two). */
export function snapAxis(v: Vec3): Vec3 {
  const length = Math.hypot(...v);
  if (length < 1e-9) return [1, 0, 0];
  const u = v.map((c) => c / length) as Vec3;
  const i = [0, 1, 2].reduce((best, k) => (Math.abs(u[k]!) > Math.abs(u[best]!) ? k : best), 0);
  if (Math.abs(u[i]!) < 0.9994) return u;
  const axis: Vec3 = [0, 0, 0];
  axis[i] = Math.sign(u[i]!);
  return axis;
}

/** The space along an axis between two boxes, the cote drawn in the middle of where they face each other. */
export function axisGap(a: Box, b: Box, axis: 0 | 1 | 2): Gap {
  const forward = mid(b, axis) >= mid(a, axis);
  const distance = forward ? b[0][axis]! - a[1][axis]! : a[0][axis]! - b[1][axis]!;
  // Across the axis: the middle of the overlap of the two boxes (or between them when they do not overlap).
  const across = [0, 1, 2].map((i) => {
    const lo = Math.max(a[0][i]!, b[0][i]!);
    const hi = Math.min(a[1][i]!, b[1][i]!);
    return lo <= hi ? (lo + hi) / 2 : (mid(a, i) + mid(b, i)) / 2;
  }) as Vec3;
  const from: Vec3 = [...across];
  const to: Vec3 = [...across];
  from[axis] = forward ? a[1][axis]! : a[0][axis]!;
  to[axis] = forward ? b[0][axis]! : b[1][axis]!;
  const dir: Vec3 = [0, 0, 0];
  dir[axis] = forward ? 1 : -1;
  return { distance, from, to, dir };
}

/** The shortest space, from the two closest points; in contact, along the axis that parts their centres most. */
export function measureGap(near: Closest, a: Box, b: Box): Gap {
  if (near.distance > 1e-6) return { distance: near.distance, from: near.from, to: near.to, dir: snapAxis(sub(near.to, near.from)) };
  const centres = [0, 1, 2].map((i) => mid(b, i) - mid(a, i));
  const axis = [0, 1, 2].reduce((best, k) => (Math.abs(centres[k]!) > Math.abs(centres[best]!) ? k : best), 0) as 0 | 1 | 2;
  return { ...axisGap(a, b, axis), distance: 0, from: near.from, to: near.to };
}

/** How far each element moves (the first, the second) for the space to become `wanted`. */
export function spacingShifts(gap: Gap, wanted: number, mover: Mover): [Vec3, Vec3] {
  const delta = wanted - gap.distance;
  const along = (k: number) => gap.dir.map((c) => c * delta * k) as Vec3;
  if (mover === "second") return [[0, 0, 0], along(1)];
  if (mover === "first") return [along(-1), [0, 0, 0]];
  return [along(-0.5), along(0.5)];
}

const moves = (m: Moving) => Math.hypot(...m.shift) > 1e-6;

/** The cabinet that slides as a whole, or null (its bodies are moved one by one). */
function slidingCabinet(doc: CadDocument, m: Moving): CabinetFeature | null {
  const f = m.whole ? findFeature(doc, m.key) : undefined;
  return f?.type === "cabinet" ? f : null;
}

/** How many new features (moves of bodies) the shifts need. */
export function movesNeeded(doc: CadDocument, moving: readonly Moving[]): number {
  return moving.filter(moves).reduce((n, m) => n + (slidingCabinet(doc, m) || findFeature(doc, m.key)?.type === "sketch" ? 0 : m.bodies.length), 0);
}

/**
 * What the shifts make: each cabinet moved in place (same id, a formula on its position dropped on the axes it
 * leaves), each other body a move of its own (a slot each).
 */
export function spacingFeatures(doc: CadDocument, moving: readonly Moving[], slots: readonly { id: string; name: string }[]): Feature[] {
  const out: Feature[] = [];
  let slot = 0;
  for (const m of moving.filter(moves)) {
    const sketch = m.whole ? findFeature(doc, m.key) : undefined;
    if (sketch?.type === "sketch") {
      out.push(moveSketchPlane(sketch, m.shift));
      continue;
    }
    const cabinet = slidingCabinet(doc, m);
    if (cabinet) {
      const expressions = Object.fromEntries(Object.entries(cabinet.expressions ?? {}).filter(([k]) => ![0, 1, 2].some((i) => k === `origin.${i}` && Math.abs(m.shift[i]!) > 1e-6)));
      out.push({ ...cabinet, origin: cabinet.origin.map((c, i) => round(c + m.shift[i]!)) as Vec3, ...(cabinet.expressions ? { expressions } : {}) });
      continue;
    }
    for (const target of m.bodies) {
      const s = slots[slot++];
      if (s) out.push({ ...s, type: "move", target, translate: m.shift.map(round) as Vec3 } satisfies MoveFeature);
    }
  }
  return out;
}
