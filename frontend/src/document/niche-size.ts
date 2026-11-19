/**
 * Une niche réglée à sa cote, sans ouvrir d'outil : la largeur d'une case, la hauteur d'une niche, la largeur entre
 * deux cloisons, une cote tapée dans la vue ; ou une étagère ou une cloison tirée à la souris, ses voisines restant en
 * place. Les autres pièces suivent, les corps sont refaits en une annulation. Pur.
 */
import { bodyOrigin, findFeature } from "./operations";
import type { OffsetRecord, PartitionParams, ShelfParams } from "./sketch";
import { stepOfBody, withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, SketchFeature, Vec3 } from "./types";
import { frameOf } from "../sketcher/frame";
import { partitionLayout } from "../sketcher/partition";
import { extrusionGroups, heightStep, isPartition, isShelves, leafNiches, pathKey, rebuildChain, withNicheHeight } from "../sketcher/partition-history";

const NEAR = 0.5;

function remade(doc: CadDocument, g: SketchFeature, partition: string, offsets: OffsetRecord[]): CadDocument | string {
  const rebuilt = rebuildChain({ ...g, offsets }, partition);
  if (typeof rebuilt === "string") return rebuilt;
  if (rebuilt.problems.length) return rebuilt.problems.join(" ");
  return withSketchExtrusion(doc, g.id, rebuilt.geometry, { groups: extrusionGroups(g.offsets ?? [], rebuilt) });
}

const withInput = (g: SketchFeature, record: OffsetRecord, input: ShelfParams | PartitionParams): OffsetRecord[] =>
  (g.offsets ?? []).map((r) => (r.id === record.id ? ({ ...r, step: { ...r.step, input } } as OffsetRecord) : r));

/** The cloisons on the way to a niche that make its width, and which of their niches it lies in. */
function widthStep(g: SketchFeature, partition: string, path: number[]): { record: OffsetRecord; index: number } | null {
  for (let k = path.length - 1; k > 0; k--) {
    const at = pathKey(path.slice(0, k));
    const record = (g.offsets ?? []).find((r) => isShelves(r) && r.step.of === partition && r.step.input.vertical && pathKey(r.step.niche) === at);
    if (record) return { record, index: path[k] as number };
  }
  return null;
}

/** The case at this size, the others sharing what is left in the proportions they had. */
function caseWidth(doc: CadDocument, g: SketchFeature, partition: string, index: number, value: number): CadDocument | string {
  const record = (g.offsets ?? []).find((r) => r.id === partition && isPartition(r));
  if (!record || !isPartition(record)) return "Cette répartition n'existe plus.";
  const layout = partitionLayout(record.step.input);
  if (typeof layout === "string") return layout;
  const { caseWidths } = layout;
  const others = caseWidths.reduce((sum, w, i) => (i === index ? sum : sum + w), 0);
  const left = caseWidths.reduce((sum, w) => sum + w, 0) - value;
  if (!(value > 0) || left < 1 || !others) return "Cette largeur ne laisse pas de place aux autres cases.";
  return remade(doc, g, partition, withInput(g, record, { ...record.step.input, widths: caseWidths.map((w, i) => (i === index ? value : (w * left) / others)) }));
}

/** The whole Répartition that was `was` mm long or high at `value` mm: its cases keep their shares. */
export function withPartitionSize(doc: CadDocument, sketchId: string, axis: "x" | "y", was: number, value: number): CadDocument | string {
  const g = findFeature(doc, sketchId);
  if (g?.type !== "sketch") return "Cette répartition n'existe plus.";
  const key = axis === "x" ? "length" : "height";
  const record = (g.offsets ?? []).find((r) => isPartition(r) && Math.abs(r.step.input[key] - was) < NEAR);
  if (!record || !isPartition(record)) return "Cette cote n'est pas celle de la répartition.";
  return remade(doc, g, record.id, withInput(g, record, { ...record.step.input, [key]: value }));
}

/**
 * The whole Répartition `by` mm deeper (negative: shallower): every step that has a depth (the partition, its shelves
 * and cloisons, a shallower one keeping its difference), each partition of the sketch made again.
 */
export function withPartitionDepth(doc: CadDocument, sketchId: string, by: number): CadDocument | string {
  const g = findFeature(doc, sketchId);
  if (g?.type !== "sketch") return "Cette répartition n'existe plus.";
  const deep = (g.offsets ?? []).filter((r) => r.step?.depth !== undefined);
  if (!deep.length) return "Les panneaux de cette Répartition ne sont pas extrudés : elle n'a pas de profondeur.";
  const least = Math.min(...deep.map((r) => r.step!.depth!));
  if (least + by < MIN_DEPTH) return `La Répartition ne serait plus profonde que de ${Number(((least + by) / 10).toFixed(1)).toLocaleString("fr-FR")} cm.`;
  const offsets = (g.offsets ?? []).map((r) => (r.step?.depth !== undefined ? ({ ...r, step: { ...r.step, depth: Number((r.step.depth + by).toFixed(1)) } } as OffsetRecord) : r));
  let next: CadDocument = doc;
  for (const partition of offsets.filter(isPartition).map((r) => r.id)) {
    const now = findFeature(next, sketchId);
    if (now?.type !== "sketch") return "Cette répartition n'existe plus.";
    // The depths of this chain set; the others' already, or still to come.
    const made = remade(next, now, partition, (now.offsets ?? []).map((r) => offsets.find((o) => o.id === r.id) ?? r));
    if (typeof made === "string") return made;
    next = made;
  }
  return next;
}

/** A Répartition no shallower than this (mm). */
const MIN_DEPTH = 50;

/** The niche that spans from `span[0]` to `span[1]` along x or y (a dimension of the view) set to `value` mm. */
export function withNicheSize(doc: CadDocument, sketchId: string, axis: "x" | "y", span: [number, number], value: number): CadDocument | string {
  const g = findFeature(doc, sketchId);
  if (g?.type !== "sketch") return "Cette répartition n'existe plus.";
  const near = (a: number, b: number) => Math.abs(a - b) < NEAR;
  const leaf = leafNiches(g).find(({ box }) => (axis === "x" ? near(box.x0, span[0]) && near(box.x1, span[1]) : near(box.y0, span[0]) && near(box.y1, span[1])));
  if (!leaf) return "Cette cote n'est pas celle d'une niche.";
  const step = axis === "y" ? heightStep(g, leaf.partition, leaf.path) : widthStep(g, leaf.partition, leaf.path);
  if (!step) {
    if (axis === "x") return caseWidth(doc, g, leaf.partition, leaf.path[0] as number, value);
    return "Cette niche va du dessous au dessus : posez d'abord une étagère pour la découper.";
  }
  const input = (step.record.step as { input: ShelfParams }).input;
  return remade(doc, g, leaf.partition, withInput(g, step.record, withNicheHeight(input, step.index, value)));
}

/** The niche from `span[0]` to `span[1]` (y) held at its height, the other niches of its division let free to share the rest. */
export function withNicheHeld(doc: CadDocument, sketchId: string, span: [number, number]): CadDocument | string {
  const g = findFeature(doc, sketchId);
  if (g?.type !== "sketch") return "Cette répartition n'existe plus.";
  const leaf = leafNiches(g).find(({ box }) => Math.abs(box.y0 - span[0]) < NEAR && Math.abs(box.y1 - span[1]) < NEAR);
  const step = leaf && heightStep(g, leaf.partition, leaf.path);
  if (!leaf || !step) return "Cette niche va du dessous au dessus.";
  const input = (step.record.step as { input: ShelfParams }).input;
  const free = { ...input, mode: "equal" as const, heights: [] };
  return remade(doc, g, leaf.partition, withInput(g, step.record, withNicheHeight(free, step.index, span[1] - span[0])));
}

/** Where the `index`-th shelf of a division can go, and where it is (mm, along its axis in the sketch). */
export function shelfTravel(sketch: SketchFeature, recordId: string, index: number): { position: number; low: number; high: number; vertical: boolean; across: [number, number] } | null {
  const record = sketch.offsets?.find((r) => r.id === recordId);
  if (!record || !isShelves(record)) return null;
  const { niche, of, input } = record.step;
  const made = rebuildChain(sketch, of);
  if (typeof made === "string") return null;
  const [below, above] = [made.niches.get(pathKey([...niche, index]))?.box, made.niches.get(pathKey([...niche, index + 1]))?.box];
  if (!below || !above) return null;
  const t = input.thickness;
  const vertical = input.vertical === true;
  return vertical
    ? { vertical, position: below.x1 + t / 2, low: below.x0 + t / 2, high: above.x1 - t / 2, across: [below.y0, below.y1] }
    : { vertical, position: below.y1 + t / 2, low: below.y0 + t / 2, high: above.y1 - t / 2, across: [below.x0, below.x1] };
}

/** The `index`-th shelf of a division moved to `position`: its two niches share the change, the others stay. */
export function withShelfMoved(doc: CadDocument, sketchId: string, recordId: string, index: number, position: number): CadDocument | string {
  const g = findFeature(doc, sketchId);
  const record = g?.type === "sketch" ? g.offsets?.find((r) => r.id === recordId) : undefined;
  if (g?.type !== "sketch" || !record || !isShelves(record)) return "Cette étagère n'existe plus.";
  const { niche, of, input } = record.step;
  const made = rebuildChain(g, of);
  if (typeof made === "string") return made;
  const vertical = input.vertical === true;
  const sizes = Array.from({ length: input.count + 1 }, (_, i) => {
    const box = made.niches.get(pathKey([...niche, i]))?.box;
    return box ? (vertical ? box.x1 - box.x0 : box.y1 - box.y0) : 0;
  });
  const below = made.niches.get(pathKey([...niche, index]))?.box;
  if (!below) return "Cette étagère n'existe plus.";
  const size = position - input.thickness / 2 - (vertical ? below.x0 : below.y0);
  const total = sizes[index]! + sizes[index + 1]!;
  if (size < 1 || total - size < 1) return "L'étagère touche sa voisine.";
  const heights: (number | null)[] = sizes.map((s, i) => (i === index ? size : i === index + 1 ? total - size : s));
  heights[heights.length - 1] = null;
  return remade(doc, g, of, withInput(g, record, { ...input, mode: "set", heights }));
}

/**
 * A shelf or a cloison of a Répartition moved like a body (« Déplacer ») by `translate` (world, mm): when it moves
 * along its own axis only (up or down for a shelf, sideways for a cloison), it moves in its division instead — its two
 * niches share the change and what equips them follows, as with its handle. Null: not such a body, or another move
 * (it stays a move of the body); a string: why it cannot go there.
 */
export function shelfMovedBy(doc: CadDocument, bodyId: string, translate: Vec3): CadDocument | string | null {
  const step = stepOfBody(doc, bodyId);
  if (step?.kind !== "shelves") return null;
  const sketch = findFeature(doc, step.sketch);
  const record = sketch?.type === "sketch" ? sketch.offsets?.find((r) => r.id === step.offset) : undefined;
  const index = record?.bodies?.indexOf(bodyOrigin(doc, bodyId)) ?? -1;
  if (sketch?.type !== "sketch" || index < 0) return null;
  const travel = shelfTravel(sketch, step.offset, index);
  if (!travel) return null;
  const frame = frameOf(sketch);
  const axis = travel.vertical ? frame.u : frame.v;
  const along = translate[0] * axis[0] + translate[1] * axis[1] + translate[2] * axis[2];
  const off = Math.hypot(...translate.map((t, i) => t - along * axis[i]!));
  if (Math.abs(along) < 1e-6 || off > 0.5) return null;
  const position = travel.position + along;
  if (position <= travel.low || position >= travel.high) return "L'étagère touche sa voisine : déplacez-la moins loin.";
  return withShelfMoved(doc, sketch.id, step.offset, index, position);
}
