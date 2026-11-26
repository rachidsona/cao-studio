/**
 * Un caisson de cuisine aménagé à la main : il devient un caisson comme ceux du dressing, une « Répartition » de mêmes
 * cotes, à la même place, avec son fond, ses étagères et ses façades (portes ou tiroirs) — ou, venu de « Mes caissons »,
 * celui qu'on avait gardé, à sa largeur. Étagères, Cloisons, Niche, Tiroirs, Penderie et Portes y marchent alors comme
 * dans un dressing. S'il venait d'un linéaire du Plan de cuisine, le linéaire lui garde sa place (un « Espace libre »
 * de sa largeur) : la cuisine refaite ne le refait plus, mais il suit cette place (caisson-follow.ts). Pur.
 */
import { panelsFrame } from "./caisson-follow";
import { withCaissonPlaced, type CaissonSpec } from "./caisson-spec";
import { kitchenPlanIn, kitchenRunOf, withKitchenBuilt } from "./kitchen-floor";
import { runCabinets } from "./kitchen-plan-add";
import type { NicheRecipe } from "./niche-recipe";
import { bodyOrigin, deleteFeatures, findFeature, updateFeature } from "./operations";
import { featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature } from "./types";
import { applianceOf, itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";

/** The kitchen cabinet a body belongs to: one of its boards, or of its fronts; null for anything else. */
export function cabinetOfBody(doc: CadDocument, bodyId: string): CabinetFeature | null {
  const f = findFeature(doc, featureOfBody(bodyOrigin(doc, bodyId)));
  if (f?.type === "cabinet") return f;
  if (f?.type === "fronts") {
    const c = findFeature(doc, f.cabinet);
    return c?.type === "cabinet" ? c : null;
  }
  return null;
}

/**
 * The cabinet's place in its run turned into a space of its size, the kitchen made again without it; null if no plan
 * made it. With where that space is, to link it to the caisson made there.
 */
function freedFromPlan(doc: CadDocument, c: CabinetFeature): { doc: CadDocument; plan: string; run: string; item: string } | string | null {
  const owner = kitchenRunOf(doc, c.id);
  const plan = owner && kitchenPlanIn(doc, owner.plan);
  if (!owner || !plan) return null;
  const items = plan.runs?.[owner.run] ?? [];
  const itemId = runCabinets(doc, owner.plan, owner.run).find((x) => x.cabinet === c.id)?.item;
  const item = items.find((i) => i.id === itemId);
  if (!item) return itemId === undefined && (plan.made?.[owner.run] ?? []).includes(c.id) ? "Un meuble d'angle ne s'aménage pas ainsi : choisissez un autre meuble du linéaire." : "Ce meuble n'est plus retrouvé dans son linéaire : refaites la cuisine, puis réessayez.";
  const wall = rowOf(itemEntry(item)) === "wall";
  // Its depth, and up in the wall row its height: the room is where the cabinet was, the caisson in it. A surround
  // keeps its width (its sides round the caisson), its height and its fridge's: the plan still makes them (heldUnits).
  const surround = applianceOf(item)?.role === "fridge-surround";
  const space = { ...newItem(items, wall ? SPACE_WALL : SPACE, surround ? item.width : c.width), id: item.id, depth: c.depth, ...(wall ? { height: c.height } : surround && item.height ? { height: item.height } : {}), ...(surround && item.fridge ? { fridge: item.fridge } : {}), ...(item.own ? {} : { from: item.model }) };
  const built = withKitchenBuilt(doc, owner.plan, { runs: { ...plan.runs, [owner.run]: items.map((i) => (i === item ? space : i)) } });
  return typeof built === "string" ? built : { doc: built.doc, plan: owner.plan, run: owner.run, item: item.id };
}

/** The room kept in a run linked to the caisson made there: it follows that room (caisson-follow.ts). */
function withRoomLinked(doc: CadDocument, at: { plan: string; run: string; item: string }, sketch: string): CadDocument {
  return updateFeature(doc, at.plan, (f) => {
    if (f.type !== "sketch" || !f.kitchenPlan?.runs?.[at.run]) return f;
    const runs = { ...f.kitchenPlan.runs, [at.run]: f.kitchenPlan.runs[at.run]!.map((i) => (i.id === at.item ? { ...i, furnished: sketch } : i)) };
    return { ...f, kitchenPlan: { ...f.kitchenPlan, runs } };
  });
}

/**
 * The caisson a kitchen cabinet is: its carcass, its back, its shelves, its doors or its drawers, their materials. As
 * the cabinet's, its sides go down to the floor; they are notched for the plinth of its run (document/kick-notches.ts).
 */
function cabinetSpec(doc: CadDocument, c: CabinetFeature, fronts: FrontsFeature | undefined): CaissonSpec {
  const back = c.back === "none" ? 0 : c.backThickness;
  const inside: NicheRecipe = { steps: c.shelves > 0 ? [{ at: [], input: { count: c.shelves, thickness: c.thickness, mode: "equal", fixed: 0 } }] : [], equipment: [] };
  if (fronts?.layout === "drawers" && c.shelves === 0) {
    const { gap, drawers, thickness, handles, drawerShares: shares } = fronts;
    // As the cabinet's: in front of the carcass, each at its height, their handles drilled only.
    inside.equipment.push({ at: [], title: "Tiroirs", feature: { type: "niche", fill: "drawers", diameter: 25, drop: 60, drawers, gap, bottomGap: gap, betweenGap: gap, sideGap: gap, thickness, handles, bareHandles: true, mount: "overlay", ...(shares ? { shares } : {}) } });
  }
  // A sink unit's top: two rails in place of the board (the pipes and the sink come through), its top open.
  const rails = c.top === "rails" && c.shelves === 0;
  if (rails) inside.equipment.push({ at: [], title: "Traverses d'évier", feature: { type: "niche", fill: "accessory", accessory: { model: "sink-rails", lift: 0 }, diameter: 25, drop: 60, drawers: 1, gap: 0, thickness: c.thickness, handles: false } });
  const pair = fronts?.layout === "doors";
  const carcass = doc.bodyInfo?.[`${c.id}${PART_SEPARATOR}0`]?.material ?? "melamine-white";
  const facing = fronts ? doc.bodyInfo?.[`${fronts.id}${PART_SEPARATOR}0`]?.material : undefined;
  return {
    input: { length: c.width, height: c.height, thickness: c.thickness, cases: 2, dividers: ["none"], boards: true, ...(rails ? { openTop: true } : {}), plinth: c.plinth, outer: c.construction === "sides-through" ? "side" : "board", single: "board", double: "side" },
    depth: c.depth - back,
    ...(back > 0 ? { back: { thickness: back, split: "whole" as const } } : {}),
    ...(fronts && fronts.layout !== "drawers" ? { doors: { gap: fronts.gap, thickness: fronts.thickness, handles: fronts.handles, bareHandles: true, ...(pair ? {} : { joined: [0], ...(fronts.side === "right" ? { hinges: ["right" as const] } : {}) }) } } : {}),
    cases: [inside],
    carcass,
    ...(facing ? { facing } : {}),
  };
}

/**
 * The cabinet made a caisson of the same size and place — its own, or `spec` (one of « Mes caissons ») at its width
 * and height —, its run, if a plan made it, keeping its place. The sketch of the new caisson, and what did not follow.
 */
export function withCabinetFurnished(doc: CadDocument, cabinetId: string, spec?: CaissonSpec): { doc: CadDocument; sketch: string; notes: string[] } | string {
  const c = findFeature(doc, cabinetId);
  if (c?.type !== "cabinet") return "Ce caisson n'existe plus.";
  const fronts = doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === c.id);
  const notes: string[] = [];
  const made = spec ?? cabinetSpec(doc, c, fronts[0]);
  if (!spec && fronts[0]?.layout === "drawers" && c.shelves > 0) notes.push("Ses tiroirs sont à reposer (Tiroirs).");
  if (!spec && (fronts[0]?.side === "top" || fronts[0]?.side === "bottom")) notes.push("Sa porte relevable devient une porte battante.");
  if (!spec && fronts[0]?.grip === "gorge") notes.push("Ses façades sans poignée reprennent des poignées.");
  if (!spec && (c.dividers ?? 0) > 0) notes.push("Ses cloisons sont à reposer (Cloisons).");
  if (!spec && c.top === "rails" && c.shelves > 0) notes.push("Son dessus est maintenant un panneau plein : pour un évier, découpez-le ou ôtez-le.");
  const freed = freedFromPlan(doc, c);
  if (typeof freed === "string") return freed;
  // Made again, the kitchen no longer has it (its ids now another's); otherwise it goes with its fronts.
  const next = freed?.doc ?? deleteFeatures(doc, [c.id, ...fronts.map((f) => f.id)]).next;
  const placed = withCaissonPlaced(next, made, { frame: panelsFrame(c, made.depth), width: c.width, height: c.height, name: `Caisson — ${spec ? c.name.replace(/\s*\([A-Z]\d+\)$/, "") : c.name}` });
  if (typeof placed === "string") return placed;
  if (!freed) return { doc: placed.doc, sketch: placed.sketch, notes };
  // Its room now held by it: the kitchen made again, its worktop and plinth over and under it as over a unit.
  const linked = withRoomLinked(placed.doc, freed, placed.sketch), rebuilt = withKitchenBuilt(linked, freed.plan, {});
  return { doc: typeof rebuilt === "string" ? linked : rebuilt.doc, sketch: placed.sketch, notes };
}

/**
 * Each unit of the plan's runs that is one of « Mes caissons » made that caisson, in its place; with « Caissons en
 * Répartition » (`asCaissons`), every other unit too, as « Isoler et aménager le caisson » does it — the ones that cannot
 * be (a corner unit, a fridge's surround, a casquette) stay as they are.
 */
export function withCaissonsPlaced(base: CadDocument, planId: string): { doc: CadDocument; problems: string[] } {
  const placed = withOwnCaissons(base, planId);
  return kitchenPlanIn(placed.doc, planId)?.asCaissons ? { doc: withUnitsFurnished(placed.doc, planId), problems: placed.problems } : placed;
}

/**
 * The caissons furnished in the rooms of a run that `items` no longer has (taken off its strip, « Vider le linéaire »)
 * deleted with them, their panels and their sketch: nothing is left in the 3D the plan no longer knows.
 */
export function withRoomsLeft(doc: CadDocument, planId: string, run: string, items: readonly { id: string }[]): CadDocument {
  const left = (kitchenPlanIn(doc, planId)?.runs?.[run] ?? []).filter((i) => i.furnished && !items.some((x) => x.id === i.id)).map((i) => i.furnished!);
  const ids = doc.features.filter((f) => left.includes(f.id) || ((f.type === "extrude" || f.type === "niche") && !!f.sketch && left.includes(f.sketch))).map((f) => f.id);
  return ids.length ? deleteFeatures(doc, ids).next : doc;
}

/** Every unit the plan made, one after the other, made a caisson of the dressing in its place. */
function withUnitsFurnished(base: CadDocument, planId: string): CadDocument {
  let doc = base;
  const tried = new Set<string>();
  for (let guard = 0; guard < 200; guard++) {
    const plan = kitchenPlanIn(doc, planId);
    const next = Object.keys(plan?.made ?? {}).flatMap((run) => runCabinets(doc, planId, run).filter((x) => x.item && !tried.has(x.item)))[0];
    if (!next) break;
    tried.add(next.item!);
    const made = withCabinetFurnished(doc, next.cabinet);
    if (typeof made !== "string") doc = made.doc;
  }
  return doc;
}

/** Each unit of the plan's runs that is one of « Mes caissons » made that caisson, in its place. */
function withOwnCaissons(base: CadDocument, planId: string): { doc: CadDocument; problems: string[] } {
  let doc = base;
  const problems: string[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const plan = kitchenPlanIn(doc, planId);
    const runs = Object.entries(plan?.runs ?? {});
    const found = runs.flatMap(([run, items]) => items.filter((i) => i.own?.caisson).map((i) => ({ run, item: i })))[0];
    if (!plan || !found) break;
    const cabinet = runCabinets(doc, planId, found.run).find((x) => x.item === found.item.id)?.cabinet;
    const made = cabinet ? withCabinetFurnished(doc, cabinet, found.item.own!.caisson) : null;
    if (made && typeof made !== "string") {
      doc = made.doc;
      continue;
    }
    // It could not be made: a plain unit of its size.
    problems.push(`${found.item.own!.name} : ${typeof made === "string" ? made : "pas de place pour lui."}`);
    const { caisson: _gone, ...own } = found.item.own!;
    const built = withKitchenBuilt(doc, planId, { runs: { ...plan.runs, [found.run]: plan.runs![found.run]!.map((i) => (i === found.item ? { ...i, own } : i)) } });
    if (typeof built === "string") break;
    doc = built.doc;
  }
  return { doc, problems };
}
