/**
 * Une cote d'une pièce tapée dans la vue : le caisson d'une pièce (ou d'une façade) change de largeur, de hauteur ou
 * de profondeur d'autant ; une planche extrudée change sa distance, ou le côté haut de son esquisse s'il s'agit d'un
 * contour de lignes, et les cotes de l'esquisse qui la disaient suivent. Une pièce d'une Répartition garde ses cotes
 * de niche (document/niche-size.ts). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { bodyOrigin, findFeature, updateFeature } from "./operations";
import { featureOfBody, type Axis, type CabinetFeature, type CadDocument, type ExtrudeFeature, type SketchFeature } from "./types";
import { cabinetProblem } from "../features/cabinet-parts";
import { frameOf } from "../sketcher/frame";
import { isPartition } from "../sketcher/partition-history";

const NEAR = 0.5;
const LINED = new Set(["distance", "distanceX", "distanceY", "length"]);

function cabinetSized(doc: CadDocument, c: CabinetFeature, axis: Axis, was: number, value: number): CadDocument | string {
  const key = axis === 2 ? "height" : cabinetAxes(c.rotation ?? 0).along[axis] ? "width" : "depth";
  const next = { ...c, [key]: c[key] + value - was };
  return cabinetProblem(next) ?? updateFeature(doc, c.id, () => next);
}

function boardSized(doc: CadDocument, board: ExtrudeFeature, g: SketchFeature, axis: Axis, was: number, value: number): CadDocument | string {
  if ((g.offsets ?? []).some(isPartition)) return "Cette pièce suit sa Répartition : changez la cote de sa niche.";
  const frame = frameOf(g);
  if (Math.abs(frame.normal[axis]) > 0.99 && Math.abs(Math.abs(board.distance) - was) < NEAR) return updateFeature(doc, board.id, (f) => ({ ...f, distance: Math.sign(board.distance) * value }) as ExtrudeFeature);
  const along = Math.abs(frame.u[axis]) > 0.99 ? "x" : Math.abs(frame.v[axis]) > 0.99 ? "y" : null;
  if (!along || g.curves.some((c) => c.kind !== "line")) return "Cette pièce a une forme : changez-la dans son esquisse.";
  const values = g.points.map((p) => p[along]);
  const high = Math.max(...values);
  if (Math.abs(high - Math.min(...values) - was) > NEAR) return "Cette cote ne correspond pas à son esquisse : changez-la dans l'esquisse.";
  return updateFeature(doc, g.id, (f) => ({
    ...f,
    points: g.points.map((p) => (high - p[along] < 1e-6 ? { ...p, [along]: p[along] + value - was } : p)),
    constraints: g.constraints.map((c) => ("value" in c && LINED.has(c.kind) && Math.abs(Math.abs(c.value) - was) < NEAR ? { ...c, value: Math.sign(c.value) * value } : c)),
  }) as SketchFeature);
}

/** The piece `bodyId`, `was` mm long along the world `axis`, brought to `value` mm. */
export function withPieceSize(doc: CadDocument, bodyId: string, axis: Axis, was: number, value: number): CadDocument | string {
  const feature = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  const cabinet = feature?.type === "fronts" ? findFeature(doc, feature.cabinet) : feature;
  if (cabinet?.type === "cabinet") return cabinetSized(doc, cabinet, axis, was, value);
  const sketch = feature?.type === "extrude" && feature.sketch ? findFeature(doc, feature.sketch) : undefined;
  if (feature?.type === "extrude" && sketch?.type === "sketch") return boardSized(doc, feature, sketch, axis, was, value);
  return "Cette pièce se règle dans son outil.";
}
