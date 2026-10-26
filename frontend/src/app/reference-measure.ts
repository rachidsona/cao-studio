/**
 * "Prendre une mesure sur le modèle": while a distance is being set by an arrow (extrusion), a click on a corner, an
 * edge or a face of a body gives the distance. A corner, or a face, gives its level along the arrow: the extrusion
 * stops exactly there; an edge gives its level or its length (the user's choice). The maths are pure; the picking
 * (corner within a few pixels, then edge, then face) reads the displayed bodies as they were when the tool opened.
 */
import type { Vec3 } from "../sketcher/frame";
import { axisParameter } from "../viewport/axis-drag";
import type { BodyMesh } from "../geometry/protocol";
import type { Viewport } from "../viewport/viewport";
import { captureTargets, type LevelTargets } from "./face-strip-view";

export type Reference =
  | { kind: "point"; point: Vec3 }
  | { kind: "edge"; a: Vec3; b: Vec3; point: Vec3 }
  /** `plane` is the face's own plane when it is flat. */
  | { kind: "face"; point: Vec3; plane: { normal: Vec3; point: Vec3 } | null };

/** What an edge gives: the level of the point clicked on it, or its length. */
export type EdgeTake = "level" | "length";

let edgeTake: EdgeTake = "level";
export const getEdgeTake = (): EdgeTake => edgeTake;
export const setEdgeTake = (take: EdgeTake): void => {
  edgeTake = take;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * The distance a reference gives along `axis` from `base`, and what it was; null when it is nil (the reference is at
 * the base). A face parallel to the base gives the level of its plane, any other face the level of the point clicked.
 */
export function referenceDistance(ref: Reference, base: Vec3, axis: Vec3, take: EdgeTake = "level"): { value: number; what: string } | null {
  const level = (p: Vec3) => dot(sub(p, base), axis);
  let result: { value: number; what: string };
  if (ref.kind === "point") result = { value: level(ref.point), what: "niveau du point" };
  else if (ref.kind === "edge") {
    result = take === "length" ? { value: Math.hypot(...sub(ref.b, ref.a)), what: "longueur de l'arête" } : { value: level(ref.point), what: "niveau de l'arête" };
  } else if (ref.plane && Math.abs(dot(ref.plane.normal, axis)) > 0.999) result = { value: level(ref.plane.point), what: "niveau de la face" };
  else result = { value: level(ref.point), what: "niveau du point cliqué sur la face" };
  const value = Number(result.value.toFixed(6));
  return Math.abs(value) < 1e-3 ? null : { value, what: result.what };
}

/** The plane of a face of a mesh when it is flat (every vertex of the face has the same normal), else null. */
export function planeOfFace(mesh: Pick<BodyMesh, "vertices" | "normals" | "indices" | "faceGroups">, faceIndex: number): { normal: Vec3; point: Vec3 } | null {
  const group = mesh.faceGroups[faceIndex];
  if (!group) return null;
  const vertices = new Set<number>();
  for (let i = group.start; i < group.start + group.count; i++) vertices.add(mesh.indices[i] as number);
  let normal: Vec3 | null = null;
  let first = -1;
  for (const v of vertices) {
    const n: Vec3 = [mesh.normals[v * 3] as number, mesh.normals[v * 3 + 1] as number, mesh.normals[v * 3 + 2] as number];
    if (!normal) {
      normal = n;
      first = v;
    } else if (dot(n, normal) < 0.9995) return null;
  }
  return normal ? { normal, point: [mesh.vertices[first * 3] as number, mesh.vertices[first * 3 + 1] as number, mesh.vertices[first * 3 + 2] as number] } : null;
}

/** Picks references in the view among the corners, edges and faces of the bodies displayed when `capture` was called. */
export class ReferencePicker {
  private targets: LevelTargets = { corners: [], segments: [] };

  constructor(private readonly viewport: Viewport) {}

  /** Remembers the corners and edges of the displayed bodies (the tool's own preview is not among them). */
  capture(): void {
    this.targets = captureTargets(this.viewport);
  }

  /** The corner within `px` of the pointer, else the edge within `edgePx`, else the face under it (bodies refused by `ignore` are not faces). */
  find(event: PointerEvent, ignore: (bodyId: string) => boolean = () => false, px = 12, edgePx = 8): Reference | null {
    let corner: { point: Vec3; d: number } | null = null;
    for (const v of this.targets.corners) {
      const d = this.viewport.screenDistance(event, v);
      if (d <= px && (!corner || d < corner.d)) corner = { point: v, d };
    }
    if (corner) return { kind: "point", point: corner.point };
    const { origin, direction } = this.viewport.rayFromEvent(event);
    let edge: { a: Vec3; b: Vec3; point: Vec3; d: number } | null = null;
    for (const [a, b] of this.targets.segments) {
      const t = axisParameter(a, sub(b, a), origin, direction);
      const s = t === null ? 0.5 : Math.max(0, Math.min(1, t));
      const point: Vec3 = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
      const d = this.viewport.screenDistance(event, point);
      if (d <= edgePx && (!edge || d < edge.d)) edge = { a, b, point, d };
    }
    if (edge) return { kind: "edge", a: edge.a, b: edge.b, point: edge.point };
    const face = this.viewport.pickFace(event);
    if (!face || ignore(face.bodyId)) return null;
    const mesh = this.viewport.bodyMesh(face.bodyId);
    return { kind: "face", point: [face.point.x, face.point.y, face.point.z], plane: mesh ? planeOfFace(mesh, face.faceIndex) : null };
  }
}
