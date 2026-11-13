/**
 * Ce que contient une niche, relu dans ses étapes pour être reposé ailleurs : ses divisions (Étagères, Cloisons) et ses
 * équipements (Penderie, Tiroirs), avec des chemins relatifs à la niche. Une recette se pose dans une autre niche, d'une
 * autre zone au besoin, où ses cotes s'adaptent ; elle se retourne en miroir pour le mur d'en face ; et les hauteurs
 * d'une niche se reportent sur une autre pour que les étagères s'alignent d'une colonne à l'autre. Pur.
 */
import { withEquipment } from "./equipment";
import { findFeature, uniqueId, uniqueName, uniqueOffsetId } from "./operations";
import type { OffsetRecord, ShelfParams } from "./sketch";
import { removeStep } from "./shelf-removal";
import { withSketchExtrusion } from "./sketch-extrusion";
import type { CadDocument, NicheFeature, SketchFeature } from "./types";
import { nicheGeometry, nicheProblem } from "../features/niche-parts";
import { columnPath, extrusionGroups, idsFrom, isPartition, isShelves, pathKey, rebuildChain, shelvesRecord } from "../sketcher/partition-history";

type Equipment = Omit<NicheFeature, "id" | "name" | "sketch" | "partition" | "niche">;

export interface NicheRecipe {
  steps: { at: number[]; input: ShelfParams }[];
  equipment: { at: number[]; feature: Equipment; title: string }[];
}

/** A place in a sketch: this niche of this partition. */
export interface NichePlace {
  sketch: string;
  partition: string;
  path: number[];
}

const inside = (path: number[], root: number[]) => path.length >= root.length && pathKey(path.slice(0, root.length)) === pathKey(root);
type Division = OffsetRecord & { step: Extract<OffsetRecord["step"], { kind: "shelves" }> };
const divisionsIn = (sketch: SketchFeature, { partition, path }: Pick<NichePlace, "partition" | "path">) => (sketch.offsets ?? []).filter((r): r is Division => isShelves(r) && r.step.of === partition && inside(r.step.niche, path));
const fillsIn = (doc: CadDocument, { sketch, partition, path }: NichePlace) => doc.features.filter((f): f is NicheFeature => f.type === "niche" && f.sketch === sketch && f.partition === partition && (f.fill === "rod" || f.fill === "drawers") && inside(f.niche, path));

/** The column a niche is part of: from a niche between two shelves, the whole of what those shelves divide. */
export const columnOf = (doc: CadDocument, place: NichePlace): NichePlace => ({ ...place, path: columnPath(findFeature(doc, place.sketch) as SketchFeature, place.partition, place.path) });

/** What this niche holds; empty when it holds nothing. */
export function readRecipe(doc: CadDocument, place: NichePlace): NicheRecipe {
  const sketch = findFeature(doc, place.sketch) as SketchFeature;
  const relative = (path: number[]) => path.slice(place.path.length);
  return {
    steps: divisionsIn(sketch, place).map((r) => ({ at: relative(r.step.niche), input: r.step.input })),
    equipment: fillsIn(doc, place).map(({ id: _id, name, sketch: _sketch, partition: _partition, niche, ...feature }) => ({ at: relative(niche), feature, title: name.replace(/\s*\d+$/, "") })),
  };
}

export const emptyRecipe = (recipe: NicheRecipe) => !recipe.steps.length && !recipe.equipment.length;

/** The recipe seen from behind: cloisons from right to left, the shelves as they are. */
export function mirrored(recipe: NicheRecipe): NicheRecipe {
  const flip = (path: number[]) =>
    path.map((index, k) => {
      const division = recipe.steps.find((s) => pathKey(s.at) === pathKey(path.slice(0, k)))?.input;
      return division?.vertical ? division.count - index : index;
    });
  const turned = (input: ShelfParams): ShelfParams =>
    !input.vertical ? input : { ...input, mode: input.mode === "bottom" ? "top" : input.mode === "top" ? "bottom" : input.mode, ...(input.heights ? { heights: [...input.heights].reverse() } : {}) };
  return { steps: recipe.steps.map((s) => ({ at: flip(s.at), input: turned(s.input) })), equipment: recipe.equipment.map((e) => ({ ...e, at: flip(e.at) })) };
}

/** The document with this niche emptied of its divisions and of what they hold. */
function emptied(base: CadDocument, place: NichePlace): CadDocument {
  let doc = base;
  for (const fill of fillsIn(doc, place)) doc = { ...doc, features: doc.features.filter((f) => f.id !== fill.id) };
  const sketch = findFeature(doc, place.sketch) as SketchFeature;
  const first = divisionsIn(sketch, place).filter((r) => r.step.niche.length === place.path.length);
  for (const r of first) doc = removeStep(doc, place.sketch, r.id);
  return doc;
}

const stepName = (records: readonly OffsetRecord[], vertical: boolean | undefined) => {
  const word = vertical ? "Cloisons" : "Étagères";
  const pattern = new RegExp(`^${word} (\\d+)$`);
  return `${word} ${Math.max(0, ...records.map((r) => pattern.exec(r.name)?.[1]).filter((n): n is string => n !== undefined).map(Number)) + 1}`;
};

/** This recipe in this niche, instead of what it held. A string: why it cannot be. */
export function withRecipe(base: CadDocument, place: NichePlace, recipe: NicheRecipe): CadDocument | string {
  const start = emptied(base, place);
  const g = findFeature(start, place.sketch);
  if (g?.type !== "sketch") return "Cette niche n'existe plus.";
  const depth = (g.offsets ?? []).find((r) => r.id === place.partition && isPartition(r))?.step;
  const ids = idsFrom(uniqueOffsetId(start), recipe.steps.length);
  const offsets = [...(g.offsets ?? [])];
  recipe.steps.forEach((s, i) => offsets.push(shelvesRecord(ids[i] as string, stepName(offsets, s.input.vertical), place.partition, [...place.path, ...s.at], s.input, depth?.kind === "partition" ? depth.depth : undefined)));
  const rebuilt = rebuildChain({ ...g, offsets }, place.partition);
  if (typeof rebuilt === "string") return rebuilt;
  if (rebuilt.problems.length) return rebuilt.problems.join(" ");
  let doc = withSketchExtrusion(start, place.sketch, { ...g, offsets, ...rebuilt.geometry }, { groups: extrusionGroups(g.offsets ?? [], rebuilt, new Set(ids)) });
  const sketch = findFeature(doc, place.sketch) as SketchFeature;
  const features: NicheFeature[] = [];
  let probe = doc;
  for (const { at, feature, title } of recipe.equipment) {
    const f = { ...feature, id: uniqueId(probe, feature.fill === "rod" ? "pd" : feature.fill === "accessory" ? "ac" : "td"), name: uniqueName(probe, title), sketch: place.sketch, partition: place.partition, niche: [...place.path, ...at] } as NicheFeature;
    const here = nicheGeometry(f, sketch);
    if (typeof here === "string") return here;
    const problem = nicheProblem(f, here);
    if (problem) return problem;
    features.push(f);
    probe = { ...probe, features: [...probe.features, f] };
  }
  doc = withEquipment(doc, features);
  return doc;
}

/** The shelves of `target` at the heights of those of `source`, its first division made or changed to match. */
export function withAlignedShelves(base: CadDocument, source: NichePlace, target: NichePlace): CadDocument | string {
  const from = findFeature(base, source.sketch) as SketchFeature;
  const model = divisionsIn(from, source).find((r) => r.step.niche.length === source.path.length && !r.step.input.vertical);
  const made = rebuildChain(from, source.partition);
  if (!model || typeof made === "string") return "Cette niche n'a pas d'étagères à reprendre.";
  const sizes = Array.from({ length: model.step.input.count + 1 }, (_, i) => {
    const box = made.niches.get(pathKey([...source.path, i]))?.box;
    return box ? box.y1 - box.y0 : 0;
  });
  const input: ShelfParams = { ...model.step.input, mode: "set", heights: [...sizes.slice(0, -1), null] };
  const g = findFeature(base, target.sketch) as SketchFeature;
  const own = divisionsIn(g, target).find((r) => r.step.niche.length === target.path.length && !r.step.input.vertical);
  if (!own) return withRecipe(base, target, { steps: [{ at: [], input }], equipment: [] });
  const offsets = (g.offsets ?? []).map((r) => (r.id === own.id ? { ...own, step: { ...own.step, input: { ...own.step.input, count: input.count, mode: input.mode, heights: input.heights! } } } : r));
  const rebuilt = rebuildChain({ ...g, offsets }, target.partition);
  if (typeof rebuilt === "string") return rebuilt;
  if (rebuilt.problems.length) return rebuilt.problems.join(" ");
  return withSketchExtrusion(base, target.sketch, rebuilt.geometry, { groups: extrusionGroups(g.offsets ?? [], rebuilt) });
}
