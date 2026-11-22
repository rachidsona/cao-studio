/**
 * Le tracé des étagères et cloisons tournées d'un corps aménagé (ShelfParams.lean) : chacune tournée dans le plan comme
 * son volume (features/within-walls.ts), ses bouts jusqu'à la paroi qu'ils touchent, jusqu'à l'étagère ou la cloison
 * tournée où ils butent, ou jusqu'à celle droite où ils s'arrêtaient. Ses traits droits de l'esquisse cèdent la place à
 * ce contour, et les niches qui la bordent suivent sa face ; une pièce droite qui bute sur une pièce tournée y va aussi.
 * Pur.
 */
import type { ShelfParams, SketchGeometry } from "../document/sketch";
import type { SketchFrame } from "./frame";
import type { NicheSides, WallLine } from "./niche-outline";
import { isPartition, isShelves, pathKey, rebuildChain } from "./partition-history";
import { partBox, shelfLayout, type NicheBox } from "./shelves";

type Vec2 = [number, number];
/** A shelf (along u) or a cloison (`vertical`: along v) of a Répartition, turned in the plane by `turn` (0: straight). */
export interface ShelfPart {
  box: NicheBox;
  turn: number;
  vertical?: boolean;
}
const TOUCH = 0.5;
const FAR = 1e5;

/**
 * The turn in the sketch's plane of a piece's length along `lean` (a line: within a quarter turn), from its straight
 * way: u for a shelf, v for a cloison (`base`: π/2).
 */
export function leanTurn(lean: readonly number[], frame: SketchFrame, base = 0): number | null {
  const dot = (a: readonly number[]) => a[0]! * lean[0]! + a[1]! * lean[1]! + a[2]! * lean[2]!;
  const [lu, lv] = [dot(frame.u), dot(frame.v)];
  if (Math.hypot(lu, lv) < 1e-6) return null;
  let turn = Math.atan2(lv, lu) - base;
  while (turn > Math.PI / 2) turn -= Math.PI;
  while (turn <= -Math.PI / 2) turn += Math.PI;
  return Math.abs(turn) < 1e-9 ? null : turn;
}

/** Every shelf and cloison of the sketch's Répartitions: its box in the sketch, and its turn (0: straight). */
export function shelfParts(g: SketchGeometry, frame: SketchFrame): ShelfPart[] {
  return (g.offsets ?? []).filter(isPartition).flatMap((partition) => {
    const rebuilt = rebuildChain(g, partition.id);
    if (typeof rebuilt === "string") return [];
    return (rebuilt.geometry.offsets ?? []).filter(isShelves).flatMap((r) => {
      const { lean, vertical } = r.step.input;
      const turn = (lean ? leanTurn(lean, frame, vertical ? Math.PI / 2 : 0) : null) ?? 0;
      const node = rebuilt.niches.get(pathKey(r.step.niche));
      if (!node) return [];
      const layout = shelfLayout(node.box, r.step.input);
      return typeof layout === "string" ? [] : layout.shelves.map((span) => ({ box: partBox(node.box, span, layout), turn, ...(vertical ? { vertical: true } : {}) }));
    });
  });
}

/** The turned shelves and cloisons of the sketch. */
export const leanedShelves = (g: SketchGeometry, frame: SketchFrame): ShelfPart[] => shelfParts(g, frame).filter((p) => p.turn !== 0);

/** The polygon kept on the inner side of a line (where `inside` is). */
function clip(polygon: Vec2[], p: Vec2, n: Vec2, inside: Vec2): Vec2[] {
  const side = (q: Vec2) => (q[0] - p[0]) * n[0] + (q[1] - p[1]) * n[1];
  const sign = side(inside) >= 0 ? 1 : -1;
  const out: Vec2[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const [sa, sb] = [sign * side(a), sign * side(b)];
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return out;
}

/** A piece's middle, the way of its length, the normal of its faces and half its thickness. */
function axes({ box, turn, vertical }: ShelfPart): { c: Vec2; a: Vec2; m: Vec2; h: number } {
  const angle = (vertical ? Math.PI / 2 : 0) + turn;
  const a: Vec2 = [Math.cos(angle), Math.sin(angle)];
  return { c: [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2], a, m: [-a[1], a[0]], h: (vertical ? box.x1 - box.x0 : box.y1 - box.y0) / 2 };
}

/**
 * A piece turned about its middle, drawn out and cut by the walls (an end on the opening), by the face of a turned
 * piece it butts on (`sides`), or where its end stood (on a straight cloison or shelf).
 */
export function leanedOutline(part: ShelfPart, [u0, v0, u1, v1]: readonly [number, number, number, number], lines: readonly WallLine[], sides: NicheSides = {}): Vec2[] | null {
  const { c, a, m, h } = axes(part);
  const { box, vertical } = part;
  const at = (s: number, o: number): Vec2 => [c[0] + a[0] * s + m[0] * o, c[1] + a[1] * s + m[1] * o];
  let polygon: Vec2[] = [at(-FAR, -h), at(FAR, -h), at(FAR, h), at(-FAR, h)];
  for (const line of lines) polygon = clip(polygon, line.p, line.n, c);
  // Its ends off the opening: to the turned piece they butt on, or back to where they stood.
  const ends = vertical
    ? ([["y0", box.y0, v0], ["y1", box.y1, v1]] as const)
    : ([["x0", box.x0, u0], ["x1", box.x1, u1]] as const);
  for (const [key, end, edge] of ends) {
    if (Math.abs(end - edge) < TOUCH) continue;
    const side = sides[key];
    polygon = side ? clip(polygon, side.p, side.n, c) : clip(polygon, vertical ? [0, end] : [end, 0], vertical ? [0, 1] : [1, 0], c);
  }
  return polygon.length >= 3 && polygon.every(([u, v]) => Math.abs(u) < FAR / 2 && Math.abs(v) < FAR / 2) ? polygon : null;
}

/** Whether a straight curve lies on the long edge of one of these pieces (drawn as its outline instead). */
export function onShelfEdge(points: readonly Vec2[], parts: readonly Pick<ShelfPart, "box" | "vertical">[]): boolean {
  if (points.length !== 2) return false;
  const [p, q] = points as [Vec2, Vec2];
  return parts.some(({ box, vertical }) => {
    const [across, along] = vertical ? ([0, 1] as const) : ([1, 0] as const);
    const [a0, a1, b0, b1] = vertical ? [box.x0, box.x1, box.y0, box.y1] : [box.y0, box.y1, box.x0, box.x1];
    return [a0, a1].some((k) => Math.abs(p[across] - k) < 1e-6 && Math.abs(q[across] - k) < 1e-6) && Math.min(p[along], q[along]) >= b0 - TOUCH && Math.max(p[along], q[along]) <= b1 + TOUCH;
  });
}

/**
 * The faces of the turned pieces a niche (or a piece) sits against: on a shelf or under it (its bottom or top), beside
 * a cloison (its left or right) — that side is drawn to the face (niche-outline.ts, features/within-walls.ts).
 */
export function shelfSides(box: NicheBox, parts: readonly ShelfPart[]): NicheSides {
  const sides: NicheSides = {};
  for (const part of parts) {
    if (part.turn === 0) continue;
    const s = part.box;
    const { c, m, h } = axes(part);
    // The face on the niche's side: the one nearer its middle.
    const [mu, mv] = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
    const k = (mu - c[0]) * m[0] + (mv - c[1]) * m[1] >= 0 ? h : -h;
    const face: WallLine = { p: [c[0] + m[0] * k, c[1] + m[1] * k], n: m };
    if (part.vertical) {
      if (Math.min(box.y1, s.y1) - Math.max(box.y0, s.y0) < TOUCH) continue;
      if (Math.abs(box.x1 - s.x0) < TOUCH) sides.x1 = face;
      if (Math.abs(box.x0 - s.x1) < TOUCH) sides.x0 = face;
    } else {
      if (Math.min(box.x1, s.x1) - Math.max(box.x0, s.x0) < TOUCH) continue;
      if (Math.abs(box.y1 - s.y0) < TOUCH) sides.y1 = face;
      if (Math.abs(box.y0 - s.y1) < TOUCH) sides.y0 = face;
    }
  }
  return sides;
}

/**
 * The pieces drawn as outlines: the turned ones, and the straight ones that butt on a turned one; each with the sides
 * its ends are drawn to.
 */
export function outlinedParts(parts: readonly ShelfPart[]): { part: ShelfPart; sides: NicheSides }[] {
  const turned = parts.filter((p) => p.turn !== 0);
  return parts.flatMap((part) => {
    const sides = shelfSides(part.box, turned.filter((t) => t !== part));
    return part.turn !== 0 || Object.keys(sides).length ? [{ part, sides }] : [];
  });
}

/**
 * How far a niche's outline reaches along u (`vertical`: what its cloisons share) or along v (its shelves), through
 * its middle the other way (ShelfParams.within). Null: no outline.
 */
export function reachAcross(polygon: readonly Vec2[] | null, vertical: boolean): [number, number] | null {
  if (!polygon || polygon.length < 3) return null;
  const [along, other] = vertical ? [0, 1] : [1, 0];
  const others = polygon.map((p) => p[other]!);
  const mid = (Math.min(...others) + Math.max(...others)) / 2;
  const hits = polygon.flatMap((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    if ((p[other]! - mid) * (q[other]! - mid) > 0 || p[other] === q[other]) return [];
    return [p[along]! + ((mid - p[other]!) / (q[other]! - p[other]!)) * (q[along]! - p[along]!)];
  });
  return hits.length >= 2 ? [Math.min(...hits), Math.max(...hits)] : null;
}

/**
 * Cloisons in a niche of a body furnished: they share its real width (ShelfParams.within), from its outline through
 * its middle — past the box where the walls slant out or a turned piece leans; its box's when it has none.
 */
export function sharedWidth(box: NicheBox, input: ShelfParams, outline: readonly Vec2[] | null): ShelfParams {
  const { within: _, ...rest } = input;
  const reach = input.vertical ? reachAcross(outline, true) : null;
  return reach && (Math.abs(reach[0] - box.x0) > TOUCH || Math.abs(reach[1] - box.x1) > TOUCH) ? { ...rest, within: reach } : rest;
}
