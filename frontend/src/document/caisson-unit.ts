/**
 * Un caisson de cuisine aménagé à la main (cabinet-furnish.ts), réglé depuis « Meuble choisi » du linéaire comme un
 * meuble : sa hauteur (en haut) et sa profondeur, sa Répartition refaite à ces cotes, son intérieur adapté ; ou remis
 * en meuble d'origine — l'aménagement ôté, le meuble du catalogue qu'il était remis à sa place, à sa largeur. Pur.
 */
import { partitionOf, withCaissonRemade } from "./caisson-follow";
import { withCaissonRemoved } from "./kitchen-delete-sync";
import { CATALOG } from "./kitchen-catalog";
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { findFeature, updateFeature } from "./operations";
import type { OffsetRecord } from "./sketch";
import type { CadDocument, KitchenRunItem } from "./types";
import { applianceOf, itemEntry, sizeLimits, SPACE_WALL, SURROUND, surroundFridge } from "../features/kitchen-run-items";

type Made = { doc: CadDocument; problems: string[] } | string;

/** The model of the unit this caisson was: the one kept when it was furnished, or the one its name says, or a plain one. */
export function heldModel(doc: CadDocument, item: KitchenRunItem): string {
  // (One of « Mes meubles » is not in the catalogue: its name tells nothing either.)
  // An appliance's unit too (a sink's, a fridge's surround): what it was, not the caisson it has.
  if (item.from && (applianceOf({ model: item.from }) || CATALOG.some((e) => e.id.replace(/-\d+$/, "") === item.from))) return item.from;
  const wall = item.model === SPACE_WALL;
  // « Caisson — Haut 1 porte 60 (A3) »: « Haut 1 porte ».
  const name = (findFeature(doc, item.furnished ?? "")?.name ?? "").replace(/^Caisson — /, "").replace(/\s*\([A-Z]+\d+\)$/, "").replace(/\s+\d+$/, "");
  const entry = CATALOG.find((e) => e.name === name && (e.kind === "wall") === wall);
  return entry ? entry.id.replace(/-\d+$/, "") : wall ? "wall-haut-1-porte" : "base-bas-2-portes";
}

/** Where the caisson furnished on `sketchId` is kept: its plan, run and item, and its sketch. */
export function held(doc: CadDocument, sketchId: string) {
  const sketch = findFeature(doc, sketchId);
  for (const f of doc.features) {
    const plan = f.type === "sketch" && f.kitchenPlan ? kitchenPlanIn(doc, f.id) : undefined;
    for (const [run, items] of Object.entries(plan?.runs ?? {})) {
      const item = items.find((i) => i.furnished === sketchId);
      if (plan && item && sketch?.type === "sketch") return { planId: f.id, plan, run, item, sketch };
    }
  }
  return null;
}

/** Its depth (front to back, its back included) and its height as its Répartition makes them. */
export function caissonSizes(doc: CadDocument, sketchId: string): { height: number; depth: number } | null {
  const sketch = findFeature(doc, sketchId);
  const record = sketch?.type === "sketch" ? partitionOf(sketch) : undefined;
  return record ? { height: record.step.input.height, depth: record.step.depth! + (record.step.back?.thickness ?? 0) } : null;
}

/** The caisson furnished on `sketchId` made to this height (up in the wall row) or depth: its room too. */
export function withCaissonSized(doc: CadDocument, sketchId: string, patch: { height?: number; depth?: number }): Made {
  const at = held(doc, sketchId);
  if (!at) return "Ce caisson n'est plus sur le linéaire.";
  const { planId, run, item: { id } } = at;
  const now = caissonSizes(doc, at.sketch.id)!;
  const record = partitionOf(at.sketch)!;
  const step = { ...record.step, input: { ...record.step.input, height: patch.height ?? now.height }, depth: record.step.depth! + (patch.depth ?? now.depth) - now.depth };
  const next = updateFeature(doc, at.sketch.id, (f) => (f.type === "sketch" ? { ...f, offsets: (f.offsets ?? []).map((r) => (r.id === record.id ? ({ ...r, step } as OffsetRecord) : r)) } : f));
  // Its room as deep and as high: the kitchen made again sets its sketch where it now stands, then its panels are made again.
  const room = { ...at.item, ...(patch.depth !== undefined ? { depth: patch.depth } : {}), ...(patch.height !== undefined && at.item.model === SPACE_WALL ? { height: patch.height } : {}) };
  const built = withKitchenBuilt(next, planId, { runs: { ...at.plan.runs, [run]: at.plan.runs![run]!.map((i) => (i.id === id ? room : i)) } });
  if (typeof built === "string") return built;
  const made = withCaissonRemade(built.doc, at.sketch.id);
  return typeof made === "string" ? made : { doc: made.doc, problems: [...built.problems, ...made.problems] };
}

/** The room of the caisson furnished on `sketchId` the unit it was again: the caisson taken away, that unit made at its width. */
export function withCaissonUnfurnished(doc: CadDocument, sketchId: string): Made {
  const at = held(doc, sketchId);
  if (!at) return "Ce caisson n'est plus sur le linéaire.";
  const { planId, run, item: { id } } = at;
  const model = heldModel(doc, at.item);
  const freed = withCaissonRemoved(doc, at.sketch.id);
  const plan = kitchenPlanIn(freed, planId);
  if (!plan) return "Ce plan n'existe plus.";
  // A fridge's surround with its own height and its fridge's.
  const unit: KitchenRunItem = { id, model, width: at.item.width, ...(applianceOf({ model }) && at.item.height ? { height: at.item.height } : {}), ...(at.item.fridge ? { fridge: at.item.fridge } : {}) };
  return withKitchenBuilt(freed, planId, { runs: { ...plan.runs, [run]: (plan.runs?.[run] ?? []).map((i) => (i.id === id ? unit : i)) } });
}

/**
 * A column or a fridge's surround made to this height (mm). A surround: its sides and its caisson on top, the fridge
 * under it kept as high as it is (20 cm of caisson at least); furnished (its caisson a Répartition), that caisson made
 * again to the room left over the fridge. A column furnished: its caisson made to that height.
 */
export function withSurroundHeight(doc: CadDocument, planId: string, run: string, itemId: string, mm: number): Made {
  const plan = kitchenPlanIn(doc, planId);
  const items = plan?.runs?.[run] ?? [];
  const item = items.find((i) => i.id === itemId);
  if (!plan || !item) return "Ce meuble n'est plus sur le linéaire.";
  const surround = { ...item, model: item.furnished ? (item.from ?? item.model) : item.model };
  const entry = itemEntry(surround);
  const fridge = applianceOf(surround)?.role === "fridge-surround";
  if (!fridge && entry.kind !== "tall") return "Seuls une colonne et l'habillage de réfrigérateur se règlent ainsi en hauteur.";
  const [lo, hi] = sizeLimits(plan, entry).height ?? [0, 0];
  const height = Math.round(mm * 10) / 10;
  if (!(height >= lo && height <= hi)) return `La hauteur ${fridge ? "de l'habillage" : "de la colonne"} va de ${lo / 10} à ${hi / 10} cm.`;
  // A column made a caisson (a Répartition): that caisson made to this height, from the floor.
  if (!fridge && item.furnished) return withCaissonSized(doc, item.furnished, { height });
  const built = withKitchenBuilt(doc, planId, { runs: { ...plan.runs, [run]: items.map((i) => (i.id === itemId ? { ...i, height } : i)) } });
  if (typeof built === "string" || !item.furnished) return built;
  // Its caisson: from over the fridge, with its air, up to the top.
  const top = height - surroundFridge(plan, { ...surround, height }) - SURROUND.air;
  const sized = withCaissonSized(built.doc, item.furnished, { height: top });
  return typeof sized === "string" ? sized : { doc: sized.doc, problems: [...built.problems, ...sized.problems] };
}
