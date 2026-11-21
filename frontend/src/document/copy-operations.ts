/**
 * « Copier les opérations » : ce qu'on a fait sur un corps — une découpe, un perçage, des côtés séparés, un congé, un
 * usinage — refait sur un autre corps, à la même place par rapport à lui. Le corps d'origine est celui d'avant ces
 * opérations (une pièce d'un corps séparé, ou un corps créé tel quel) ; les opérations le suivent jusqu'au corps
 * cliqué, et celles qu'on a faites ensuite sur ses autres pièces se proposent aussi. Chaque opération recopiée est une
 * étape à elle (une esquisse recopiée avec sa découpe), placée par le passage d'une boîte à l'autre : le centre de
 * la boîte d'origine sur celui de la cible, tourné d'un quart de tour au besoin pour que leurs côtés se répondent. Un
 * déplacement se refait aussi (de la même longueur, tourné avec le reste) ; chaque opération est placée d'après où
 * étaient alors le corps d'origine et la cible, les déplacements d'avant et d'après comptés. Pur.
 */
import { findFeature, uniqueId, uniqueName } from "./operations";
import { consumedBodies, featureOfBody, PART_SEPARATOR, type CadDocument, type EdgeRef, type FaceRef, type Feature, type MachiningOp, type SketchFeature, type Vec3 } from "./types";
import { frameOf } from "../sketcher/frame";

/** A rotation by quarter turns: row i is where the axis i goes (a permutation with signs). */
export type Turn = readonly [Vec3, Vec3, Vec3];
export type Box = readonly [Vec3, Vec3];

/** The operations that can be made again on another body. */
const COPIED = new Set<Feature["type"]>(["extrude", "hole", "fillet", "chamfer", "shell", "paneling", "machining", "move"]);
/** Placings: not made again (the copy stays where its body is), what follows them still is. */
const PLACINGS = new Set<Feature["type"]>(["rotate", "align", "stretch"]);

export interface BodyOperations {
  /** The body as it was before them. */
  base: string;
  /** The operations, in the order made, and whether each goes by default (the ones that made the clicked body). */
  ops: { id: string; name: string; chain: boolean; copyable: boolean }[];
}

const isPiece = (id: string) => id.includes(PART_SEPARATOR);

/** What a body comes from: a feature that changes one body, and that body. */
function input(doc: CadDocument, bodyId: string): string | null {
  const f = findFeature(doc, featureOfBody(bodyId));
  if (!f || f.type === "combine") return null;
  const used = consumedBodies(f);
  return used.length === 1 ? used[0]! : null;
}

/** The body before its operations, and every operation made on it since (those that made `bodyId` by default). */
export function operationsOf(doc: CadDocument, bodyId: string): BodyOperations {
  const chain = new Set<string>();
  let base = bodyId;
  for (let guard = 0; guard <= doc.features.length; guard++) {
    const from = input(doc, base);
    if (!from) break;
    chain.add(featureOfBody(base));
    base = from;
    // A piece of a body cut apart, or a body made as it is: where its own operations start.
    if (isPiece(base)) break;
  }
  // Then whatever was done on it or on what it became, its other pieces too.
  const made = new Set<string>();
  const ofIt = (id: string) => id === base || made.has(featureOfBody(id));
  const ops: BodyOperations["ops"] = [];
  for (const f of doc.features) {
    if (f.type === "combine") continue;
    const used = consumedBodies(f);
    if (used.length !== 1 || !ofIt(used[0]!)) continue;
    made.add(f.id);
    if (PLACINGS.has(f.type)) continue;
    ops.push({ id: f.id, name: f.name, chain: chain.has(f.id), copyable: COPIED.has(f.type) && !(f.type === "machining" && f.kind === "cutout") });
  }
  return { base, ops };
}

/** Whether a body is made from `base` (its operations, or base itself). */
export function comesFrom(doc: CadDocument, bodyId: string, base: string): boolean {
  let id = bodyId;
  for (let guard = 0; guard <= doc.features.length; guard++) {
    if (id === base) return true;
    const from = input(doc, id);
    if (!from) return false;
    id = from;
  }
  return false;
}

const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
const plus = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The 24 quarter-turn rotations, the identity first. */
const TURNS: Turn[] = (() => {
  const signed = AXES.flatMap((a) => [a, neg(a)]);
  const out: Turn[] = [];
  for (const x of signed) for (const y of signed) {
    if (Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2]) > 0.5) continue;
    out.push([x, y, cross(x, y)]);
  }
  return out.sort((a, b) => moved(a) - moved(b));
})();
function moved(t: Turn): number {
  return t.reduce((n, row, i) => n + (row[i] === 1 ? 0 : 1), 0);
}

const turn = (t: Turn, v: Vec3): Vec3 => [0, 1, 2].map((k) => v[0] * t[0][k]! + v[1] * t[1][k]! + v[2] * t[2][k]!) as Vec3;
const size = (b: Box): Vec3 => [0, 1, 2].map((i) => b[1][i]! - b[0][i]!) as Vec3;
const centre = (b: Box): Vec3 => [0, 1, 2].map((i) => (b[0][i]! + b[1][i]!) / 2) as Vec3;

/**
 * The turns that lay the box of the original on the target's best (its sides along the target's sides of the
 * nearest lengths): the identity first when it is one of them.
 */
export function turnsBetween(from: Box, to: Box): Turn[] {
  const a = size(from);
  const b = size(to);
  const misfit = (t: Turn) => {
    const s = turn(t, a).map(Math.abs);
    return s.reduce((sum, v, i) => sum + Math.abs(v - b[i]!), 0);
  };
  const scored = TURNS.map((t) => ({ t, m: misfit(t) }));
  const best = Math.min(...scored.map((x) => x.m));
  return scored.filter((x) => x.m <= best + 0.5).map((x) => x.t);
}

/** Moves a point and turns a direction from the original's box to the target's. */
export interface Placing {
  point(p: Vec3): Vec3;
  dir(d: Vec3): Vec3;
  /** A position in the box (0..1 along each axis) where it is in the target's. */
  rel(r: Vec3): Vec3;
}

export function placing(from: Box, to: Box, t: Turn): Placing {
  const c0 = centre(from);
  const c1 = centre(to);
  const r6 = (v: number) => Number(v.toFixed(6));
  return {
    point: (p) => turn(t, [p[0] - c0[0], p[1] - c0[1], p[2] - c0[2]]).map((v, i) => r6(v + c1[i]!)) as Vec3,
    dir: (d) => turn(t, d).map(r6) as Vec3,
    rel: (r) => turn(t, [r[0] - 0.5, r[1] - 0.5, r[2] - 0.5]).map((v) => r6(v + 0.5)) as Vec3,
  };
}

const faceRef = (f: FaceRef, at: Placing): FaceRef => ({ ...f, center: at.point(f.center), normal: at.dir(f.normal), rel: at.rel(f.rel) });
const edgeRef = (e: EdgeRef, at: Placing): EdgeRef => {
  const dir = at.dir(e.dir);
  // The tangent is kept sign-normalised: its first component that is not zero positive.
  const k = dir.findIndex((v) => Math.abs(v) > 1e-9);
  return { ...e, mid: at.point(e.mid), rel: at.rel(e.rel), dir: k >= 0 && dir[k]! < 0 ? neg(dir) : dir };
};
function machiningOp(op: MachiningOp, at: Placing): MachiningOp {
  if (op.kind === "hole") return { ...op, at: at.point(op.at), dir: at.dir(op.dir) };
  const [a, b] = [at.point(op.from), at.point(op.to)];
  return { ...op, from: [0, 1, 2].map((i) => Math.min(a[i]!, b[i]!)) as Vec3, to: [0, 1, 2].map((i) => Math.max(a[i]!, b[i]!)) as Vec3 };
}

/** The sketch laid where the placing takes it: shifted in its plane when not turned, on a frame of its own otherwise. */
function placedSketch(s: SketchFeature, at: Placing, turned: boolean): Partial<SketchFeature> {
  const frame = frameOf(s);
  const origin = at.point(frame.origin);
  if (!turned && !s.frame) {
    // The same plane: its origin moved along the plane's axes and normal.
    const d: Vec3 = [origin[0] - frame.origin[0], origin[1] - frame.origin[1], origin[2] - frame.origin[2]];
    const along = (axis: Vec3) => d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
    const [su, sv] = s.shift ?? [0, 0];
    const r6 = (v: number) => Number(v.toFixed(6));
    const shift: [number, number] = [r6(su + along(frame.u)), r6(sv + along(frame.v))];
    return { offset: r6(s.offset + along(frame.normal)), ...(shift[0] || shift[1] ? { shift } : {}) };
  }
  return { frame: { origin, xDir: at.dir(frame.u), normal: at.dir(frame.normal) }, shift: undefined };
}

export interface CopyResult {
  doc: CadDocument;
  /** The features made, in order (sketches with their extrusions). */
  made: Feature[];
  /** What could not be made again, said. */
  notes: string[];
}

/**
 * The document with the chosen operations of `base` made again on `target`, placed by `at` (`turned`: not the
 * identity). The operations not chosen (or that cannot be) leave their body as it was for those after them.
 */
export function withOperationsCopied(doc: CadDocument, base: string, chosen: readonly string[], target: string, placed: Placing, turned: boolean): CopyResult {
  const at = placed;
  const wanted = new Set(chosen);
  const renamed = new Map<string, string>();
  const passed = new Map<string, string>();
  const resolve = (id: string): string | undefined => {
    if (id === base) return target;
    const fid = featureOfBody(id);
    const to = renamed.get(fid);
    if (to) return to + id.slice(fid.length);
    return passed.get(fid);
  };
  // Where the original was when each operation was made: moved since by the moves after it (its box is the one seen
  // now), so a point of then is that point moved by them.
  const lineage = new Set<string>();
  const later = new Map<string, Vec3>();
  let total: Vec3 = [0, 0, 0];
  for (const f of doc.features) {
    const used = consumedBodies(f);
    if (f.type === "combine" || used.length !== 1 || (used[0] !== base && !lineage.has(featureOfBody(used[0]!)))) continue;
    lineage.add(f.id);
    if (f.type === "move") total = plus(total, f.translate);
  }
  for (const f of doc.features) {
    if (!lineage.has(f.id)) continue;
    later.set(f.id, total);
    if (f.type === "move") total = plus(total, neg(f.translate));
  }
  // And where the target is then: moved by the moves made again before.
  let moved: Vec3 = [0, 0, 0];
  const shifted = (id: string): Placing => {
    const [src, dst]: [Vec3, Vec3] = [later.get(id) ?? [0, 0, 0], moved];
    return { ...at, point: (p) => plus(at.point(plus(p, src)), dst).map((v) => Number(v.toFixed(6))) as Vec3 };
  };
  let next = doc;
  const made: Feature[] = [];
  const notes: string[] = [];
  const add = (f: Feature) => {
    next = { ...next, features: [...next.features, f] };
    made.push(f);
  };
  const fresh = (f: Feature) => ({ id: uniqueId(next, f.id.replace(/\d+$/, "")), name: uniqueName(next, f.name.replace(/\s*\d+$/, "") || f.name) });
  for (const f of doc.features) {
    if (f.type === "combine") continue;
    const used = consumedBodies(f);
    if (used.length !== 1) continue;
    const onto = resolve(used[0]!);
    if (!onto) continue;
    if (!wanted.has(f.id) || !COPIED.has(f.type) || (f.type === "machining" && f.kind === "cutout")) {
      // Left out: what is done after it is done on the body as it was.
      passed.set(f.id, onto);
      if (wanted.has(f.id)) notes.push(`« ${f.name} » ne se recopie pas : la suite est faite sans elle.`);
      continue;
    }
    const { id, name } = fresh(f);
    const at = shifted(f.id);
    let copy: Feature;
    switch (f.type) {
      case "move":
        copy = { ...structuredClone(f), id, name, target: onto, translate: at.dir(f.translate) };
        moved = plus(moved, copy.translate);
        break;
      case "extrude": {
        let sketch = f.sketch;
        const original = sketch ? findFeature(doc, sketch) : undefined;
        if (original?.type === "sketch") {
          const s = { ...structuredClone(original), ...fresh(original), ...placedSketch(original, at, turned) } as SketchFeature;
          if (s.shift === undefined) delete s.shift;
          if (original.support) {
            const support = resolve(original.support);
            if (support) s.support = support;
            else delete s.support;
          }
          add(s);
          sketch = s.id;
        }
        const until = f.until && resolve(f.until.body) ? { body: resolve(f.until.body)!, face: faceRef(f.until.face, at) } : f.until;
        copy = { ...structuredClone(f), id, name, target: onto, ...(sketch ? { sketch } : {}), ...(f.faces ? { faces: f.faces.map((x) => faceRef(x, at)) } : {}), ...(until ? { until } : {}) };
        break;
      }
      case "hole": {
        const [x, y] = at.point([f.x, f.y, 0]);
        copy = { ...structuredClone(f), id, name, target: onto, x: x!, y: y!, ...(f.origin ? { origin: at.point(f.origin) } : {}), ...(f.direction ? { direction: at.dir(f.direction) } : {}), ...(f.face ? { face: faceRef(f.face, at) } : {}) };
        break;
      }
      case "fillet":
      case "chamfer":
        copy = { ...structuredClone(f), id, name, target: onto, edges: f.edges.map((e) => edgeRef(e, at)) };
        break;
      case "shell":
        copy = { ...structuredClone(f), id, name, target: onto, faces: f.faces.map((x) => faceRef(x, at)), ...(f.back ? { back: { ...f.back, face: faceRef(f.back.face, at) } } : {}) };
        break;
      case "paneling":
        copy = { ...structuredClone(f), id, name, target: onto, faces: f.faces.map((x) => faceRef(x, at)) };
        break;
      case "machining": {
        const corners = f.anchor && f.anchorHigh ? [at.point(f.anchor), at.point(f.anchorHigh)] : null;
        copy = {
          ...structuredClone(f), id, name, target: onto, ops: f.ops.map((op) => machiningOp(op, at)),
          ...(corners ? { anchor: [0, 1, 2].map((i) => Math.min(corners[0]![i]!, corners[1]![i]!)) as Vec3, anchorHigh: [0, 1, 2].map((i) => Math.max(corners[0]![i]!, corners[1]![i]!)) as Vec3 } : {}),
        };
        break;
      }
      default:
        continue;
    }
    add(copy);
    renamed.set(f.id, id);
  }
  if (!made.length && !notes.length) notes.push("Aucune opération choisie ne se refait sur ce corps.");
  return { doc: next, made, notes };
}
