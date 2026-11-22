/**
 * « Aménager ce corps » : les étagères et cloisons de la Répartition posée dans un corps vont jusqu'à ses parois, même
 * en biais — une étagère d'un cadre aux côtés penchés en prend la pente à ses deux bouts — et les suivent à chaque
 * recalcul. Un élément qui touche le bord de l'ouverture (un bout d'étagère, le haut d'une cloison) y est allongé loin
 * dans son sens, puis recoupé par les parois : on garde le morceau où il était. Ce qui bute sur une cloison ou une
 * étagère de la Répartition reste comme il est.
 */
import { basicFaceExtrusion, drawRectangle, measureVolume, Plane, Vector, type Shape3D } from "replicad";
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
  // Turned, both ends are drawn out: one on a wall goes to it, the other back to where it stood (a cloison, a shelf).
  const grow = turned ? [-1, 1] : ends;
  if (!grow.length) return prism;
  const walls = host.bodies.flatMap((id) => {
    try {
      return [requireSolid(lookup, id).shape];
    } catch {
      return [];
    }
  });
  if (!walls.length && !turned) return prism;
  // Drawn out by its end faces, then cut by the walls.
  let long: Shape3D = prism.clone() as Shape3D;
  for (const sign of grow) {
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
  for (const sign of grow.filter((g) => !ends.includes(g))) {
    // The plane square to its first length where that end stood, the element kept on its side.
    const at = sign < 0 ? lo : hi;
    const point = [0, 1, 2].map((i) => frame.origin[i]! + first[i]! * at) as Vec3;
    const plane = new Plane(point, null, first.map((x) => -sign * x) as Vec3);
    const slab = drawRectangle(2 * REACH, 2 * REACH).sketchOnPlane(plane).extrude(REACH) as Shape3D;
    plane.delete();
    const kept: Shape3D = long.intersect(slab);
    long.delete();
    slab.delete();
    long = kept;
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

/** An edge of a door or a back farther than this from the edge of the opening is not on a wall (mm). */
const NEAR = 30;

/** The plane of the wall face met from `c` along `d` (the nearest, facing back), or null. */
function wallPlane(walls: readonly Shape3D[], c: Vec3, d: Vec3, normal: Vec3): { point: Vec3; normal: Vec3 } | null {
  let best: { point: Vec3; normal: Vec3; t: number } | null = null;
  for (const wall of walls) {
    for (const face of wall.faces) {
      if (face.geomType !== "PLANE") continue;
      const o = face.center;
      const m = face.normalAt(o);
      const [p, n]: [Vec3, Vec3] = [[o.x, o.y, o.z], [m.x, m.y, m.z]];
      m.delete();
      // Facing the element, across the sketch's plane (not the front or back of a board).
      const facing = dot(n, d);
      if (facing > -0.1 || Math.abs(dot(n, normal)) > 0.9) continue;
      const t = (dot(n, p) - dot(n, c)) / facing;
      const hit = [0, 1, 2].map((i) => c[i]! + d[i]! * t);
      // Within the face, whatever its depth (a door in front of the walls is still bounded by them).
      const [lo, hi] = face.boundingBox.bounds;
      const inside = [0, 1, 2].every((i) => Math.abs(normal[i]!) > 0.9 || (hit[i]! > lo[i]! - 1 && hit[i]! < hi[i]! + 1));
      if (inside && (!best || Math.abs(t) < Math.abs(best.t))) best = { point: p, normal: n, t };
    }
  }
  return best;
}

/**
 * A door or the back of a niche in a body furnished: each of its edges on a wall goes to that wall's face, taking its
 * slope, and keeps the gap (or the overlay) it had at the edge of the opening. `from`, `to`: its box in the niche's
 * frame (u, v, w). The others, and a drawer, as they are.
 */
export function toWallPlanes(solid: Shape3D, [from, to]: readonly [Vec3, Vec3], host: BodyHost, frame: SketchFrame, lookup: OutputLookup): Shape3D {
  const [u0, v0, u1, v1] = host.box;
  const lo: Vec3 = [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.min(from[2], to[2])];
  const hi: Vec3 = [Math.max(from[0], to[0]), Math.max(from[1], to[1]), Math.max(from[2], to[2])];
  const world = (u: number, v: number, w: number): Vec3 => [0, 1, 2].map((i) => frame.origin[i]! + frame.u[i]! * u + frame.v[i]! * v + frame.normal[i]! * w) as Vec3;
  // Each edge near the opening's: its way out, its middle, and its gap to the opening's edge (negative: overlaid).
  const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] as const;
  const edges = [
    { d: frame.u.map((x) => -x) as Vec3, at: world(lo[0], mid[1], mid[2]), gap: lo[0] - u0 },
    { d: frame.u, at: world(hi[0], mid[1], mid[2]), gap: u1 - hi[0] },
    { d: frame.v.map((x) => -x) as Vec3, at: world(mid[0], lo[1], mid[2]), gap: lo[1] - v0 },
    { d: frame.v, at: world(mid[0], hi[1], mid[2]), gap: v1 - hi[1] },
  ].filter((e) => Math.abs(e.gap) < NEAR);
  if (!edges.length) return solid;
  const walls = host.bodies.flatMap((id) => {
    try {
      return [requireSolid(lookup, id).shape];
    } catch {
      return [];
    }
  });
  for (const edge of edges) {
    const plane = wallPlane(walls, edge.at, edge.d, frame.normal);
    if (!plane) continue;
    // The wall's face moved back by the gap: where this edge goes.
    const n = plane.normal;
    const q = [0, 1, 2].map((i) => plane.point[i]! + n[i]! * edge.gap) as Vec3;
    const face = solid.faces.find((f) => {
      if (f.geomType !== "PLANE") return false;
      const m = f.normalAt(f.center);
      const out = m.x * edge.d[0] + m.y * edge.d[1] + m.z * edge.d[2] > 0.9999;
      m.delete();
      return out;
    });
    if (!face) continue;
    // Out to its farthest point on that plane, then cut by it: the edge takes the wall's slope.
    const travel = Math.max(0, ...face.edges.flatMap((e) => [e.startPoint, e.endPoint]).map((v) => {
      const p: Vec3 = [v.x, v.y, v.z];
      v.delete();
      return (dot(n, q) - dot(n, p)) / dot(n, edge.d);
    }));
    let next: Shape3D = solid;
    if (travel > 1e-3) {
      const way = new Vector(edge.d.map((x) => x * travel) as Vec3);
      const tail = basicFaceExtrusion(face, way) as Shape3D;
      way.delete();
      next = solid.fuse(tail);
      tail.delete();
      solid.delete();
    }
    const cut = new Plane(q, null, n);
    const slab = drawRectangle(2 * REACH, 2 * REACH).sketchOnPlane(cut).extrude(REACH) as Shape3D;
    cut.delete();
    solid = next.intersect(slab);
    next.delete();
    slab.delete();
  }
  return solid;
}
