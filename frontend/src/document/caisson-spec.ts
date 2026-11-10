/**
 * Un caisson du dressing (une « Répartition » extrudée) relu pour être reposé ailleurs : sa construction, la profondeur
 * de ses panneaux, ses portes et son fond, l'intérieur de chaque case (étagères, cloisons, penderie, tiroirs : une
 * recette, document/niche-recipe.ts) et ses matières. Reposé à une autre largeur ou hauteur, ses cases et ses niches
 * s'adaptent. C'est ce que garde « Mes caissons », et ce que devient un caisson de cuisine aménagé. Pur.
 */
import { caseHasDoor, withCaseDoor } from "./door-fronts";
import { customEntry, type CatalogEntry } from "./kitchen-catalog";
import { readRecipe, withRecipe, type NicheRecipe } from "./niche-recipe";
import { syncPartitionDoors } from "./partition-doors";
import { findFeature, uniqueId, uniqueOffsetId } from "./operations";
import { emptySketchGeometry, type BackSettings, type DoorSettings, type PartitionParams, type SketchGeometry } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import { PART_SEPARATOR, type CadDocument, type PlaneFrame, type SketchFeature } from "./types";
import { nichePartsIn } from "../features/niche-parts";
import { nearestPlane } from "../sketcher/frame";
import { extrusionGroups, isPartition, leafNiches, partitionRecord, rebuildChain } from "../sketcher/partition-history";

export interface CaissonSpec {
  /** Its construction, at the width and height it was made. */
  input: PartitionParams;
  /** Depth of its panels (mm), its back behind them. */
  depth: number;
  doors?: DoorSettings;
  back?: BackSettings;
  /** What each case holds, from the left (two cases with no side between them: one, the first). */
  cases: NicheRecipe[];
  /** The material of its carcass, and of its fronts. */
  carcass?: string;
  facing?: string;
}

/** The cases that start a niche: not those joined to the one before by « no side ». */
const caseStarts = (input: PartitionParams) => Array.from({ length: input.cases }, (_, k) => k).filter((k) => k === 0 || input.dividers[k - 1] !== "none");

/**
 * The caisson a sketch makes (its first Répartition extruded), or why it is none; of a Répartition of several cases
 * (a dressing's wall), with `at`, the case of that index only: a caisson of one case, its sides around it.
 */
export function caissonSpecOf(doc: CadDocument, sketchId: string, at?: number): CaissonSpec | string {
  const sketch = findFeature(doc, sketchId);
  const record = sketch?.type === "sketch" ? (sketch.offsets ?? []).find((r) => isPartition(r) && r.step.kind === "partition" && r.step.depth) : undefined;
  const step = record?.step;
  if (!record || step?.kind !== "partition" || !step.depth) return "Ce n'est pas un caisson : choisissez une Répartition extrudée.";
  const board = (record.bodies ?? []).map((id) => doc.bodyInfo?.[id]?.material).find(Boolean);
  const front = doc.features.flatMap((f) => (f.type === "niche" && f.sketch === sketchId ? nichePartsIn(doc.features, f).map((p, i) => (p.role === "front" ? doc.bodyInfo?.[`${f.id}${PART_SEPARATOR}${i}`]?.material : undefined)) : [])).find(Boolean);
  const looks = { ...(board ? { carcass: board } : {}), ...(front ? { facing: front } : {}) };
  if (at !== undefined && caseStarts(step.input).length > 1) {
    const boxes = leafNiches(sketch as SketchFeature).filter((n) => n.partition === record.id && n.path[0] === at).map((n) => n.box);
    if (!boxes.length) return "Cette case n'est plus retrouvée.";
    const { widths: _shares, ...input } = structuredClone(step.input);
    const door = step.doors && caseHasDoor(doc, sketchId, record.id, at);
    const { joined: _j, skipped: _s, hinges: _h, ...doors } = step.doors ?? { gap: 3, thickness: 18, handles: true };
    return {
      input: { ...input, cases: 2, dividers: ["none"], length: Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0)) + 2 * input.thickness },
      depth: step.depth, cases: [readRecipe(doc, { sketch: sketchId, partition: record.id, path: [at] })],
      ...(door ? { doors: { ...doors, joined: [0] } } : {}), ...(step.back ? { back: { ...step.back, split: "whole" as const } } : {}), ...looks,
    };
  }
  const cases = caseStarts(step.input).map((k) => readRecipe(doc, { sketch: sketchId, partition: record.id, path: [k] }));
  return {
    input: structuredClone(step.input), depth: step.depth, cases,
    ...(step.doors ? { doors: structuredClone(step.doors) } : {}), ...(step.back ? { back: { ...step.back } } : {}),
    ...looks,
  };
}

/** Its outside size: width and height of the Répartition, depth with its back. */
export const caissonSize = (spec: CaissonSpec) => ({ width: spec.input.length, height: spec.input.height, depth: spec.depth + (spec.back?.thickness ?? 0) });

/**
 * The caisson made on `frame` (its panels' back, at its bottom: x along its width, y up, its front towards the normal),
 * at this width and height; each case then filled as in the spec. Its sketch, or why it cannot be.
 */
export function withCaissonPlaced(base: CadDocument, spec: CaissonSpec, at: { frame: PlaneFrame; width: number; height: number; name: string }): { doc: CadDocument; sketch: string } | string {
  const input: PartitionParams = { ...structuredClone(spec.input), length: at.width, height: at.height };
  const step = uniqueOffsetId(base);
  const record = partitionRecord(step, `Répartition — ${at.name}`, input, [0, 0], spec.depth);
  if (record.step?.kind === "partition") {
    if (spec.back) record.step.back = { ...spec.back };
    if (spec.doors) record.step.doors = structuredClone(spec.doors);
  }
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets: [record] }, step);
  if (typeof rebuilt === "string") return rebuilt;
  if (rebuilt.problems.length) return rebuilt.problems.join(" ");
  const sketch = uniqueId(base, "sk");
  const feature: SketchFeature = { id: sketch, type: "sketch", name: at.name, plane: nearestPlane(at.frame.normal), offset: 0, frame: at.frame, ...emptySketchGeometry() };
  const known = new Set(base.features.map((f) => f.id));
  let doc = withSketchExtrusion({ ...base, features: [...base.features, feature] }, sketch, rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
  doc = syncPartitionDoors(doc, sketch);
  const starts = caseStarts(input);
  for (const [i, recipe] of spec.cases.entries()) {
    const k = starts[i];
    if (k === undefined || (!recipe.steps.length && !recipe.equipment.length)) continue;
    const filled = withRecipe(doc, { sketch, partition: step, path: [k] }, recipe);
    if (typeof filled === "string") return filled;
    doc = filled;
  }
  // Its looks: the carcass in its material, the fronts in theirs.
  const info = { ...doc.bodyInfo };
  for (const f of doc.features) {
    if (known.has(f.id)) continue;
    if (f.type === "extrude" && spec.carcass) info[f.id] = { ...info[f.id], material: spec.carcass };
    if (f.type === "niche" && spec.facing) nichePartsIn(doc.features, f).forEach((p, i) => p.role === "front" && (info[`${f.id}${PART_SEPARATOR}${i}`] = { ...info[`${f.id}${PART_SEPARATOR}${i}`], material: spec.facing }));
  }
  return { doc: { ...doc, bodyInfo: info }, sketch };
}

/**
 * A caisson kept in « Mes caissons »: a unit of one's own (kitchen-catalog.ts) that makes it — low, high or tall from
 * where it stands and how tall it is —, or why it cannot be.
 */
export function caissonEntry(doc: CadDocument, sketchId: string, name: string, at?: number): CatalogEntry | string {
  const spec = caissonSpecOf(doc, sketchId, at);
  if (typeof spec === "string") return spec;
  const sketch = findFeature(doc, sketchId) as SketchFeature;
  const { width, height, depth } = caissonSize(spec);
  const kind = (sketch.frame?.origin[2] ?? 0) >= 600 ? "wall" : height >= 1500 ? "tall" : "base";
  const entry = customEntry({ kind, name, width, height, depth, plinth: spec.input.plinth, layout: "none", shelves: 0 });
  return typeof entry === "string" ? entry : { ...entry, caisson: spec };
}

/**
 * A caisson of « Mes caissons » put in a Répartition from this case on: the inside of each of its cases in a case, from
 * left to right, and its doors where it had some; each inside fits its case.
 */
export function withCaissonInCase(base: CadDocument, sketchId: string, partition: string, at: number, spec: CaissonSpec): CadDocument | string {
  const record = (findFeature(base, sketchId) as SketchFeature | undefined)?.offsets?.find((r) => r.id === partition && isPartition(r));
  if (record?.step?.kind !== "partition") return "Cette Répartition n'existe plus.";
  const starts = caseStarts(record.step.input).filter((k) => k >= at);
  let doc = base;
  for (const [i, recipe] of spec.cases.entries()) {
    const k = starts[i];
    if (k === undefined) break;
    const filled = withRecipe(doc, { sketch: sketchId, partition, path: [k] }, recipe);
    if (typeof filled === "string") return filled;
    doc = filled;
    if (spec.doors && !caseHasDoor(doc, sketchId, partition, k)) doc = withCaseDoor(doc, sketchId, partition, k);
  }
  return doc;
}
