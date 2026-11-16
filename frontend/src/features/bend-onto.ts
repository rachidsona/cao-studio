/**
 * « Cintrer contre un corps rond » : un panneau droit posé contre la face ronde d'un autre corps (un fût, un angle
 * arrondi, l'intérieur d'un anneau) se courbe pour l'épouser — à son épaisseur, sa hauteur le long de l'axe, sa
 * longueur devenue l'arc (mesurée au milieu de l'épaisseur), à partir de là où il touche : le pied de l'axe sur le
 * panneau, chaque point du panneau à la même distance de lui le long de l'arc — un panneau centré sur le fût s'enroule
 * des deux côtés, un panneau qui en part s'enroule dans le sens où il part. Contre l'extérieur d'un fût il s'enroule
 * dehors ; contre l'intérieur d'un anneau, dedans. Un corps qui n'est plus un panneau droit est refusé, en le disant.
 */
import { draw, makeCylinder, measureVolume, Plane, type Face, type Shape3D } from "replicad";
import type { Vec3 } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import { cylinderOf } from "./curved-panel";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The straight board `board` wrapped on the cylindrical face `face` (a new solid; nothing is consumed). */
export function bentOnto(name: string, board: Shape3D, face: Face): Shape3D {
  if (face.geomType !== "CYLINDRE") throw new GeometryError(`${name} : choisissez une face ronde (cylindrique) du corps rond.`);
  const c = cylinderOf(face);
  // The board's own axes, from its straight edges: its height along the cylinder's axis, its length and its thickness
  // across it.
  const edges = board.edges.map((e) => {
    const [a, b] = [e.startPoint, e.endPoint].map((p) => [p.x, p.y, p.z] as Vec3) as [Vec3, Vec3];
    return { a, b, d: sub(b, a), straight: e.geomType === "LINE" };
  });
  const corners = edges.flatMap((e) => [e.a, e.b]);
  const across = edges.filter((e) => e.straight && Math.hypot(...e.d) > 1e-6).map((e) => sub(e.d, c.axis.map((v) => v * dot(e.d, c.axis)) as Vec3)).filter((d) => Math.hypot(...d) > 1e-6 * 1000);
  if (!across.length) throw new GeometryError(`${name} : ce corps n'a pas de côté droit en travers du corps rond ; prenez un panneau droit.`);
  const along = unit(across.reduce((best, d) => (Math.hypot(...d) > Math.hypot(...best) ? d : best)));
  const normal = cross(c.axis, along);
  const span = (dir: Vec3) => {
    const v = corners.map((p) => dot(sub(p, c.centre), dir));
    return [Math.min(...v), Math.max(...v)] as const;
  };
  const [h0, h1] = span(c.axis);
  const [s0, s1] = span(along);
  const [n0, n1] = span(normal);
  const [height, length, thickness] = [h1 - h0, s1 - s0, n1 - n0];
  // A straight board: its matter fills the box of its three sizes (not a piece already bent, extended or cut).
  if (Math.abs(measureVolume(board) - height * length * thickness) > 0.01 * height * length * thickness) {
    throw new GeometryError(`${name} : ce corps n'est plus un panneau droit (déjà cintré, prolongé ou découpé) ; cintrez un panneau droit, posé le long du corps rond.`);
  }
  if (!(thickness > 0.1) || thickness > Math.min(height, length)) throw new GeometryError(`${name} : posez le panneau à plat le long de la face ronde (son épaisseur vers elle).`);
  // Where it touches: the foot of the axis on the board's line, in the plane across the axis.
  const middleN = (n0 + n1) / 2;
  if (Math.abs(middleN) < thickness) throw new GeometryError(`${name} : le panneau passe par l'axe du corps rond ; posez-le le long de sa face.`);
  const side = Math.sign(middleN);
  const foot = normal.map((v) => v * side) as Vec3;
  // Outside a drum, round it; inside a ring, within it.
  const [inner, outer] = c.convex ? [c.radius, c.radius + thickness] : [c.radius - thickness, c.radius];
  if (!(inner > 1e-6)) throw new GeometryError(`${name} : le panneau est plus épais que le rayon de l'anneau.`);
  const middle = (inner + outer) / 2;
  const angle = length / middle;
  if (angle >= 2 * Math.PI) throw new GeometryError(`${name} : le panneau fait plus que le tour du corps rond (${Math.round(length)} mm pour ${Math.round(2 * Math.PI * middle)} mm de tour).`);
  // Along its length from the foot, round the axis: the way `along` goes there, as the angle grows or falls.
  const footAngle = Math.atan2(dot(foot, c.e2), dot(foot, c.e1));
  const turning = Math.sign(dot(along, cross(c.axis, foot))) || 1;
  const [a0, a1] = [footAngle + (turning * s0) / middle, footAngle + (turning * s1) / middle];
  const [lo, hi] = [Math.min(a0, a1), Math.max(a0, a1)];
  const base = [0, 1, 2].map((i) => c.centre[i]! + c.axis[i]! * h0) as Vec3;
  const tube = (r: number) => makeCylinder(r, height, base, c.axis) as unknown as Shape3D;
  const ring = tube(outer).cut(tube(inner)) as Shape3D;
  const steps = Math.max(2, Math.ceil(angle / (Math.PI / 16)));
  const reach = outer / Math.cos(angle / steps / 2) + 1;
  const points: [number, number][] = [[0, 0], ...Array.from({ length: steps + 1 }, (_, k): [number, number] => {
    const a = lo + ((hi - lo) * k) / steps;
    return [reach * Math.cos(a), reach * Math.sin(a)];
  })];
  let pen = draw(points[0]!);
  for (const p of points.slice(1)) pen = pen.lineTo(p);
  const fan = pen.close().sketchOnPlane(new Plane(base, c.e1, c.axis)).extrude(height) as Shape3D;
  const made = ring.intersect(fan) as Shape3D;
  ring.delete();
  fan.delete();
  return made;
}
