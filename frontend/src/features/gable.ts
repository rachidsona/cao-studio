/**
 * Un toit à deux pans tiré d'une ligne (comme dans SketchUp : une ligne tracée sur le dessus d'un bloc, tirée vers
 * le haut), en géométrie pure. La ligne, parallèle à un bord du dessus, devient le faîtage. Le toit est un prisme
 * triangulaire : sa coupe a pour base toute la largeur du dessus et pour sommet la ligne levée de `height`, et il
 * court sur toute la longueur du dessus. Il s'écrit en une esquisse de la coupe, sur le pignon, extrudée et soudée au
 * bloc. Une ligne hors du milieu donne deux pans inégaux. Arrondi, c'est une voûte : la coupe est l'arc qui passe
 * par les deux bords du dessus et par le faîtage levé.
 */
import type { SketchGeometry } from "../document/sketch";
import type { PlaneName, Vec3 } from "../document/types";

export type RoofShape = "gable" | "arch";

export type Box = [Vec3, Vec3];

export interface GablePlan {
  /** The gable's plane and its offset (sketcher/frame.ts: XZ looks towards −Y, YZ towards +X). */
  plane: PlaneName;
  offset: number;
  /** The section, in the sketch's (u, v): the two eaves then the ridge. */
  triangle: [number, number][];
  /** Along the plane's normal: the length of the roof. */
  distance: number;
  /** The ridge, in the model (for the arrow that raises it). */
  ridge: [Vec3, Vec3];
}

/** Off the top face by more than this, or askew by more than this share of its length: not a ridge line. */
const ON_TOP = 2;
const SKEW = 0.02;

/** The body (its box) whose top this line lies on, among these; null when none. */
export function topUnder(line: [Vec3, Vec3], boxes: readonly { id: string; box: Box }[]): { id: string; box: Box } | null {
  const mid = [0, 1, 2].map((i) => (line[0][i]! + line[1][i]!) / 2) as Vec3;
  const on = boxes.filter(({ box }) => Math.abs(box[1][2] - mid[2]) <= ON_TOP && line.every((p) => Math.abs(p[2] - box[1][2]) <= ON_TOP) && mid[0] > box[0][0] && mid[0] < box[1][0] && mid[1] > box[0][1] && mid[1] < box[1][1]);
  // The smallest: a block standing on a larger one.
  return on.sort((a, b) => area(a.box) - area(b.box))[0] ?? null;
}

const area = (b: Box) => (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);

/** The roof raised from this line on the top of this box, or why not. */
export function gablePlan(line: [Vec3, Vec3], box: Box, height: number): GablePlan | string {
  if (!(height > 0)) return "La hauteur du faîtage doit être positive.";
  const [a, b] = line;
  const [dx, dy] = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
  const length = Math.hypot(dx, dy);
  if (length < 1) return "La ligne est trop courte.";
  if (Math.min(dx, dy) > SKEW * length) return "Tracez le faîtage parallèle à un bord du dessus.";
  const top = box[1][2];
  // Along X: the section in the plane YZ at the low end, the roof running towards +X.
  if (dx >= dy) {
    const y = (a[1] + b[1]) / 2;
    if (y <= box[0][1] || y >= box[1][1]) return "La ligne doit être sur le dessus.";
    return {
      plane: "YZ", offset: box[0][0], distance: box[1][0] - box[0][0],
      triangle: [[box[0][1], top], [box[1][1], top], [y, top + height]],
      ridge: [[box[0][0], y, top + height], [box[1][0], y, top + height]],
    };
  }
  // Along Y: the section in the plane XZ (its normal is −Y) at the high end, the roof running towards −Y.
  const x = (a[0] + b[0]) / 2;
  if (x <= box[0][0] || x >= box[1][0]) return "La ligne doit être sur le dessus.";
  return {
    plane: "XZ", offset: -box[1][1], distance: box[1][1] - box[0][1],
    triangle: [[box[0][0], top], [box[1][0], top], [x, top + height]],
    ridge: [[x, box[0][1], top + height], [x, box[1][1], top + height]],
  };
}

/**
 * The section drawn in the gable's sketch: the triangle, or (arch) the arc through the two eaves and the ridge,
 * counter-clockwise from the eave at the high u to the one at the low u, closed by the eaves line.
 */
export function sectionGeometry(triangle: [number, number][], shape: RoofShape): SketchGeometry {
  const [p1, p2, p3] = triangle as [[number, number], [number, number], [number, number]];
  const points = [{ id: "p1", x: p1[0], y: p1[1] }, { id: "p2", x: p2[0], y: p2[1] }, { id: "p3", x: p3[0], y: p3[1] }];
  if (shape === "gable") {
    return { points, curves: [{ id: "l1", kind: "line", p1: "p1", p2: "p2" }, { id: "l2", kind: "line", p1: "p2", p2: "p3" }, { id: "l3", kind: "line", p1: "p3", p2: "p1" }], constraints: [] };
  }
  // The circle through the three points (the eaves share a height: its centre is above the middle of them).
  const mid = (p1[0] + p2[0]) / 2;
  const half = Math.abs(p2[0] - p1[0]) / 2;
  const [dx, dy] = [p3[0] - mid, p3[1] - p1[1]];
  const cy = p1[1] + (dx * dx + dy * dy - half * half) / (2 * dy);
  const radius = Math.hypot(half, p1[1] - cy);
  const [low, high] = p1[0] < p2[0] ? ["p1", "p2"] : ["p2", "p1"];
  const angle = (id: string) => {
    const p = points.find((q) => q.id === id)!;
    return Math.atan2(p.y - cy, p.x - mid);
  };
  let endAngle = angle(low);
  const startAngle = angle(high);
  while (endAngle <= startAngle) endAngle += 2 * Math.PI;
  return {
    points: [{ id: low, x: points.find((q) => q.id === low)!.x, y: p1[1] }, { id: high, x: points.find((q) => q.id === high)!.x, y: p1[1] }, { id: "pc", x: mid, y: cy }],
    curves: [
      { id: "a1", kind: "arc", center: "pc", start: high, end: low, radius, startAngle, endAngle },
      { id: "l1", kind: "line", p1: low, p2: high },
    ],
    constraints: [],
  };
}
