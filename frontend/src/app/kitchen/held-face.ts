/**
 * Un caisson aménagé à la main, dessiné de face sur la bande de son linéaire comme la 3D le montre : ses côtés, son
 * dessus et son dessous, ses étagères et cloisons, ses portes, ses façades de tiroir et leurs poignées — ou, « Sans
 * portes », son intérieur, ses tiroirs en pointillés. Depuis la face de sa Répartition (sketcher/partition-face.ts).
 */
import { partitionOf } from "../../document/caisson-follow";
import { findFeature } from "../../document/operations";
import type { CadDocument, NicheFeature } from "../../document/types";
import { partitionFace, type FaceRect } from "../../sketcher/partition-face";
import { BRASS } from "./unit-elevation";

const BODY = "fill-gray-200 stroke-gray-500 dark:fill-gray-800 dark:stroke-gray-400";
const NICHE = "fill-gray-50 stroke-gray-400 dark:fill-gray-900 dark:stroke-gray-500";
const PANEL = "fill-gray-100 stroke-gray-500 dark:fill-gray-700 dark:stroke-gray-400";
const TRAY = "fill-transparent stroke-gray-500 [stroke-dasharray:6_4] dark:stroke-gray-400";

const box = (r: FaceRect, tone: string) => `<rect x="${r.x}" y="${r.y}" width="${Math.max(0, r.w)}" height="${Math.max(0, r.h)}" class="${tone}" vector-effect="non-scaling-stroke"/>`;

/** Its face in mm (x from its left, y down from its top), with its length and height; null when it cannot be drawn. */
export function heldFace(doc: CadDocument, sketchId: string, bare: boolean): { svg: string; length: number; height: number } | null {
  const sketch = findFeature(doc, sketchId);
  const record = sketch?.type === "sketch" ? partitionOf(sketch) : undefined;
  if (sketch?.type !== "sketch" || !record) return null;
  const { input, origin, depth } = record.step;
  const niches = doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === sketchId);
  // Its doors as the 3D has them, made by its « Portes » (not drawn twice from the step).
  const face = partitionFace({ input, origin, depth, doors: null, id: record.id }, sketch, { sketch, niches });
  if (!face) return null;
  const whole = { x: 0, y: 0, w: face.length, h: face.height };
  const parts = [box(whole, BODY), ...face.niches.map((n) => box(n, NICHE)), ...face.pieces.map((p) => box(p, PANEL))];
  if (bare) {
    // The drawers behind their fronts: their boxes.
    parts.push(...face.fronts.map((f) => box({ x: f.x + 20, y: f.y + f.h * 0.35, w: f.w - 40, h: f.h * 0.6 }, TRAY)));
  } else {
    parts.push(...face.doors.map((d) => box(d, PANEL)), ...face.fronts.map((f) => box(f, PANEL)));
    parts.push(...face.handles.map((h) => `<line x1="${h.x1}" y1="${h.y1}" x2="${h.x2}" y2="${h.y2}" stroke="${BRASS}" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`));
  }
  parts.push(...face.rods.map((r) => `<line x1="${r.x0}" y1="${r.y}" x2="${r.x1}" y2="${r.y}" class="stroke-gray-500" stroke-width="2" vector-effect="non-scaling-stroke"/>`));
  return { svg: parts.join(""), length: face.length, height: face.height };
}
