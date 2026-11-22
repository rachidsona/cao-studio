/**
 * « Prolonger élément » gardé, dans le noyau : une face plane d'une pièce va jusqu'au plan d'une face d'un autre corps,
 * retrouvée à chaque recalcul (la pièce la suit). Parallèle, la face avance (ou recule) jusqu'à ce plan ; inclinée, la
 * pièce est prolongée jusqu'à son point le plus loin puis recoupée par ce plan : son bout en prend la pente (une
 * plinthe sous un mur en biais, un dessus sous un rampant). Le sens donne l'opération : ajouter dehors, creuser dedans.
 */
import { basicFaceExtrusion, drawRectangle, makePolygon, makeSolid, Plane, Vector, type Face, type Shape3D } from "replicad";
import type { Vec3 } from "../document/types";
import { convexHull } from "../geometry/hull";
import { GeometryError, isShapeValid } from "../geometry/kernel";
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
export function prismUntil(face: Face, plane: { origin: Vec3; normal: Vec3 }, name: string, direction?: Vec3, arrival?: Face): { prism: Shape3D; out: boolean } | null {
  const c = face.center;
  const center: Vec3 = [c.x, c.y, c.z];
  const raw = face.normalAt(c);
  // Along its normal, or the way chosen (an axis, straight to the face to reach).
  const n = unit(direction ?? [raw.x, raw.y, raw.z]);
  raw.delete();
  const travel = travelTo(cornersOf(face, center), n, { point: plane.origin, normal: plane.normal });
  if (typeof travel === "string") throw new GeometryError(`${name} : ${travel}`);
  if (arrival) return covering(face, arrival, center, travel, name);
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

/**
 * « Couvrir la face d'arrivée » : the solid that joins the face to the whole face to reach (a top brought down to a
 * shelf that runs wider, up to a slanted side), added when that face is in front, dug when behind.
 * shortcut: the hull of both faces' corners — a notched face or a curved edge counts by its corners; upgrade to a loft if one is needed.
 */
function covering(face: Face, arrival: Face, center: Vec3, travel: { min: number; max: number }, name: string): { prism: Shape3D; out: boolean } | null {
  const eps = 1e-4;
  if (travel.min < -eps && travel.max > eps) throw new GeometryError(`${name} : la face d'arrivée traverse la face à prolonger ; choisissez une face tout entière devant elle (ou derrière).`);
  if (Math.max(Math.abs(travel.min), Math.abs(travel.max)) < 0.01) return null;
  const a = arrival.center;
  const facets = convexHull([...cornersOf(face, center), ...cornersOf(arrival, [a.x, a.y, a.z])]);
  a.delete();
  if (!facets) throw new GeometryError(`${name} : les deux faces sont dans le même plan.`);
  const faces = facets.map((corners) => makePolygon(corners));
  const prism = makeSolid(faces) as unknown as Shape3D;
  for (const f of faces) f.delete();
  if (!isShapeValid(prism)) {
    prism.delete();
    throw new GeometryError(`${name} : la face d'arrivée ne peut pas être couverte depuis cette face.`);
  }
  return { prism, out: travel.max > eps };
}
