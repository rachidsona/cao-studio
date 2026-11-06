/**
 * Un module déjà posé, relu dans ses étapes : ce qu'est une niche divisée — penderie, double penderie, étagères, tiroirs,
 * porte-pantalons — se lit dans ses Étagères et ses équipements, sans rien de plus à garder ; un module posé hier, ou
 * retouché à la main avec Étagères ou Niche, se relit donc de même. Le changer, c'est le retirer et le poser à nouveau,
 * en une seule annulation : ses pièces gardent matière et apparence. Pur.
 */
import { nicheGeometry } from "../features/niche-parts";
import { isShelves, pathKey, rebuildChain } from "../sketcher/partition-history";
import { heldHeights, type NicheBox } from "../sketcher/shelves";
import { moduleSizes, TROUSERS, trousersBox, withModules, type ModuleKind, type ModuleSizes } from "./dressing-modules";
import { findFeature } from "./operations";
import type { OffsetRecord } from "./sketch";
import { removeStep } from "./shelf-removal";
import type { BodyInfo, CadDocument, NicheFeature, SketchFeature, TrimFeature } from "./types";

export interface PlacedModule {
  kind: ModuleKind;
  partition: string;
  /** The niche the module fills. */
  path: number[];
  box: NicheBox;
  thickness: number;
  sizes: ModuleSizes;
  /** The first division of the module: taking it away takes the module away. */
  step: string;
}

const under = (path: number[], root: number[]) => path.length > root.length && pathKey(path.slice(0, root.length)) === pathKey(root);
const isDivision = (r: OffsetRecord) => isShelves(r) && !r.step.input.vertical;
const trousersIn = (doc: CadDocument, here: NicheBox, sketch: SketchFeature, partition: string, path: number[]): TrimFeature | undefined => {
  const geometry = nicheGeometry({ partition, niche: [...path, 0] }, sketch);
  if (typeof geometry === "string") return undefined;
  const [from] = trousersBox({ ...geometry, box: here });
  return doc.features.find((f): f is TrimFeature => f.type === "trim" && f.parts.some((p) => p.item === TROUSERS && p.from.every((v, i) => Math.abs(v - from[i]!) < 1)));
};

/** The module filling exactly this niche, or null: nothing there, or something divided by hand. */
function moduleAt(doc: CadDocument, sketch: SketchFeature, partition: string, path: number[]): PlacedModule | null {
  const rebuilt = rebuildChain(sketch, partition);
  if (typeof rebuilt === "string") return null;
  const steps = (sketch.offsets ?? []).filter((r): r is OffsetRecord & { step: Extract<OffsetRecord["step"], { kind: "shelves" }> } => isShelves(r) && r.step.of === partition && under([...r.step.niche, 0], path));
  const step = (p: number[]) => steps.find((r) => pathKey(r.step.niche) === pathKey(p));
  const first = step(path);
  if (!first || steps.some((r) => !isDivision(r))) return null;
  const fill = (p: number[]) => doc.features.find((f): f is NicheFeature => f.type === "niche" && f.sketch === sketch.id && f.partition === partition && pathKey(f.niche) === pathKey(p));
  const height = (p: number[]) => {
    const b = rebuilt.niches.get(pathKey(p))?.box;
    return b ? b.y1 - b.y0 : 0;
  };
  const box = rebuilt.niches.get(pathKey(path))?.box;
  if (!box) return null;
  const [low, high] = [[...path, 0], [...path, 1]];
  const lower = step(low);
  const upper = step(high);
  const count = first.step.input.count;
  let kind: ModuleKind | null = null;
  const sizes: Partial<ModuleSizes> = {};
  let column: typeof first | undefined;
  if (count > 1 && steps.length === 1) {
    kind = "shelves";
    column = first;
  } else if (count === 1 && fill(low)?.fill === "drawers" && !lower) {
    sizes.drawerZone = height(low);
    if (upper && upper.step.input.count === 1 && fill([...high, 0])?.fill === "rod" && steps.length === 2) {
      kind = "rod-drawers";
      sizes.hat = height([...high, 1]);
    } else if (upper && steps.length === 2 && !fill(high)) {
      kind = "drawers";
      column = upper;
    } else if (!upper && steps.length === 1 && !fill(high)) {
      kind = "drawers";
      sizes.shelves = 0;
    }
  } else if (count === 1 && lower?.step.input.count === 1 && fill([...low, 0])?.fill === "rod" && fill([...low, 1])?.fill === "rod" && steps.length === 2) {
    kind = "double";
    sizes.hat = height(high);
  } else if (count === 1 && fill(low)?.fill === "rod" && steps.length === 1) {
    kind = "long";
    sizes.hat = height(high);
  } else if (count === 1 && steps.length === 1 && !fill(low) && !fill(high)) {
    kind = trousersIn(doc, rebuilt.niches.get(pathKey(low))?.box as NicheBox, sketch, partition, path) ? "trousers" : "shelves";
    if (kind === "trousers") sizes.hat = height(high);
    else column = first;
  }
  if (!kind) return null;
  if (column) {
    const { input } = column.step;
    sizes.shelves = input.count;
    sizes.spacing = Math.round((column === first ? box.y1 - box.y0 : height(high)) / (input.count + 1));
    // The niches set one by one, from the root of the module.
    const held = Object.fromEntries(heldHeights(input).flatMap((h, i) => (h === null ? [] : [[[...column!.step.niche.slice(path.length), i].join("."), h]])));
    if (Object.keys(held).length) sizes.heights = held;
  }
  const rod = fill(kind === "double" ? [...low, 0] : kind === "rod-drawers" ? [...high, 0] : low);
  if (rod?.fill === "rod") sizes.rod = { diameter: rod.diameter, drop: rod.drop };
  const front = fill(low);
  if (front?.fill === "drawers") {
    sizes.drawers = front.drawers;
    sizes.front = { gap: front.gap, bottomGap: front.bottomGap ?? front.gap, betweenGap: front.betweenGap ?? front.gap, sideGap: front.sideGap ?? front.gap, thickness: front.thickness, handles: front.handles };
  }
  return { kind, partition, path, box, thickness: first.step.input.thickness, sizes: { ...moduleSizes(kind), ...sizes }, step: first.id };
}

/** The module this niche belongs to: the largest one around it. */
export function moduleOfNiche(doc: CadDocument, sketch: SketchFeature, partition: string, path: number[]): PlacedModule | null {
  for (let k = 1; k < path.length; k++) {
    const placed = moduleAt(doc, sketch, partition, path.slice(0, k));
    if (placed) return placed;
  }
  return null;
}

/** The bodies of the shelves of a module, from the first step made. */
const moduleBodies = (sketch: SketchFeature, partition: string, path: number[]) =>
  (sketch.offsets ?? []).filter((r) => isShelves(r) && r.step.of === partition && (pathKey(r.step.niche) === pathKey(path) || under(r.step.niche, path))).flatMap((r) => r.bodies ?? []);

/** The document without this module: its niche is free again, and a porte-pantalons leaves the quote with it. */
export function withoutModule(base: CadDocument, sketchId: string, placed: PlacedModule): CadDocument {
  const before = findFeature(base, sketchId) as SketchFeature;
  const doc = removeStep(base, sketchId, placed.step);
  const low = placed.kind === "trousers" ? rebuildChain(before, placed.partition) : null;
  const box = low && typeof low !== "string" ? low.niches.get(pathKey([...placed.path, 0]))?.box : undefined;
  const geometry = nicheGeometry({ partition: placed.partition, niche: [...placed.path, 0] }, before);
  if (!box || typeof geometry === "string") return doc;
  const [from] = trousersBox({ ...geometry, box });
  const same = (p: TrimFeature["parts"][number]) => p.item === TROUSERS && p.from.every((v, i) => Math.abs(v - from[i]!) < 1);
  return { ...doc, features: doc.features.map((f) => (f.type === "trim" ? { ...f, parts: f.parts.filter((p) => !same(p)) } : f)).filter((f) => f.type !== "trim" || f.parts.length > 0) };
}

/** A module changed: taken away, and laid again with these sizes, as one change. A string: why it cannot be. */
export function withModuleChanged(base: CadDocument, sketchId: string, placed: PlacedModule, kind: ModuleKind, thickness: number, sizes: ModuleSizes): CadDocument | string {
  const kept: BodyInfo[] = moduleBodies(findFeature(base, sketchId) as SketchFeature, placed.partition, placed.path).map((id) => base.bodyInfo?.[id] ?? {});
  const made = withModules(withoutModule(base, sketchId, placed), sketchId, [{ partition: placed.partition, path: placed.path, box: placed.box }], kind, thickness, sizes);
  if (typeof made === "string") return made;
  const info = { ...made.bodyInfo };
  moduleBodies(findFeature(made, sketchId) as SketchFeature, placed.partition, placed.path).forEach((id, i) => {
    const own = kept[Math.min(i, kept.length - 1)];
    if (own && Object.keys(own).length) info[id] = own;
  });
  return { ...made, bodyInfo: info };
}
