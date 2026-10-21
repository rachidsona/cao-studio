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
 *   no two boards share material.
 */
import { draw, type Drawing, type Shape3D } from "replicad";
import type { PanelsFeature } from "../document/types";
import type { SketchGeometry } from "../document/sketch";
import { GeometryError, isShapeValid } from "../geometry/kernel";
import { pointPos, type Vec2 } from "../sketcher/edit";
import { MIN_LENGTH, planeOrigin, requirePositive, requireProfile, type OutputLookup } from "./common";
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

/** The boards of a skeleton (pure geometry, no kernel). */
export function boardOutlines(g: SketchGeometry, feature: Pick<PanelsFeature, "thickness" | "align" | "through">): BoardOutline[] {
  const lines = g.curves.filter((c) => c.kind === "line" && !c.construction && !c.projected);
  const points = lines.flatMap((c) => (c.kind === "line" ? [pointPos(g, c.p1), pointPos(g, c.p2)] : []));
  const t = feature.thickness;
  const boards: BoardOutline[] = [];
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
      through: feature.through === "vertical" ? vertical : !vertical,
      cutBy: [],
    });
  }
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
      const solid = section.sketchOnPlane(profile.plane, planeOrigin(profile)).extrude(feature.depth) as Shape3D;
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
