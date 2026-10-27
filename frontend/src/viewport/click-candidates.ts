/**
 * What lies under a click in model mode, by priority, for the selection filter: a corner ("Points"), a body edge
 * (thin: it wins, a sketch along it must not steal it for a fillet), a sketch curve, the inside of a sketch area in
 * front of the body, the face, then a sketch area behind it. The viewport toggles the first; a click again at the
 * same spot takes the next one.
 */
import type * as THREE from "three";
import type { Vec3 } from "../sketcher/frame";
import type { EdgePick, FacePick, SelectionFilter, SketchPick, VertexPick } from "./selection-layer";

export type Candidate =
  | { kind: "vertex"; pick: VertexPick }
  | { kind: "edge"; pick: EdgePick }
  | { kind: "sketch"; id: string }
  | { kind: "face"; pick: FacePick }
  | { kind: "item"; pick: SketchPick };

/** The viewport's picking under the pointer of the click. */
export interface ClickPickers {
  vertex(): VertexPick | null;
  edge(): EdgePick | null;
  face(): FacePick | null;
  item(kind: SketchPick["kind"], nearerThan?: number | null): (SketchPick & { distance: number }) | null;
  sketch(what: "line" | "fill", nearerThan?: number | null): string | null;
  screenDistance(p: Vec3): number;
  /** Distance from the eye to a point of the model. */
  eyeDistance(point: THREE.Vector3): number;
}

export function clickCandidates(filter: SelectionFilter, pick: ClickPickers): Candidate[] {
  const list: Candidate[] = [];
  if (filter === "vertex") {
    // "Points": the corners of bodies and the points of sketches, the nearer first.
    const vertex = pick.vertex();
    const point = pick.item("point");
    const vertexDistance = vertex ? pick.screenDistance(vertex.point) : Infinity;
    if (point && point.distance <= vertexDistance) list.push({ kind: "item", pick: point });
    if (vertex) list.push({ kind: "vertex", pick: vertex });
    if (point && point.distance > vertexDistance) list.push({ kind: "item", pick: point });
  } else if (filter === "edge") {
    // "Arêtes": the edges of bodies and the curves of sketches.
    const edge = pick.edge();
    if (edge) list.push({ kind: "edge", pick: edge });
    const curve = pick.item("curve");
    if (curve) list.push({ kind: "item", pick: curve });
  } else if (filter === "face") {
    // "Faces": the faces of bodies and the areas of sketches.
    const face = pick.face();
    const inFront = pick.item("region", face ? pick.eyeDistance(face.point) : null);
    if (inFront) list.push({ kind: "item", pick: inFront });
    if (face) list.push({ kind: "face", pick: face });
    const behind = face ? pick.item("region") : null;
    if (behind && !inFront) list.push({ kind: "item", pick: behind });
  } else {
    // "Auto" and "Corps": a body edge (thin: it wins over a sketch along it), a whole sketch, a face or body.
    const edge = filter === "auto" ? pick.edge() : null;
    if (edge) list.push({ kind: "edge", pick: edge });
    const curve = pick.sketch("line");
    if (curve) list.push({ kind: "sketch", id: curve });
    const face = pick.face();
    const inFront = pick.sketch("fill", face ? pick.eyeDistance(face.point) : null);
    if (inFront && inFront !== curve) list.push({ kind: "sketch", id: inFront });
    if (face) list.push({ kind: "face", pick: face });
    const behind = face ? pick.sketch("fill") : null;
    if (behind && behind !== curve && behind !== inFront) list.push({ kind: "sketch", id: behind });
  }
  return list;
}
