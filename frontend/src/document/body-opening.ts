/**
 * « Aménager ce corps » : l'ouverture d'un corps creux — un cadre, un caisson fait de panneaux, un corps vidé — reçoit
 * une Répartition posée dedans (`inside`) : ses côtés, son dessus et son dessous sont les parois du corps, rien n'est
 * fait en double, et Étagères, Cloisons, Niche, Tiroirs, Penderie et Portes y marchent comme dans un dressing.
 * L'ouverture se trouve depuis le milieu du corps : un rayon dans chaque sens jusqu'à la première paroi (aucune : le
 * corps est ouvert de ce côté). On la voit par le côté ouvert tourné vers l'œil ; le haut reste en haut. Pur.
 */
import { withCaissonPlaced } from "./caisson-spec";
import { findFeature } from "./operations";
import { consumedBodies, featureOfBody, PART_SEPARATOR, type BodyHost, type CadDocument, type PlaneFrame, type Vec3 } from "./types";

export interface BodyMesh {
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface Opening {
  /** Back plane of the Répartition, at the walls' outside corner (x along its width, y up, the normal to the front). */
  frame: PlaneFrame;
  width: number;
  height: number;
  depth: number;
  /** Thickness of the walls round it (its outer panels, not made). */
  wall: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r6 = (v: number) => Number(v.toFixed(6));

/** Every distance at which the ray from `o` along `d` crosses the meshes (Möller–Trumbore). */
function hits(meshes: readonly BodyMesh[], o: Vec3, d: Vec3): number[] {
  const out: number[] = [];
  for (const m of meshes) {
    const at = (i: number): Vec3 => [m.vertices[3 * i]!, m.vertices[3 * i + 1]!, m.vertices[3 * i + 2]!];
    for (let k = 0; k + 2 < m.indices.length; k += 3) {
      const a = at(m.indices[k]!);
      const [e1, e2] = [sub(at(m.indices[k + 1]!), a), sub(at(m.indices[k + 2]!), a)];
      const p = cross(d, e2);
      const det = dot(e1, p);
      if (Math.abs(det) < 1e-12) continue;
      const t0 = sub(o, a);
      const u = dot(t0, p) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(t0, e1);
      const v = dot(d, q) / det;
      if (v < 0 || u + v > 1) continue;
      const t = dot(e2, q) / det;
      if (t > 1e-6) out.push(t);
    }
  }
  return out;
}

/**
 * The opening of these bodies (their box `outer`), seen from `eye` (the view's direction, from the eye into the
 * scene) with `up` the screen's up; or why there is none.
 */
export function openingOf(meshes: readonly BodyMesh[], outer: readonly [Vec3, Vec3], eye: Vec3, up: Vec3): Opening | string {
  const c: Vec3 = [0, 1, 2].map((i) => (outer[0][i]! + outer[1][i]!) / 2) as Vec3;
  // Its middle inside a wall: a solid body, nothing to furnish.
  const probe = hits(meshes, c, [0.577, 0.5771, 0.5779]);
  if (probe.length % 2 === 1) return "Ce corps est plein : videz-le d'abord (« Séparer les côtés » ou « Vider un corps »), puis aménagez-le.";
  // Along each axis, both ways: the first wall, or none (open).
  const inner: [Vec3, Vec3] = [[...outer[0]] as Vec3, [...outer[1]] as Vec3];
  const walls: (number | null)[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const d: Vec3 = [0, 0, 0];
      d[axis] = sign;
      const found = hits(meshes, c, d);
      const near = found.length ? Math.min(...found) : null;
      const end = sign < 0 ? outer[0][axis]! : outer[1][axis]!;
      if (near === null || near >= Math.abs(end - c[axis]!) - 1e-6) {
        walls.push(null);
        continue;
      }
      inner[sign < 0 ? 0 : 1][axis] = r6(c[axis]! + sign * near);
      walls.push(r6(Math.abs(end - (c[axis]! + sign * near))));
    }
  }
  const size = [0, 1, 2].map((i) => inner[1][i]! - inner[0][i]!);
  // However small the piece (a model a few centimetres across, a frame 1 cm thick): an opening is one.
  if (size.some((s) => s < 1)) return "Ce corps n'a pas d'ouverture où poser des étagères.";
  // The front: an open side facing the eye best (else, closed all round, the side facing it); the top between equals.
  const sides = [0, 1, 2].flatMap((axis) => [-1, 1].map((sign) => ({ axis, sign, open: walls[axis * 2 + (sign < 0 ? 0 : 1)] === null, facing: -sign * eye[axis]! + (axis === 2 && sign > 0 ? 1e-3 : 0) })));
  const open = sides.filter((s) => s.open);
  const front = (open.length ? open : sides).reduce((a, b) => (b.facing > a.facing ? b : a));
  // Up: the world's up, unless the front looks up or down; then the screen's.
  const others = [0, 1, 2].filter((a) => a !== front.axis);
  const upAxis = front.axis !== 2 ? 2 : others.reduce((a, b) => (Math.abs(up[b]!) > Math.abs(up[a]!) ? b : a));
  const upSign = upAxis === 2 && front.axis !== 2 ? 1 : Math.sign(up[upAxis]!) || 1;
  const normal: Vec3 = [0, 0, 0];
  normal[front.axis] = front.sign;
  const v: Vec3 = [0, 0, 0];
  v[upAxis] = upSign;
  const u = cross(v, normal).map((x) => x + 0) as Vec3;
  const across = others.find((a) => a !== upAxis)!;
  const wallOf = (axis: number) => [walls[axis * 2], walls[axis * 2 + 1]].filter((w): w is number => w !== null);
  const round = [...wallOf(across), ...wallOf(upAxis)];
  const wall = round.length ? Math.min(...round) : 18;
  // The back corner of the opening on the left and at the bottom, then out by a wall.
  const low = (dir: Vec3): number[] => [0, 1, 2].map((i) => (dir[i]! > 0 ? inner[0][i]! : dir[i]! < 0 ? inner[1][i]! : 0));
  const corner = [0, 1, 2].map((i) => low(u)[i]! + low(v)[i]! + low(normal)[i]!) as Vec3;
  const origin = [0, 1, 2].map((i) => r6(corner[i]! - wall * (u[i]! + v[i]!))) as Vec3;
  return { frame: { origin, xDir: u, normal }, width: r6(size[across]!), height: r6(size[upAxis]!), depth: r6(size[front.axis]!), wall };
}

/**
 * The document with a Répartition in the opening; its sketch, or why it cannot be. `walls`: the bodies round it — what
 * reaches the edge of the opening goes on to them, even slanted, and follows them (features/within-walls.ts).
 */
export function withBodyFurnished(doc: CadDocument, at: Opening, name: string, walls: readonly string[] = []): { doc: CadDocument; sketch: string } | string {
  const e = at.wall;
  const made = withCaissonPlaced(doc, {
    input: { length: at.width + 2 * e, height: at.height + 2 * e, thickness: e, cases: 2, dividers: ["none"], boards: true, plinth: 0, outer: "board", single: "board", double: "side", inside: true },
    depth: at.depth,
    cases: [],
  }, { frame: at.frame, width: r6(at.width + 2 * e), height: r6(at.height + 2 * e), name });
  if (typeof made === "string" || !walls.length) return made;
  const host: BodyHost = { bodies: [...walls], box: [e, e, r6(at.width + e), r6(at.height + e)] };
  const features = made.doc.features.map((f) => (f.id === made.sketch && f.type === "sketch") || (f.type === "extrude" && f.sketch === made.sketch) ? { ...f, host } : f);
  return { ...made, doc: { ...made.doc, features } };
}

/** What a body is made from, back to where it was made: itself first. */
function ancestry(doc: CadDocument, bodyId: string): string[] {
  const out = [bodyId];
  for (let guard = 0; guard <= doc.features.length; guard++) {
    const f = findFeature(doc, featureOfBody(out[out.length - 1]!));
    const used = f && f.type !== "combine" ? consumedBodies(f) : [];
    if (used.length !== 1) break;
    out.push(used[0]!);
  }
  return out;
}

/**
 * The bodies furnished together with this one: those cut from the same body as it (the sides of a frame, whatever
 * was done to them since), or it alone. « near »: the frame it is a side of; « all »: the outermost one, when a side
 * was itself made a frame. Not a body that is already furniture (a Répartition's panels, fronts, a cabinet): null.
 */
export function furnishedBodies(doc: CadDocument, bodyId: string, shown: readonly string[], level: "near" | "all" = "near"): string[] | null {
  const line = ancestry(doc, bodyId);
  const made = findFeature(doc, featureOfBody(line[line.length - 1]!));
  if (!made || ["cabinet", "fronts", "niche", "trim", "room", "appliance", "panels"].includes(made.type)) return null;
  const sketch = made.type === "extrude" && made.sketch ? findFeature(doc, made.sketch) : undefined;
  if (sketch?.type === "sketch" && sketch.offsets?.some((r) => r.step)) return null;
  // The last body cut apart on the way back: its pieces, and what became of them.
  const piece = (level === "near" ? line : [...line].reverse()).find((id) => id.includes(PART_SEPARATOR));
  if (!piece) return [bodyId];
  const from = featureOfBody(piece);
  return shown.filter((id) => ancestry(doc, id).some((a) => a.includes(PART_SEPARATOR) && featureOfBody(a) === from));
}
