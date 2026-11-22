/**
 * Panels from a skeleton (furniture design, as JoinerCAD's skeleton design):
 * every line of a sketch is the edge view of a board. Each board is the line
 * thickened by the panel thickness, then extruded by the depth along the
 * sketch normal; every board is a body of its own.
 *
 * - Side of the line: on the outline of the skeleton the board goes inside
 *   (the drawn lines are the outer faces of the cabinet), centred, or
 *   outside; a line inside the outline (a shelf) is always centred.
 * - Corners: the boards that run through (vertical ones, like cabinet sides,
 *   or horizontal ones) are kept whole, the others are cut against them, so
 *   no two boards share material. Mitred: two lines ending at one point are
 *   both cut on the corner's bisector (45° at a square corner); the inner
 *   lines (shelves) are cut against the outline's boards.
 */
import { draw, type Drawing, type Shape3D } from "replicad";
import type { PanelsFeature } from "../document/types";
import type { SketchGeometry } from "../document/sketch";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { pointPos, type Vec2 } from "../sketcher/edit";
import { MIN_LENGTH, requirePositive, requireProfile, onProfilePlane, type OutputLookup } from "./common";
import type { SolidsOutput } from "./outputs";

/** One board, in sketch coordinates. */
export interface BoardOutline {
  lineId: string;
  /** Rectangle (4 corners) of the board's section. */
  polygon: Vec2[];
  /** Runs through at the corners (kept whole). */
  through: boolean;
  /** Boards (indices) it is cut against at the corners. */
  cutBy: number[];
}

const EPS = 1e-6;

/** Whether all the skeleton's points lie on one side of the line through a with normal n (that side's sign, 0 when on both). */
function outlineSide(points: Vec2[], a: Vec2, n: Vec2): number {
  let pos = false;
  let neg = false;
  for (const p of points) {
    const d = (p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1];
    if (d > 1e-6) pos = true;
    else if (d < -1e-6) neg = true;
  }
  return pos && !neg ? 1 : neg && !pos ? -1 : 0;
}

function bbox(poly: Vec2[]) {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const overlap = (a: Vec2[], b: Vec2[]) => {
  const p = bbox(a);
  const q = bbox(b);
  return p.x0 < q.x1 - EPS && q.x0 < p.x1 - EPS && p.y0 < q.y1 - EPS && q.y0 < p.y1 - EPS;
};

/** A board's line: its two ends, its normal and the offsets of its two long faces along it. */
interface BoardLine {
  a: Vec2;
  b: Vec2;
  n: Vec2;
  lo: number;
  hi: number;
}

/** Where the lines p + s·u and q + r·v cross (null when parallel). */
function cross(p: Vec2, u: Vec2, q: Vec2, v: Vec2): Vec2 | null {
  const det = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(det) < 1e-9) return null;
  const s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det;
  return [p[0] + u[0] * s, p[1] + u[1] * s];
}

/**
 * Mitres the corners where exactly two boards end at one point: each board's end corners move to where its faces
 * cross the other board's faces on the same side of the corner (inside with inside, outside with outside), so both
 * are cut on the corner's bisector and meet without sharing material.
 */
function miterCorners(boards: BoardOutline[], lines: BoardLine[]): void {
  const same = (p: Vec2, q: Vec2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  // Each end: the board, which end (0: a, 1: b), the point, the direction along the board away from it.
  const endsAt = lines.flatMap((l, i) => {
    const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
    const u: Vec2 = [(l.b[0] - l.a[0]) / len, (l.b[1] - l.a[1]) / len];
    return [{ i, end: 0, p: l.a, away: u }, { i, end: 1, p: l.b, away: [-u[0], -u[1]] as Vec2 }];
  });
  for (const e of endsAt) {
    const others = endsAt.filter((o) => o.i !== e.i && same(o.p, e.p));
    if (others.length !== 1) continue;
    const o = others[0]!;
    const [la, lb] = [lines[e.i]!, lines[o.i]!];
    // Which side of the corner a face is on: toward the other board (1), away from it (−1), or through the corner (0).
    const sideOf = (l: BoardLine, d: number, toward: Vec2) => Math.sign(Math.round(d * (l.n[0] * toward[0] + l.n[1] * toward[1]) * 1e6));
    const hits = [la.lo, la.hi].map((d) => {
      const dB = [lb.lo, lb.hi].find((x) => sideOf(lb, x, e.away) === sideOf(la, d, o.away));
      if (dB === undefined) return null;
      return cross([e.p[0] + la.n[0] * d, e.p[1] + la.n[1] * d], e.away, [o.p[0] + lb.n[0] * dB, o.p[1] + lb.n[1] * dB], o.away);
    });
    // Both faces or neither: a half-moved end would twist the board.
    if (!hits[0] || !hits[1]) continue;
    // Polygon order: [a+lo, b+lo, b+hi, a+hi].
    const poly = boards[e.i]!.polygon;
    if (e.end === 0) [poly[0], poly[3]] = [hits[0], hits[1]];
    else [poly[1], poly[2]] = [hits[0], hits[1]];
  }
}

/** The boards of a skeleton (pure geometry, no kernel). */
export function boardOutlines(g: SketchGeometry, feature: Pick<PanelsFeature, "thickness" | "align" | "through">): BoardOutline[] {
  const lines = g.curves.filter((c) => c.kind === "line" && !c.construction && !c.projected);
  const points = lines.flatMap((c) => (c.kind === "line" ? [pointPos(g, c.p1), pointPos(g, c.p2)] : []));
  const t = feature.thickness;
  const boards: BoardOutline[] = [];
  const ends: BoardLine[] = [];
  for (const line of lines) {
    if (line.kind !== "line") continue;
    const a = pointPos(g, line.p1);
    const b = pointPos(g, line.p2);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < MIN_LENGTH) continue;
    const n: Vec2 = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    // Offsets of the two long faces along n: inside the outline, centred, or outside.
    const side = outlineSide(points, a, n);
    let [lo, hi] = [-t / 2, t / 2];
    if (side !== 0 && feature.align !== "center") {
      const toward = feature.align === "inside" ? side : -side;
      [lo, hi] = toward > 0 ? [0, t] : [-t, 0];
    }
    const at = (p: Vec2, d: number): Vec2 => [p[0] + n[0] * d, p[1] + n[1] * d];
    const vertical = Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]);
    boards.push({
      lineId: line.id,
      polygon: [at(a, lo), at(b, lo), at(b, hi), at(a, hi)],
      through: feature.through === "miter" ? side !== 0 : feature.through === "vertical" ? vertical : !vertical,
      cutBy: [],
    });
    ends.push({ a, b, n, lo, hi });
  }
  if (feature.through === "miter") miterCorners(boards, ends);
  for (const board of boards) {
    if (board.through) continue;
    board.cutBy = boards.flatMap((other, j) => (other !== board && other.through && overlap(board.polygon, other.polygon) ? [j] : []));
  }
  return boards;
}

function polygonDrawing(poly: Vec2[]): Drawing {
  const [first, ...rest] = poly as [Vec2, ...Vec2[]];
  let pen = draw(first);
  for (const p of rest) pen = pen.lineTo(p);
  return pen.close();
}

export function buildPanels(feature: PanelsFeature, lookup: OutputLookup): SolidsOutput {
  requirePositive(feature.thickness, "L'épaisseur des panneaux");
  if (!(Math.abs(feature.depth) >= MIN_LENGTH)) throw new GeometryError(`${feature.name} : la profondeur des panneaux ne peut pas être nulle.`);
  const profile = requireProfile(lookup, feature.sketch);
  const boards = boardOutlines(profile.geometry, feature);
  if (boards.length === 0) throw new GeometryError(`${feature.name} : l'esquisse ne contient aucune ligne à transformer en panneau.`);
  const shapes: Shape3D[] = [];
  try {
    for (const board of boards) {
      let section = polygonDrawing(board.polygon);
      for (const j of board.cutBy) section = section.cut(polygonDrawing((boards[j] as BoardOutline).polygon));
      const solid = onProfilePlane(section, profile).extrude(feature.depth) as Shape3D;
      if (!isShapeValid(solid)) {
        solid.delete();
        throw new GeometryError(`${feature.name} : le panneau de la ligne « ${board.lineId} » est invalide.`);
      }
      shapes.push(solid);
    }
  } catch (error) {
    for (const s of shapes) s.delete();
    if (error instanceof GeometryError) throw error;
    throw new GeometryError(`${feature.name} : un panneau n'a pas pu être construit (deux lignes confondues ?).`);
  }
  return { kind: "solids", shapes };
}
