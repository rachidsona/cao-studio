/**
 * « Mes murs » : un mur fait, relu en largeurs de cases et en recettes de niches, gardé pour être reposé sur une zone
 * libre d'un plan, de ce projet ou d'un autre : ses colonnes gardent leurs proportions à la longueur de la zone. Pur.
 */
import { emptyRecipe, readRecipe, withRecipe, type NicheRecipe } from "./niche-recipe";
import { findFeature } from "./operations";
import { withZonePartition } from "./plan-layout";
import type { PlanZone } from "./plan-shapes";
import type { CadDocument, SketchFeature } from "./types";
import { partitionLayout } from "../sketcher/partition";
import { isPartition } from "../sketcher/partition-history";

export interface WallTemplate {
  name: string;
  /** The width of each case when it was kept: what is laid again takes the same proportions. */
  widths: number[];
  cases: NicheRecipe[];
}

/** The wall made on this sketch, under this name; null when it has no Répartition. */
export function readWall(doc: CadDocument, sketchId: string, name: string): WallTemplate | null {
  const sketch = findFeature(doc, sketchId) as SketchFeature | undefined;
  const record = sketch?.offsets?.find(isPartition);
  const layout = record && isPartition(record) ? partitionLayout(record.step.input) : null;
  if (!record || !layout || typeof layout === "string") return null;
  return { name, widths: layout.caseWidths, cases: layout.caseWidths.map((_, i) => readRecipe(doc, { sketch: sketchId, partition: record.id, path: [i] })) };
}

/** This wall on this free zone of a plan. A string: why it cannot be. */
export function withWall(base: CadDocument, planId: string, zone: PlanZone, wall: WallTemplate): CadDocument | string {
  const made = withZonePartition(base, planId, zone, { label: "", cases: wall.widths, rest: null, filler: false });
  if (typeof made === "string") return made;
  const partition = (findFeature(made.doc, made.sketch) as SketchFeature).offsets?.find(isPartition)?.id;
  if (!partition) return "Cette zone n'a pas de Répartition.";
  let doc = made.doc;
  for (const [i, recipe] of wall.cases.entries()) {
    if (emptyRecipe(recipe)) continue;
    const next = withRecipe(doc, { sketch: made.sketch, partition, path: [i] }, recipe);
    if (typeof next === "string") return `Case ${i + 1} : ${next}`;
    doc = next;
  }
  return doc;
}
