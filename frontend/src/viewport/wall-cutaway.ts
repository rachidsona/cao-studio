/**
 * Les murs qui cachent la pièce : un mur est une dalle verticale (mince, haute), d'un côté la pièce, de l'autre le
 * dehors ; l'œil passé derrière lui, de l'autre côté que la pièce, il cache ce qu'on regarde et s'efface de la vue,
 * avec les meubles qui sont les siens, ceux qui lui tournent le dos (on ne verrait que ce dos). Pur : la géométrie d'un corps, où est la pièce, où est l'œil.
 */
import type { Vec3 } from "../document/types";

/** A wall as a slab: the middle of it, its normal (horizontal, either way), half its thickness, half its length. */
export interface Slab {
  center: Vec3;
  normal: [number, number];
  half: number;
  reach: number;
}

/**
 * What stands against a wall is no further from it than this (mm): a unit, its fronts and handles, its worktop; and,
 * of furniture known to turn its back to that wall (a deep dressing, its sliding doors), than `AGAINST_BACK`.
 */
export const AGAINST = 700;
export const AGAINST_BACK = 950;

/** Thicker than this, or lower, or shorter: not a wall (a floor, a column, an appliance). */
const THICKEST = 600;
const LOWEST = 900;

/**
 * The slab a body's mesh is (its triangles, `indices` into `vertices`), or null when it is no wall: the direction most
 * of its upright faces look along, its thickness across it, as long as it is thin, high and long.
 */
export function slabOf(vertices: ArrayLike<number>, indices: ArrayLike<number>): Slab | null {
  // Upright faces, weighted by their area: the 2×2 tensor of their normals; its main axis is the wall's normal.
  let xx = 0;
  let xy = 0;
  let yy = 0;
  const p = (i: number): Vec3 => [vertices[i * 3]!, vertices[i * 3 + 1]!, vertices[i * 3 + 2]!];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [a, b, c] = [p(indices[t]!), p(indices[t + 1]!), p(indices[t + 2]!)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const area = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (area < 1e-9 || Math.abs(n[2]!) > 0.1 * area) continue;
    // |n| is twice the area: n nᵀ / |n| weighs each by its area.
    xx += (n[0]! * n[0]!) / area;
    xy += (n[0]! * n[1]!) / area;
    yy += (n[1]! * n[1]!) / area;
  }
  if (xx + yy < 1e-9) return null;
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const normal: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const along: [number, number] = [-normal[1], normal[0]];
  let [n0, n1, a0, a1, z0, z1] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
  let [sz, count] = [0, 0];
  for (let i = 0; i * 3 + 2 < vertices.length; i++) {
    const [x, y, z] = p(i);
    const n = x * normal[0] + y * normal[1];
    const a = x * along[0] + y * along[1];
    [n0, n1, a0, a1, z0, z1] = [Math.min(n0, n), Math.max(n1, n), Math.min(a0, a), Math.max(a1, a), Math.min(z0, z), Math.max(z1, z)];
    [sz, count] = [sz + z, count + 1];
  }
  const thickness = n1 - n0;
  if (!count || thickness > THICKEST || z1 - z0 < LOWEST || a1 - a0 < 2 * thickness) return null;
  // Its middle: across, between its faces; along, between its ends; up, the mean of its corners.
  const [mid, run] = [(n0 + n1) / 2, (a0 + a1) / 2];
  return { center: [normal[0] * mid + along[0] * run, normal[1] * mid + along[1] * run, sz / count], normal, half: thickness / 2, reach: (a1 - a0) / 2 };
}

/**
 * Whether a body (its box, seen from above) stands against this wall, on the room's side (`inside`: a point of the
 * room): all of it between the wall and `within` in front of it, along the wall's length.
 */
export function againstWall(wall: Slab, inside: [number, number], [lo, hi]: [Vec3, Vec3], within = AGAINST): boolean {
  const side = (inside[0] - wall.center[0]) * wall.normal[0] + (inside[1] - wall.center[1]) * wall.normal[1];
  if (Math.abs(side) <= wall.half) return false;
  const sign = side > 0 ? 1 : -1;
  for (const x of [lo[0], hi[0]]) {
    for (const y of [lo[1], hi[1]]) {
      const [dx, dy] = [x - wall.center[0], y - wall.center[1]];
      // From the wall's inner face towards the room, and along the wall from its middle.
      const off = (dx * wall.normal[0] + dy * wall.normal[1]) * sign - wall.half;
      const run = Math.abs(-dx * wall.normal[1] + dy * wall.normal[0]);
      if (off < -(2 * wall.half + 10) || off > within || run > wall.reach + 150) return false;
    }
  }
  return true;
}

/**
 * The wall a body is furniture of: the one it stands against that its back is turned to (`back`: where its furniture
 * turns its back, unit); with no back known, the only wall it stands against. Null: none, or one cannot tell which
 * (a board in a corner) — it then belongs to none.
 */
export function wallOf(walls: ReadonlyMap<string, Slab>, inside: [number, number], box: [Vec3, Vec3], back: [number, number] | null): string | null {
  const found: string[] = [];
  for (const [id, wall] of walls) {
    if (!againstWall(wall, inside, box, back ? AGAINST_BACK : AGAINST)) continue;
    if (back) {
      // Towards the room from the wall, against the back's way.
      const sign = (inside[0] - wall.center[0]) * wall.normal[0] + (inside[1] - wall.center[1]) * wall.normal[1] > 0 ? 1 : -1;
      if ((back[0] * wall.normal[0] + back[1] * wall.normal[1]) * sign > -0.9) continue;
    }
    found.push(id);
  }
  return found.length === 1 ? found[0]! : null;
}

/**
 * The piece of furniture a body with no back known goes with (a hinge, a sliding door, an accessory): the one whose
 * box (`pieces`, by key) its middle is in, or nearest to within `near` mm; null when none is that close.
 */
export function pieceOf(pieces: ReadonlyMap<string, [Vec3, Vec3]>, [lo, hi]: [Vec3, Vec3], near = 150): string | null {
  const mid = [0, 1, 2].map((i) => (lo[i]! + hi[i]!) / 2);
  let best: [string, number] | null = null;
  for (const [key, [a, b]] of pieces) {
    const off = Math.hypot(...[0, 1, 2].map((i) => Math.max(a[i]! - mid[i]!, 0, mid[i]! - b[i]!)));
    if (off <= near && (!best || off < best[1])) best = [key, off];
  }
  return best?.[0] ?? null;
}

/**
 * How far the eye is behind a wall, past its outer face, on the other side than the room (`inside`: a point of the
 * room, seen from above), in mm; 0 or less when it is not. A wall the room's point lies in the plane of: never.
 */
export function eyeBehind(w: Slab, inside: [number, number], eye: Vec3): number {
  const side = (inside[0] - w.center[0]) * w.normal[0] + (inside[1] - w.center[1]) * w.normal[1];
  if (Math.abs(side) <= w.half) return 0;
  const sign = side > 0 ? 1 : -1;
  return -((eye[0] - w.center[0]) * w.normal[0] + (eye[1] - w.center[1]) * w.normal[1]) * sign - w.half;
}

/** The walls between the eye and the room: those the eye is behind, the one it is furthest behind first. */
export function wallsBehind(walls: ReadonlyMap<string, Slab>, inside: [number, number], eye: Vec3): Set<string> {
  const behind = [...walls].map(([id, w]) => [id, eyeBehind(w, inside, eye)] as const).filter(([, d]) => d > 0);
  return new Set(behind.sort((a, b) => b[1] - a[1]).map(([id]) => id));
}

/**
 * The furniture taken out with the walls in the way (`cut`, the one most in the way first; `of`: each wall's own
 * furniture): wall after wall, as long as some of what `counts` (the furniture worth looking at) is left in view —
 * never all of it, so that a kitchen on one wall, or seen from behind its corner, still shows.
 */
export function furnitureOut(cut: Iterable<string>, of: ReadonlyMap<string, readonly string[]>, counts: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const wall of cut) {
    const own = of.get(wall) ?? [];
    if (!own.length) continue;
    const gone = new Set([...out, ...own]);
    if (counts.some((id) => !gone.has(id))) for (const id of own) out.add(id);
  }
  return out;
}

/**
 * The walls of a dressing (each zone's Répartition, standing on its own, no wall of a room needed) in the way: those
 * the eye has gone behind — past the back of the piece, seen from above (`back`: where it turns it, unit) — the one it
 * is furthest behind first. A dressing seen from behind a wall: that wall shows only its back and hides the others.
 */
export function piecesInTheWay(pieces: ReadonlyMap<string, { box: [Vec3, Vec3]; back: [number, number] }>, eye: Vec3): string[] {
  const behind = [...pieces].map(([key, { box: [lo, hi], back }]) => {
    // Its back face: the furthest of its corners towards its back.
    const face = Math.max(...[lo[0], hi[0]].flatMap((x) => [lo[1], hi[1]].map((y) => x * back[0] + y * back[1])));
    return [key, eye[0] * back[0] + eye[1] * back[1] - face] as const;
  });
  return behind.filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

/**
 * What goes with them: piece after piece (`ways`, the one most in the way first; `of`: each piece's bodies), on top of
 * what is already out, as long as some of what `counts` is left in view — never the whole dressing.
 */
export function piecesOut(ways: Iterable<string>, of: ReadonlyMap<string, readonly string[]>, counts: readonly string[], already: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const key of ways) {
    const own = of.get(key) ?? [];
    if (!own.length) continue;
    const gone = new Set([...already, ...out, ...own]);
    if (counts.some((id) => !gone.has(id))) for (const id of own) out.add(id);
  }
  return out;
}
