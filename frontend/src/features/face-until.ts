/**
 * « Prolonger élément » gardé, dans le noyau : une face plane d'une pièce va jusqu'au plan d'une face d'un autre corps,
 * retrouvée à chaque recalcul (la pièce la suit). Parallèle, la face avance (ou recule) jusqu'à ce plan ; inclinée, la
 * pièce est prolongée jusqu'à son point le plus loin puis recoupée par ce plan : son bout en prend la pente (une
 * plinthe sous un mur en biais, un dessus sous un rampant). Le sens donne l'opération : ajouter dehors, creuser dedans.
 */
import { basicFaceExtrusion, drawRectangle, Plane, Vector, type Face, type Shape3D } from "replicad";
import type { Vec3 } from "../document/types";
import { GeometryError } from "../geometry/kernel";
import { travelTo } from "../document/extend-reach";

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** Far enough to hold any piece (mm): the side of the plane kept. */
const REACH = 1e5;

/** The corners of a face (its edges' ends) and its centre. */
function cornersOf(face: Face, center: Vec3): Vec3[] {
  const out: Vec3[] = [center];
  for (const edge of face.edges) {
    for (const v of [edge.startPoint, edge.endPoint]) {
      out.push([v.x, v.y, v.z]);
      v.delete();
    }
  }
  return out;
}

/** The solid between the face and the plane, and whether it is added (out) or dug (in); null: already on it. */
export function prismUntil(face: Face, plane: { origin: Vec3; normal: Vec3 }, name: string, direction?: Vec3): { prism: Shape3D; out: boolean } | null {
  const c = face.center;
  const center: Vec3 = [c.x, c.y, c.z];
  const raw = face.normalAt(c);
  // Along its normal, or the way chosen (an axis, straight to the face to reach).
  const n = unit(direction ?? [raw.x, raw.y, raw.z]);
  raw.delete();
  const travel = travelTo(cornersOf(face, center), n, { point: plane.origin, normal: plane.normal });
  if (typeof travel === "string") throw new GeometryError(`${name} : ${travel}`);
  const eps = 1e-4;
  // Flat on the plane when every corner goes as far (a way chosen straight to the plane is not enough: the face may
  // still be slanted to it, and its end must then take the plane's slope).
  const flat = travel.max - travel.min < 1e-3;
  let length: number;
  if (flat) length = (travel.min + travel.max) / 2;
  else if (travel.min >= -eps) length = travel.max;
  else if (travel.max <= eps) length = travel.min;
  else throw new GeometryError(`${name} : la face d'arrivée traverse la face à prolonger ; choisissez une face tout entière devant elle (ou derrière).`);
  // Already on it (the other element came back): nothing to add nor dig.
  if (Math.abs(length) < 0.01) return null;
  const vector = new Vector([n[0] * length, n[1] * length, n[2] * length]);
  let prism = basicFaceExtrusion(face, vector) as Shape3D;
  vector.delete();
  if (!flat) {
    // Only what stands on the face's side of the plane: the end takes the slope.
    const m = unit(plane.normal);
    const side = Math.sign(dot(sub(center, plane.origin), m)) || 1;
    const cut = new Plane(plane.origin, null, m);
    const slab = drawRectangle(2 * REACH, 2 * REACH).sketchOnPlane(cut).extrude(side * REACH) as Shape3D;
    cut.delete();
    const kept: Shape3D = prism.intersect(slab);
    prism.delete();
    slab.delete();
    prism = kept;
  }
  return { prism, out: length > 0 };
}
