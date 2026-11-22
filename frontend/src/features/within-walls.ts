/**
 * « Aménager ce corps » : les étagères et cloisons de la Répartition posée dans un corps vont jusqu'à ses parois, même
 * en biais — une étagère d'un cadre aux côtés penchés en prend la pente à ses deux bouts — et les suivent à chaque
 * recalcul. Un élément qui touche le bord de l'ouverture (un bout d'étagère, le haut d'une cloison) y est allongé loin
 * dans son sens, puis recoupé par les parois : on garde le morceau où il était. Ce qui bute sur une cloison ou une
 * étagère de la Répartition reste comme il est.
 */
import { basicFaceExtrusion, measureVolume, Vector, type Shape3D } from "replicad";
import type { BodyHost, Vec3 } from "../document/types";
import type { SketchFrame } from "../sketcher/frame";
import { requireSolid, type OutputLookup } from "./common";

const dot = (a: Vec3, b: readonly number[]) => a[0] * b[0]! + a[1] * b[1]! + a[2] * b[2]!;
/** Closer than this to the edge of the opening, an end touches it (mm). */
const TOUCH = 0.5;
/** How far an end is drawn out before the walls cut it (mm): past any piece of furniture. */
const REACH = 20000;

/**
 * The element between the walls of `host` (the opening's box in the sketch's u, v), or as it is when it touches none.
 * `lean`: its length turned in the sketch's plane along this direction first (a shelf square to a slanted wall).
 */
export function withinWalls(prism: Shape3D, host: BodyHost, frame: SketchFrame, lookup: OutputLookup, lean?: Vec3): Shape3D {
  const [min, max] = prism.boundingBox.bounds;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [(k & 1 ? max : min)[0]!, (k & 2 ? max : min)[1]!, (k & 4 ? max : min)[2]!]);
  const span = (axis: Vec3) => {
    const at = corners.map((c) => dot(axis, c) - dot(axis, frame.origin));
    return [Math.min(...at), Math.max(...at)] as const;
  };
  const [u0, v0, u1, v1] = host.box;
  const [su, sv] = [span(frame.u), span(frame.v)];
  // Along its length only: a shelf by its ends, a cloison by its top and bottom.
  const alongU = su[1] - su[0] >= sv[1] - sv[0];
  const [first, [lo, hi], [b0, b1]] = alongU ? [frame.u, su, [u0, u1]] : [frame.v, sv, [v0, v1]];
  const ends: number[] = [...(Math.abs(lo - b0) < TOUCH ? [-1] : []), ...(Math.abs(hi - b1) < TOUCH ? [1] : [])];
  const turned = lean ? leaned(prism, first, frame, lean, [(min[0]! + max[0]!) / 2, (min[1]! + max[1]!) / 2, (min[2]! + max[2]!) / 2]) : null;
  if (turned) prism = turned.prism;
  const axis = turned?.axis ?? first;
  if (!ends.length) return prism;
  const walls = host.bodies.flatMap((id) => {
    try {
      return [requireSolid(lookup, id).shape];
    } catch {
      return [];
    }
  });
  if (!walls.length) return prism;
  // Drawn out by its end faces, then cut by the walls.
  let long: Shape3D = prism.clone() as Shape3D;
  for (const sign of ends) {
    const face = prism.faces.find((f) => {
      if (f.geomType !== "PLANE") return false;
      const n = f.normalAt(f.center);
      const out = (n.x * axis[0] + n.y * axis[1] + n.z * axis[2]) * sign > 0.9999;
      n.delete();
      return out;
    });
    if (!face) continue;
    const way = new Vector([axis[0] * sign * REACH, axis[1] * sign * REACH, axis[2] * sign * REACH]);
    const tail = basicFaceExtrusion(face, way) as Shape3D;
    way.delete();
    const fused: Shape3D = long.fuse(tail);
    long.delete();
    tail.delete();
    long = fused;
  }
  for (const wall of walls) {
    const cut: Shape3D = long.cut(wall);
    long.delete();
    long = cut;
  }
  // The piece where the element was (the others are past the walls).
  let best: Shape3D | null = null;
  let most = 0;
  for (const solid of long.solids) {
    const common = solid.intersect(prism);
    const volume = measureVolume(common);
    common.delete();
    if (volume <= most) continue;
    best?.delete();
    best = solid.clone() as Shape3D;
    most = volume;
  }
  long.delete();
  if (!best) return prism;
  prism.delete();
  return best;
}

/** The element turned about `center` in the sketch's plane, its length `axis` along `lean` there; null: no turn (along the normal, or already so). */
function leaned(prism: Shape3D, axis: Vec3, frame: SketchFrame, lean: Vec3, center: Vec3): { prism: Shape3D; axis: Vec3 } | null {
  const [lu, lv] = [dot(lean, frame.u), dot(lean, frame.v)];
  if (Math.hypot(lu, lv) < 1e-6) return null;
  const [au, av] = [dot(axis, frame.u), dot(axis, frame.v)];
  // A shelf's length is a line: the smallest turn, within a quarter turn either way.
  let turn = Math.atan2(lv, lu) - Math.atan2(av, au);
  while (turn > Math.PI / 2) turn -= Math.PI;
  while (turn <= -Math.PI / 2) turn += Math.PI;
  if (Math.abs(turn) < 1e-9) return null;
  const n = frame.normal;
  // u turns toward v about the normal (v = normal × u).
  const across: Vec3 = [n[1] * axis[2] - n[2] * axis[1], n[2] * axis[0] - n[0] * axis[2], n[0] * axis[1] - n[1] * axis[0]];
  const [c, s] = [Math.cos(turn), Math.sin(turn)];
  // (rotate releases the shape it turns)
  const turned = prism.rotate((turn * 180) / Math.PI, center, n) as Shape3D;
  return { prism: turned, axis: [0, 1, 2].map((i) => c * axis[i]! + s * across[i]!) as Vec3 };
}
