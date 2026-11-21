/**
 * « Pipette de forme » d'une Répartition à une autre : l'organisation de l'une donnée à l'autre, qui garde ses cotes
 * (longueur, hauteur, profondeur), sa place, son nom et son fond. Elle prend la construction de l'autre (cases et
 * leurs proportions, côtés simples, doubles ou absents, épaisseur, qui passe aux angles, socle), ses portes — les siennes
 * et ses « Porte sur niches » (celles des surmeubles), leurs réglages et leur ouverture —, et ce que tient chaque case
 * (étagères, cloisons, penderie, tiroirs), refaits à ses propres cotes ; ce qu'elle tenait s'en va.
 * Pur.
 */
import { caissonSpecOf } from "./caisson-spec";
import { withRecipe } from "./niche-recipe";
import { bodyOrigin, findFeature, uniqueId, uniqueName } from "./operations";
import { syncPartitionDoors } from "./partition-doors";
import { removeStep } from "./shelf-removal";
import type { OffsetRecord, PartitionParams } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import { featureOfBody, type CadDocument, type NicheFeature, type SketchFeature } from "./types";
import { extrusionGroups, isPartition, isShelves, rebuildChain } from "../sketcher/partition-history";

/** The Répartition (its sketch) a panel of it belongs to — a side, the top, the bottom; null for any other body. */
export function partitionOfBody(doc: CadDocument, bodyId: string): string | null {
  const id = featureOfBody(bodyOrigin(doc, bodyId));
  const sketch = doc.features.find((f): f is SketchFeature => f.type === "sketch" && (f.offsets ?? []).some((r) => isPartition(r) && (r.bodies ?? []).includes(id)));
  return sketch?.id ?? null;
}

/** The cases that start a niche: not those joined to the one before by « no side ». */
const caseStarts = (input: PartitionParams) => Array.from({ length: input.cases }, (_, k) => k).filter((k) => k === 0 || input.dividers[k - 1] !== "none");

/** Répartition `to` organised as Répartition `from`, at its own sizes; or why not. */
export function withOrganisationCopied(doc: CadDocument, from: string, to: string): CadDocument | string {
  if (from === to) return "C'est la Répartition dont l'organisation est prise : cliquez-en une autre.";
  const spec = caissonSpecOf(doc, from);
  if (typeof spec === "string") return spec;
  const g = findFeature(doc, to);
  const record = g?.type === "sketch" ? (g.offsets ?? []).find(isPartition) : undefined;
  if (g?.type !== "sketch" || !record || !isPartition(record)) return "Cette Répartition n'existe plus.";
  const partition = record.id;
  // What it held goes: its shelves and cloisons (the first ones take theirs along), what equips its niches, its doors.
  let next = doc;
  for (const r of (g.offsets ?? []).filter((o) => isShelves(o) && o.step.of === partition && o.step.niche.length === 1)) next = removeStep(next, to, r.id);
  next = { ...next, features: next.features.filter((f) => !(f.type === "niche" && f.sketch === to && f.partition === partition && f.fill !== "back")) };
  // Its construction and its doors, at its own length and height (laid in a body, it stays so).
  const own = record.step.input;
  const input: PartitionParams = { ...structuredClone(spec.input), length: own.length, height: own.height, ...(own.inside ? { inside: true } : {}) };
  const now = findFeature(next, to) as SketchFeature;
  const offsets = (now.offsets ?? []).map((r) => {
    if (r.id !== partition || !isPartition(r)) return r;
    const { doors: _doors, ...step } = r.step;
    return { ...r, step: { ...step, input, ...(spec.doors ? { doors: structuredClone(spec.doors) } : {}) } } as OffsetRecord;
  });
  const rebuilt = rebuildChain({ ...now, offsets }, partition);
  if (typeof rebuilt === "string") return rebuilt;
  if (rebuilt.problems.length) return rebuilt.problems.join(" ");
  next = withSketchExtrusion(next, to, rebuilt.geometry, { groups: extrusionGroups(now.offsets ?? [], rebuilt) });
  // What each case holds, made again at its sizes.
  const starts = caseStarts(input);
  for (const [i, recipe] of spec.cases.entries()) {
    const k = starts[i];
    if (k === undefined || (!recipe.steps.length && !recipe.equipment.length)) continue;
    const filled = withRecipe(next, { sketch: to, partition, path: [k] }, recipe);
    if (typeof filled === "string") return `Case ${i + 1} : ${filled}`;
    next = filled;
  }
  // Its doors over niches, as they are (their niches the same ones, the organisation being the same).
  for (const door of doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === from && f.fill === "door")) {
    next = { ...next, features: [...next.features, { ...structuredClone(door), id: uniqueId(next, "pn"), name: uniqueName(next, "Porte"), sketch: to, partition }] };
  }
  return syncPartitionDoors(next, to);
}
