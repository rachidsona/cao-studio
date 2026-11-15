/**
 * « Prolonger élément », en nombres : une face plane d'un caisson (ou d'une de ses façades) ou d'une pièce d'une
 * Répartition, et une face d'un autre élément, parallèle. L'élément s'allonge (ou se raccourcit) du côté de sa face
 * jusqu'au plan de l'autre : un caisson change de largeur, de profondeur ou de hauteur — son origine recule quand c'est
 * son côté gauche, son devant ou son dessous qui avance —, une Répartition de longueur, de hauteur ou de profondeur
 * (toutes ses étapes : ses cloisons, étagères et équipements suivent), son esquisse se décalant de même quand c'est son
 * côté gauche, son dessous ou son fond qui avance. Ses pièces, façades et cases suivent. Un caisson fait par le Plan de cuisine le fait suivre
 * (document/kitchen-sync.ts). Toute autre pièce — une plinthe, un fileur, un plan de travail, une planche — voit sa
 * face tirée jusqu'à ce plan (une opération sur le corps, comme « Tirer une face »). Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { withPartitionDepth, withPartitionSize } from "./niche-size";
import { bodyOrigin, findFeature, latestBody, uniqueId, uniqueName, updateFeature } from "./operations";
import { isPartition } from "../sketcher/partition-history";
import { frameOf } from "../sketcher/frame";
import { moveSketchPlane } from "../sketcher/move";
import { featureOfBody, type CabinetFeature, type CadDocument, type ExtrudeFeature, type FaceRef, type Vec3 } from "./types";

export interface ExtendFace {
  point: Vec3;
  normal: Vec3;
}

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + (a[2] ?? 0) * (b[2] ?? 0);
const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const MIN = 50;
const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

/** What a body is part of, to be extended: its cabinet, or the sketch of its Répartition; null otherwise. */
export function extendable(doc: CadDocument, bodyId: string): { kind: "cabinet" | "sketch"; id: string; name: string } | null {
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  const id = f?.type === "cabinet" ? f.id : f?.type === "fronts" ? f.cabinet : (f?.type === "extrude" || f?.type === "niche" || f?.type === "panels") && f.sketch ? f.sketch : null;
  const owner = id ? findFeature(doc, id) : undefined;
  if (!owner || (owner.type !== "cabinet" && owner.type !== "sketch")) return null;
  if (owner.type === "sketch" && !(owner.offsets ?? []).some(isPartition)) return null;
  return { kind: owner.type === "cabinet" ? "cabinet" : "sketch", id: owner.id, name: owner.name };
}

/**
 * A piece that is neither a cabinet's nor a Répartition's (a plinth, a filler, a worktop, a board): its face pushed out
 * (or in) by `by`, as « Tirer une face » does — an operation on the body, which a kitchen made again keeps on its
 * piece of the same name (document/kitchen-floor.ts). The operation added.
 */
function withFacePulled(doc: CadDocument, bodyId: string, face: FaceRef, by: number): { doc: CadDocument; by: number; id: string } {
  const id = uniqueId(doc, "ex");
  const feature: ExtrudeFeature = { id, type: "extrude", name: uniqueName(doc, by > 0 ? "Prolongement" : "Raccourci"), faces: [face], target: latestBody(doc, bodyId), distance: by, operation: by > 0 ? "join" : "cut" };
  return { doc: { ...doc, features: [...doc.features, feature] }, by, id };
}

/**
 * The document with the element of `bodyId` extended from its face `from` to the plane of `to`, or why it cannot be.
 * `face`: that face as the kernel describes it, for a piece that is no cabinet nor Répartition (its face is pulled).
 */
export function extendElement(doc: CadDocument, bodyId: string, from: ExtendFace, to: ExtendFace, face?: FaceRef): { doc: CadDocument; by: number; id?: string } | string {
  const n = unit(from.normal);
  if (Math.abs(dot(n, unit(to.normal))) < 0.9998) return "Ces deux faces ne sont pas parallèles : choisissez une face d'arrivée tournée dans le même axe.";
  // How far its face goes out (negative: in), to the other's plane.
  const by = Math.round(dot(n, [to.point[0] - from.point[0], to.point[1] - from.point[1], to.point[2] - from.point[2]]) * 10) / 10;
  if (Math.abs(by) < 0.1) return "Ces deux faces sont déjà dans le même plan.";
  const owner = extendable(doc, bodyId);
  if (!owner) return face ? withFacePulled(doc, bodyId, face, by) : "Prolonger élément allonge un caisson ou une Répartition ; pour un autre corps, utilisez « Tirer une face ».";
  if (owner.kind === "cabinet") {
    const c = findFeature(doc, owner.id) as CabinetFeature;
    const { along, back } = cabinetAxes(c.rotation ?? 0);
    const axes: [keyof Pick<CabinetFeature, "width" | "depth" | "height">, Vec3][] = [["width", [along[0], along[1], 0]], ["depth", [back[0], back[1], 0]], ["height", [0, 0, 1]]];
    const hit = axes.find(([, a]) => Math.abs(dot(n, a)) > 0.9998);
    if (!hit) return "Choisissez une face droite du caisson (un côté, le dessus, le devant).";
    const [key, axis] = hit;
    const size = c[key] + by;
    if (size < MIN) return `Le caisson ne ferait plus que ${cm(size)}.`;
    // Its low side (left, front or bottom) moves: the origin goes with it.
    const low = dot(n, axis) < 0;
    const origin = low ? (c.origin.map((v, i) => Number((v - axis[i]! * by).toFixed(3))) as Vec3) : c.origin;
    const expressions = c.expressions ? Object.fromEntries(Object.entries(c.expressions).filter(([k]) => k !== key && !(low && k.startsWith("origin.")))) : undefined;
    return { doc: updateFeature(doc, c.id, (f) => ({ ...(f as CabinetFeature), [key]: Number(size.toFixed(1)), origin, ...(expressions ? { expressions } : {}) })), by };
  }
  const sketch = findFeature(doc, owner.id);
  if (sketch?.type !== "sketch") return "Cette Répartition n'existe plus.";
  const frame = frameOf(sketch);
  const record = (sketch.offsets ?? []).find(isPartition);
  if (!record || !isPartition(record)) return "Cette Répartition n'existe plus.";
  const onU = Math.abs(dot(n, frame.u)) > 0.9998;
  const onV = Math.abs(dot(n, frame.v)) > 0.9998;
  if (Math.abs(dot(n, frame.normal)) > 0.9998) {
    // Its depth: its panels go from the sketch's plane (the back) forwards; by its back, the plane moves back.
    const deeper = withPartitionDepth(doc, sketch.id, by);
    if (typeof deeper === "string") return deeper;
    if (dot(n, frame.normal) > 0) return { doc: deeper, by };
    const moved = findFeature(deeper, sketch.id);
    if (moved?.type !== "sketch") return { doc: deeper, by };
    return { doc: updateFeature(deeper, sketch.id, () => moveSketchPlane(moved, n.map((c) => c * by) as Vec3)), by };
  }
  if (!onU && !onV) return "Choisissez une face droite de la Répartition (un côté, le dessus, le dessous, le devant ou le fond).";
  const axis = onU ? frame.u : frame.v;
  const was = onU ? record.step.input.length : record.step.input.height;
  if (was + by < MIN) return `La Répartition ne ferait plus que ${cm(was + by)}.`;
  const resized = withPartitionSize(doc, sketch.id, onU ? "x" : "y", was, was + by);
  if (typeof resized === "string") return resized;
  // Its low side moves: the sketch goes with it, the other side staying where it was.
  if (dot(n, axis) > 0) return { doc: resized, by };
  const moved = findFeature(resized, sketch.id);
  if (moved?.type !== "sketch") return resized === doc ? "Cette Répartition n'existe plus." : { doc: resized, by };
  const shift = axis.map((c) => -c * by) as Vec3;
  return { doc: updateFeature(resized, sketch.id, () => moveSketchPlane(moved, shift)), by };
}
