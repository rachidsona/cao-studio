/**
 * « Cintrer contre un corps rond » : un panneau droit posé contre la face ronde d'un autre corps (un fût, un angle
 * arrondi, l'intérieur d'un anneau) se courbe pour l'épouser — à son épaisseur, sa hauteur le long de l'axe, sa
 * longueur devenue l'arc (mesurée au milieu de l'épaisseur), centré là où il était. Contre l'extérieur d'un fût il
 * s'enroule dehors ; contre l'intérieur d'un anneau, dedans.
 */
import { draw, makeCylinder, Plane, type Face, type Shape3D } from "replicad";
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
  // The board's corners, in the cylinder's terms: along its axis, out from it, round it.
  const corners: Vec3[] = board.edges.flatMap((e) => [e.startPoint, e.endPoint].map((p) => [p.x, p.y, p.z] as Vec3));
  const mid = corners.reduce((s, p) => [s[0] + p[0] / corners.length, s[1] + p[1] / corners.length, s[2] + p[2] / corners.length] as Vec3, [0, 0, 0] as Vec3);
  const d = sub(mid, c.centre);
  const out = sub(d, c.axis.map((v) => v * dot(d, c.axis)) as Vec3);
  if (Math.hypot(...out) < 1e-6) throw new GeometryError(`${name} : le panneau est sur l'axe du corps rond ; posez-le contre sa face.`);
  const radial = unit(out);
  const round = cross(c.axis, radial);
  const span = (dir: Vec3) => {
    const v = corners.map((p) => dot(sub(p, c.centre), dir));
    return [Math.min(...v), Math.max(...v)] as const;
  };
  const [h0, h1] = span(c.axis);
  const [r0, r1] = span(radial);
  const [t0, t1] = span(round);
  const [height, thickness, length] = [h1 - h0, r1 - r0, t1 - t0];
  if (!(thickness > 0.1) || thickness > Math.min(height, length)) throw new GeometryError(`${name} : posez le panneau à plat contre la face ronde (son épaisseur vers elle).`);
  // Outside a drum, round it; inside a ring, within it.
  const [inner, outer] = c.convex ? [c.radius, c.radius + thickness] : [c.radius - thickness, c.radius];
  if (!(inner > 1e-6)) throw new GeometryError(`${name} : le panneau est plus épais que le rayon de l'anneau.`);
  const middle = (inner + outer) / 2;
  const angle = length / middle;
  if (angle >= 2 * Math.PI) throw new GeometryError(`${name} : le panneau fait plus que le tour du corps rond (${Math.round(length)} mm pour ${Math.round(2 * Math.PI * middle)} mm de tour).`);
  // Its middle where the board's was, round the axis.
  const centreAngle = Math.atan2(dot(radial, c.e2), dot(radial, c.e1)) + (t0 + t1) / 2 / middle;
  const [lo, hi] = [centreAngle - angle / 2, centreAngle + angle / 2];
  const base = [0, 1, 2].map((i) => c.centre[i]! + c.axis[i]! * h0) as Vec3;
  const tube = (r: number) => makeCylinder(r, height, base, c.axis) as unknown as Shape3D;
  const ring = tube(outer).cut(tube(inner)) as Shape3D;
  const steps = Math.max(2, Math.ceil(angle / (Math.PI / 16)));
  const reach = outer / Math.cos(angle / steps / 2) + 1;
  const points: [number, number][] = [[0, 0], ...Array.from({ length: steps + 1 }, (_, k): [number, number] => {
    const a = lo + (angle * k) / steps;
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
