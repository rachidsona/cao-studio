/**
 * Le tracé des étagères tournées d'un corps aménagé (ShelfParams.lean) : chacune tournée dans le plan comme son volume
 * (features/within-walls.ts), ses bouts jusqu'à la paroi qu'ils touchent, ou jusqu'à la cloison où ils s'arrêtaient.
 * Ses traits droits de l'esquisse cèdent la place à ce contour, et les niches posées dessus ou dessous suivent sa face. Pur.
 */
import type { SketchGeometry } from "../document/sketch";
import type { SketchFrame } from "./frame";
import type { NicheSides, WallLine } from "./niche-outline";
import { isPartition, isShelves, pathKey, rebuildChain } from "./partition-history";
import { partBox, shelfLayout, type NicheBox } from "./shelves";

type Vec2 = [number, number];
const TOUCH = 0.5;
const FAR = 1e5;

/** The turn in the sketch's plane of a shelf along u, its length along `lean` (a line: within a quarter turn). */
export function leanTurn(lean: readonly number[], frame: SketchFrame): number | null {
  const dot = (a: readonly number[]) => a[0]! * lean[0]! + a[1]! * lean[1]! + a[2]! * lean[2]!;
  const [lu, lv] = [dot(frame.u), dot(frame.v)];
  if (Math.hypot(lu, lv) < 1e-6) return null;
  let turn = Math.atan2(lv, lu);
  while (turn > Math.PI / 2) turn -= Math.PI;
  while (turn <= -Math.PI / 2) turn += Math.PI;
  return Math.abs(turn) < 1e-9 ? null : turn;
}

/** The shelves of the sketch's leaning steps: each one's box in the sketch, and its turn. */
export function leanedShelves(g: SketchGeometry, frame: SketchFrame): { box: NicheBox; turn: number }[] {
  return (g.offsets ?? []).filter(isPartition).flatMap((partition) => {
    const rebuilt = rebuildChain(g, partition.id);
    if (typeof rebuilt === "string") return [];
    return (rebuilt.geometry.offsets ?? []).filter(isShelves).flatMap((r) => {
      const lean = r.step.input.lean;
      const turn = lean ? leanTurn(lean, frame) : null;
      const node = rebuilt.niches.get(pathKey(r.step.niche));
      if (turn === null || !node || r.step.input.vertical) return [];
      const layout = shelfLayout(node.box, r.step.input);
      return typeof layout === "string" ? [] : layout.shelves.map((span) => ({ box: partBox(node.box, span, layout), turn }));
    });
  });
}

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

/** A shelf turned about its middle, drawn out and cut by the walls (an end on the opening) or where its end stood. */
export function leanedOutline(box: NicheBox, turn: number, [u0, , u1]: readonly [number, number, number, number], lines: readonly WallLine[]): Vec2[] | null {
  const c: Vec2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  const a: Vec2 = [Math.cos(turn), Math.sin(turn)];
  const m: Vec2 = [-a[1], a[0]];
  const h = (box.y1 - box.y0) / 2;
  const at = (s: number, o: number): Vec2 => [c[0] + a[0] * s + m[0] * o, c[1] + a[1] * s + m[1] * o];
  let polygon: Vec2[] = [at(-FAR, -h), at(FAR, -h), at(FAR, h), at(-FAR, h)];
  for (const line of lines) polygon = clip(polygon, line.p, line.n, c);
  // An end that stopped on a cloison or a shelf: back to it.
  if (Math.abs(box.x0 - u0) >= TOUCH) polygon = clip(polygon, [box.x0, 0], [1, 0], c);
  if (Math.abs(box.x1 - u1) >= TOUCH) polygon = clip(polygon, [box.x1, 0], [1, 0], c);
  return polygon.length >= 3 && polygon.every(([u, v]) => Math.abs(u) < FAR / 2 && Math.abs(v) < FAR / 2) ? polygon : null;
}

/** Whether a straight curve lies on the long edge of one of these shelves (drawn turned instead). */
export function onShelfEdge(points: readonly Vec2[], shelves: readonly { box: NicheBox }[]): boolean {
  if (points.length !== 2) return false;
  const [p, q] = points as [Vec2, Vec2];
  return shelves.some(({ box }) =>
    [box.y0, box.y1].some((y) => Math.abs(p[1] - y) < 1e-6 && Math.abs(q[1] - y) < 1e-6) && Math.min(p[0], q[0]) >= box.x0 - TOUCH && Math.max(p[0], q[0]) <= box.x1 + TOUCH,
  );
}

/** The faces of the turned shelves a niche sits on or under: its bottom or top is drawn to them (niche-outline.ts). */
export function shelfSides(box: NicheBox, shelves: readonly { box: NicheBox; turn: number }[]): NicheSides {
  const sides: NicheSides = {};
  for (const { box: s, turn } of shelves) {
    if (Math.min(box.x1, s.x1) - Math.max(box.x0, s.x0) < TOUCH) continue;
    const c: Vec2 = [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
    const n: Vec2 = [-Math.sin(turn), Math.cos(turn)];
    const h = (s.y1 - s.y0) / 2;
    if (Math.abs(box.y1 - s.y0) < TOUCH) sides.y1 = { p: [c[0] - n[0] * h, c[1] - n[1] * h], n };
    if (Math.abs(box.y0 - s.y1) < TOUCH) sides.y0 = { p: [c[0] + n[0] * h, c[1] + n[1] * h], n };
  }
  return sides;
}
