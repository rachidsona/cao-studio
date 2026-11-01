/**
 * Recouvrement (les « Links » de Polyboard) : à l'angle de deux planches, l'une passe devant le chant de l'autre. Inverser
 * le recouvrement, c'est raccourcir celle qui passait de l'épaisseur de l'autre, à ce bout-là, et rallonger l'autre
 * de l'épaisseur de la première, vers elle : un dessus posé entre les côtés devient un dessus qui les couvre. En
 * calcul pur sur les boîtes des planches ; l'outil (app/overlap-tool.ts) en fait des Étirer (et un Déplacer quand c'est
 * le bout bas d'une planche qui bouge).
 */
import type { Axis, Vec3 } from "../document/types";
import { contactOf, type Box } from "./joinery";

/** One change of a board: its end at the low or high side of `axis` moved by `distance` (+ longer, − shorter). */
export interface EndChange {
  board: "a" | "b";
  axis: Axis;
  end: "low" | "high";
  distance: number;
}

const size = (b: Box, i: number) => (b[1][i] as number) - (b[0][i] as number);
const thicknessAxis = (b: Box): Axis => {
  const s = [0, 1, 2].map((i) => size(b, i));
  return s.indexOf(Math.min(...s)) as Axis;
};
const TOLERANCE = 0.05;

/**
 * The changes that swap the overlap at the corner of `a` and `b`: the board whose face is in the joint (it runs
 * past the other's edge) gets shorter by the other's thickness, the other longer by its thickness. A string says why
 * they do not make a corner.
 */
export function swapOverlap(a: Box, b: Box): EndChange[] | string {
  const c = contactOf(a, b);
  if (!c) return "Ces deux planches ne se touchent pas.";
  const aFace = thicknessAxis(a) === c.axis;
  const bFace = thicknessAxis(b) === c.axis;
  if (aFace === bFace) return "Il faut le chant de l'une contre la face de l'autre.";
  // `through`: the board whose face is in the joint; `butt`: the one whose edge touches it.
  const [through, butt, throughName, buttName] = aFace ? [a, b, "a", "b"] as const : [b, a, "b", "a"] as const;
  const across = thicknessAxis(butt);
  // The butting board must lie at an end of the through one (a corner), not in its middle (a shelf).
  const atHigh = Math.abs(butt[1][across] - through[1][across]) <= TOLERANCE;
  const atLow = Math.abs(butt[0][across] - through[0][across]) <= TOLERANCE;
  if (!atHigh && !atLow) return "Les planches ne forment pas un angle : l'une est au milieu de l'autre.";
  const throughIsLow = Math.abs(through[1][c.axis] - c.plane) <= TOLERANCE;
  return [
    { board: throughName, axis: across, end: atHigh ? "high" : "low", distance: -size(butt, across) },
    { board: buttName, axis: c.axis, end: throughIsLow ? "low" : "high", distance: size(through, c.axis) },
  ];
}

/** Where to stretch a box to move one of its ends: the plane through its middle, and the move after it for a low end. */
export function stretchOf(box: Box, change: EndChange): { position: number; distance: number; translate: Vec3 | null } {
  const position = Number((((box[0][change.axis] as number) + (box[1][change.axis] as number)) / 2).toFixed(4));
  if (change.end === "high") return { position, distance: change.distance, translate: null };
  // The stretch moves the high end; moving the whole board back by the same keeps the high end and moves the low one.
  const translate: Vec3 = [0, 0, 0];
  translate[change.axis] = -change.distance;
  return { position, distance: change.distance, translate };
}
