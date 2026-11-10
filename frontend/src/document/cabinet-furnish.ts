/**
 * Un caisson de cuisine aménagé à la main : il devient un caisson comme ceux du dressing, une « Répartition » de mêmes
 * cotes, à la même place, avec son fond, ses étagères et ses façades (portes ou tiroirs) — ou, venu de « Mes caissons »,
 * celui qu'on avait gardé, à sa largeur. Étagères, Cloisons, Niche, Tiroirs, Penderie et Portes y marchent alors comme
 * dans un dressing. S'il venait d'un linéaire du Plan de cuisine, le linéaire lui garde sa place (un « Espace libre »
 * de sa largeur) : la cuisine refaite ne le touche plus. Pur.
 */
import { withCaissonPlaced, type CaissonSpec } from "./caisson-spec";
import { cabinetAxes } from "./kitchen-catalog";
import { kitchenPlanIn, kitchenRunOf, withKitchenBuilt } from "./kitchen-floor";
import { runCabinets } from "./kitchen-plan-add";
import type { NicheRecipe } from "./niche-recipe";
import { bodyOrigin, deleteFeatures, findFeature } from "./operations";
import { featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type PlaneFrame, type Vec3 } from "./types";
import { itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";

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

/** The cabinet's place in its run turned into a space of its width, the kitchen made again without it; null if no plan made it. */
function freedFromPlan(doc: CadDocument, c: CabinetFeature): CadDocument | string | null {
  const owner = kitchenRunOf(doc, c.id);
  const plan = owner && kitchenPlanIn(doc, owner.plan);
  if (!owner || !plan) return null;
  const items = plan.runs?.[owner.run] ?? [];
  const itemId = runCabinets(doc, owner.plan, owner.run).find((x) => x.cabinet === c.id)?.item;
  const item = items.find((i) => i.id === itemId);
  if (!item) return itemId === undefined && (plan.made?.[owner.run] ?? []).includes(c.id) ? "Un meuble d'angle ne s'aménage pas ainsi : choisissez un autre meuble du linéaire." : "Ce meuble n'est plus retrouvé dans son linéaire : refaites la cuisine, puis réessayez.";
  const space = { ...newItem(items, rowOf(itemEntry(item)) === "wall" ? SPACE_WALL : SPACE, c.width), id: item.id };
  const built = withKitchenBuilt(doc, owner.plan, { runs: { ...plan.runs, [owner.run]: items.map((i) => (i === item ? space : i)) } });
  return typeof built === "string" ? built : built.doc;
}

/**
 * The frame of the caisson's panels: on the cabinet's back less its back panel's thickness, at the cabinet's bottom; x
 * along its width, y up, the front towards the normal.
 */
function panelsFrame(c: CabinetFeature, back: number): PlaneFrame {
  const { along, back: inwards } = cabinetAxes(c.rotation ?? 0);
  const set = c.depth - back;
  const origin: Vec3 = [c.origin[0] + inwards[0] * set, c.origin[1] + inwards[1] * set, c.origin[2]];
  return { origin, xDir: [along[0], along[1], 0], normal: [-inwards[0], -inwards[1], 0] };
}

/** The caisson a kitchen cabinet is: its carcass, its back, its shelves, its doors or its drawers, their materials. */
function cabinetSpec(doc: CadDocument, c: CabinetFeature, fronts: FrontsFeature | undefined): CaissonSpec {
  const back = c.back === "none" ? 0 : c.backThickness;
  const inside: NicheRecipe = { steps: c.shelves > 0 ? [{ at: [], input: { count: c.shelves, thickness: c.thickness, mode: "equal", fixed: 0 } }] : [], equipment: [] };
  if (fronts?.layout === "drawers" && c.shelves === 0) {
    const { gap, drawers, thickness, handles } = fronts;
    inside.equipment.push({ at: [], title: "Tiroirs", feature: { type: "niche", fill: "drawers", diameter: 25, drop: 60, drawers, gap, bottomGap: gap, betweenGap: gap, sideGap: gap, thickness, handles } });
  }
  const pair = fronts?.layout === "doors";
  const carcass = doc.bodyInfo?.[`${c.id}${PART_SEPARATOR}0`]?.material ?? "melamine-white";
  const facing = fronts ? doc.bodyInfo?.[`${fronts.id}${PART_SEPARATOR}0`]?.material : undefined;
  return {
    input: { length: c.width, height: c.height, thickness: c.thickness, cases: 2, dividers: ["none"], boards: true, plinth: c.plinth, outer: c.construction === "sides-through" ? "side" : "board", single: "board", double: "side" },
    depth: c.depth - back,
    ...(back > 0 ? { back: { thickness: back, split: "whole" as const } } : {}),
    ...(fronts && fronts.layout !== "drawers" ? { doors: { gap: fronts.gap, thickness: fronts.thickness, handles: fronts.handles, ...(pair ? {} : { joined: [0], ...(fronts.side === "right" ? { hinges: ["right" as const] } : {}) }) } } : {}),
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
  if (!spec && c.top === "rails") notes.push("Son dessus est maintenant un panneau plein : pour un évier, découpez-le ou ôtez-le.");
  const freed = freedFromPlan(doc, c);
  if (typeof freed === "string") return freed;
  // Made again, the kitchen no longer has it (its ids now another's); otherwise it goes with its fronts.
  const next = freed ?? deleteFeatures(doc, [c.id, ...fronts.map((f) => f.id)]).next;
  const placed = withCaissonPlaced(next, made, { frame: panelsFrame(c, c.depth - made.depth), width: c.width, height: c.height, name: `Caisson — ${spec ? c.name.replace(/\s*\([A-Z]\d+\)$/, "") : c.name}` });
  return typeof placed === "string" ? placed : { ...placed, notes };
}

/** Each unit of the plan's runs that is one of « Mes caissons » made that caisson, in its place. */
export function withCaissonsPlaced(base: CadDocument, planId: string): { doc: CadDocument; problems: string[] } {
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
