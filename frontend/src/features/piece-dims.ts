/**
 * Les cotes des pièces dans la vue (comme les plans de Polyboard), en géométrie pure : chaque pièce vue de face
 * montre sa largeur, près de son haut, et sa hauteur, un peu à droite du milieu, sur sa face tournée vers l'œil. Les
 * axes viennent de la vue : celui qu'on regarde le long n'est pas coté ; « haut » est celui qui monte à l'écran. Une
 * pièce vue par la tranche (une étagère, un côté vus de face) n'a que sa longueur, le long de sa tranche : la largeur
 * d'une case par son dessous, la hauteur par son côté.
 */
import type { Vec3 } from "../document/types";

export type Box = [Vec3, Vec3];

export interface PieceDim {
  from: Vec3;
  to: Vec3;
  length: number;
  /** The middle of the line, where its value is written. */
  at: Vec3;
}

/** The axis looked along (the camera's main one) and its side, and the axis that goes up on the screen. */
export function viewAxes(toEye: Vec3, up: Vec3): { view: number; side: 1 | -1; up: number; across: number } {
  const view = [0, 1, 2].reduce((a, b) => (Math.abs(toEye[b]!) > Math.abs(toEye[a]!) ? b : a));
  const rest = [0, 1, 2].filter((i) => i !== view);
  const upAxis = rest.reduce((a, b) => (Math.abs(up[b]!) > Math.abs(up[a]!) ? b : a));
  return { view, side: toEye[view]! >= 0 ? 1 : -1, up: upAxis, across: rest.find((i) => i !== upAxis)! };
}

/** The width and height of a box seen this way; seen edge-on (a side under `min` mm), its length only. */
export function pieceDims(box: Box, axes: ReturnType<typeof viewAxes>, min = 40): PieceDim[] {
  const size = (i: number) => box[1][i]! - box[0][i]!;
  const [wide, tall] = [size(axes.across) >= min, size(axes.up) >= min];
  if (!wide && !tall) return [];
  // Just in front of the face towards the eye.
  const face = axes.side > 0 ? box[1][axes.view]! + 0.5 : box[0][axes.view]! - 0.5;
  const point = (across: number, up: number): Vec3 => {
    const p: Vec3 = [0, 0, 0];
    p[axes.view] = face;
    p[axes.across] = across;
    p[axes.up] = up;
    return p;
  };
  const [a0, a1] = [box[0][axes.across]!, box[1][axes.across]!];
  const [u0, u1] = [box[0][axes.up]!, box[1][axes.up]!];
  const line = (from: Vec3, to: Vec3, length: number): PieceDim => ({ from, to, length, at: from.map((v, i) => (v + to[i]!) / 2) as Vec3 });
  // Edge-on: along the middle of its edge.
  if (!tall) return [line(point(a0, (u0 + u1) / 2), point(a1, (u0 + u1) / 2), a1 - a0)];
  if (!wide) return [line(point((a0 + a1) / 2, u0), point((a0 + a1) / 2, u1), u1 - u0)];
  // The width near the top (a quarter down, at most 150 mm); the height a little right of the middle, so that both
  // values stay apart on a low piece.
  const top = u1 - Math.min((u1 - u0) / 4, 150);
  const x = a0 + (a1 - a0) * 0.6;
  return [line(point(a0, top), point(a1, top), a1 - a0), line(point(x, u0), point(x, u1), u1 - u0)];
}
