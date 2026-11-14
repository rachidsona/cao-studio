/**
 * Le panneau d'une face cylindrique (un fût, une ceinture, un angle arrondi, une façade cintrée), pour « Panneaux sur
 * faces » (paneling.ts) : la bande du volume prise sous la face, de l'épaisseur voulue, vers l'intérieur — une planche
 * cintrée. On lit l'axe et le rayon de la face à trois de ses points (sa normale y montre l'axe), puis on garde du volume
 * ce qui est entre ce rayon et ce rayon moins l'épaisseur (plus l'épaisseur pour une face creuse, l'intérieur d'un
 * anneau), dans le secteur qu'occupe la face quand elle ne fait pas le tour entier.
 */
import { draw, makeCylinder, Plane, type Face, type Shape3D } from "replicad";
import type { Vec3 } from "../document/types";

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const vec = (v: { x: number; y: number; z: number }): Vec3 => [v.x, v.y, v.z];

export interface CylinderOf {
  /** A point of the axis, its direction, the radius. */
  centre: Vec3;
  axis: Vec3;
  radius: number;
  /** The material is inside the radius (the outside of a drum); false: outside it (the inside of a ring). */
  convex: boolean;
  /** The angles the face spans about the axis, from `e1` towards `e2` (radians), unless it goes all round. */
  span: [number, number] | null;
  e1: Vec3;
  e2: Vec3;
}

/** The cylinder of a cylindrical face, read at its points. */
export function cylinderOf(face: Face): CylinderOf {
  const at = (u: number, v = 0.5) => {
    const p = vec(face.pointOnSurface(u, v));
    return { p, n: unit(vec(face.normalAt(p))) };
  };
  const [a, b] = [at(0.1), at(0.9)];
  const axis = unit(cross(a.n, b.n));
  // p = centre + s · n on both points: s is the radius, its sign whether the normal points away from the axis.
  const dn = sub(a.n, b.n);
  const s = dot(sub(a.p, b.p), dn) / dot(dn, dn);
  const centre = sub(a.p, a.n.map((c) => c * s) as Vec3);
  const e1 = unit(sub(sub(a.p, centre), axis.map((c) => c * dot(sub(a.p, centre), axis)) as Vec3));
  const e2 = cross(axis, e1);
  // The angles of the face's points, unwrapped from one to the next.
  const angles: number[] = [];
  for (let k = 0; k <= 32; k++) {
    const d = sub(at(k / 32).p, centre);
    let angle = Math.atan2(dot(d, e2), dot(d, e1));
    const last = angles.at(-1);
    if (last !== undefined) while (angle - last > Math.PI) angle -= 2 * Math.PI;
    if (last !== undefined) while (angle - last < -Math.PI) angle += 2 * Math.PI;
    angles.push(angle);
  }
  const [lo, hi] = [Math.min(...angles), Math.max(...angles)];
  return { centre, axis, radius: Math.abs(s), convex: s > 0, span: hi - lo > 2 * Math.PI - 0.05 ? null : [lo, hi], e1, e2 };
}

/** The shapes are consumed. */
function boolean(a: Shape3D, b: Shape3D, op: "cut" | "intersect"): Shape3D {
  const made = (op === "cut" ? a.cut(b) : a.intersect(b)) as Shape3D;
  a.delete();
  b.delete();
  return made;
}

/** The board of a cylindrical face of `target`, `thickness` thick, taken inside it. */
export function curvedSlab(target: Shape3D, face: Face, thickness: number): Shape3D {
  const c = cylinderOf(face);
  const box = target.boundingBox;
  const length = 4 * Math.max(box.width, box.height, box.depth, thickness);
  const base = sub(c.centre, c.axis.map((v) => (v * length) / 2) as Vec3);
  const tube = (r: number) => makeCylinder(r, length, base, c.axis) as unknown as Shape3D;
  // Between the face and the thickness inside: under it on a drum, beyond it in a ring.
  const [outer, inner] = c.convex ? [c.radius, c.radius - thickness] : [c.radius + thickness, c.radius];
  let band = inner > 1e-6 ? boolean(tube(outer), tube(inner), "cut") : tube(outer);
  if (c.span) {
    // The sector of the face: a fan from the axis, wide enough to hold the band.
    const [lo, hi] = c.span;
    const steps = Math.max(2, Math.ceil((hi - lo) / (Math.PI / 16)));
    const reach = outer / Math.cos((hi - lo) / steps / 2) + 1;
    const points: [number, number][] = [[0, 0], ...Array.from({ length: steps + 1 }, (_, k): [number, number] => {
      const angle = lo + ((hi - lo) * k) / steps;
      return [reach * Math.cos(angle), reach * Math.sin(angle)];
    })];
    let d = draw(points[0]!);
    for (const p of points.slice(1)) d = d.lineTo(p);
    const fan = d.close().sketchOnPlane(new Plane(base, c.e1, c.axis)).extrude(length) as Shape3D;
    band = boolean(band, fan, "intersect");
  }
  return boolean(target.clone(), band, "intersect");
}
