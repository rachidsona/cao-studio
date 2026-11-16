/**
 * « Séparer les côtés » d'un corps fait de panneaux d'équerre (features/board-split.ts), côté noyau : ses faces lues
 * comme des contours (toutes planes, d'équerre avec les axes, à bords droits), et un corps par panneau trouvé.
 */
import { makeBox, type Shape3D } from "replicad";
import { arePanels, boardBoxes, type Axis, type AxisFace, type Pass } from "./board-split";

/** The body's faces square to the axes, as contours; null when one is not (curved, slanted, a drilled hole). */
export function axisFaces(target: Shape3D): AxisFace[] | null {
  const out: AxisFace[] = [];
  for (const face of target.faces) {
    if (face.geomType !== "PLANE") return null;
    const v = face.normalAt(face.center);
    const n = [v.x, v.y, v.z];
    const found = n.findIndex((c) => Math.abs(Math.abs(c) - 1) < 1e-6);
    if (found < 0) return null;
    const axis = found as Axis;
    const [a, b] = ([0, 1, 2] as const).filter((k) => k !== axis) as [Axis, Axis];
    const c = face.center;
    const edges: [[number, number], [number, number]][] = [];
    for (const edge of face.edges) {
      if (edge.geomType !== "LINE") return null;
      const [p, q] = [edge.startPoint, edge.endPoint].map((v) => [v.x, v.y, v.z]) as [number[], number[]];
      edges.push([[p[a]!, p[b]!], [q[a]!, q[b]!]]);
    }
    out.push({ axis, at: [c.x, c.y, c.z][axis]!, edges });
  }
  return out;
}

/** The panels of a body made of square panels, a body each; null when it is not such a body (left to the other ways). */
export function splitBoards(target: Shape3D, pass: Pass): Shape3D[] | null {
  const faces = axisFaces(target);
  if (!faces) return null;
  const boxes = boardBoxes(faces, pass);
  if (typeof boxes === "string" || !arePanels(boxes)) return null;
  return boxes.map(([lo, hi]) => makeBox(lo, hi) as unknown as Shape3D);
}
