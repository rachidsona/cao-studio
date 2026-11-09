/**
 * Un caisson de cuisine aménagé à la main : il devient un caisson comme ceux du dressing, une « Répartition » de mêmes
 * cotes, à la même place, avec son fond, ses étagères et ses façades (portes ou tiroirs). Étagères, Cloisons, Niche,
 * Tiroirs, Penderie et Portes y marchent alors comme dans un dressing. S'il venait d'un linéaire du Plan de cuisine, le
 * linéaire lui garde sa place (un « Espace libre » de sa largeur) : la cuisine refaite ne le touche plus. Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { kitchenPlanIn, kitchenRunOf, withKitchenBuilt } from "./kitchen-floor";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { syncPartitionDoors } from "./partition-doors";
import { withEquipment } from "./equipment";
import { bodyOrigin, deleteFeatures, findFeature, uniqueId, uniqueOffsetId } from "./operations";
import { emptySketchGeometry, type PartitionParams, type SketchGeometry } from "./sketch";
import { withSketchExtrusion } from "./sketch-extrusion";
import { featureOfBody, PART_SEPARATOR, type CabinetFeature, type CadDocument, type FrontsFeature, type NicheFeature, type PlaneFrame, type SketchFeature, type Vec3 } from "./types";
import { itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";
import { nichePartsIn } from "../features/niche-parts";
import { nearestPlane } from "../sketcher/frame";
import { extrusionGroups, leafNiches, partitionRecord, rebuildChain, shelvesRecord } from "../sketcher/partition-history";

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
  const cabinets = (plan.made?.[owner.run] ?? []).filter((id) => findFeature(doc, id)?.type === "cabinet");
  const units = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).units.filter((u) => u.run === owner.run);
  const unit = cabinets.length === units.length ? units[cabinets.indexOf(c.id)] : undefined;
  const items = plan.runs?.[owner.run] ?? [];
  const item = items.find((i) => i.id === unit?.item);
  if (!unit || !item) return unit?.corner ? "Un meuble d'angle ne s'aménage pas ainsi : choisissez un autre meuble du linéaire." : "Ce meuble n'est plus retrouvé dans son linéaire : refaites la cuisine, puis réessayez.";
  const space = { ...newItem(items, rowOf(itemEntry(item)) === "wall" ? SPACE_WALL : SPACE, unit.width), id: item.id };
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

/**
 * The cabinet made a Répartition of the same size and place, with its back, its shelves and its fronts; its run, if a
 * plan made it, keeping its place. The sketch of the new caisson, and what did not follow.
 */
export function withCabinetFurnished(doc: CadDocument, cabinetId: string): { doc: CadDocument; sketch: string; notes: string[] } | string {
  const c = findFeature(doc, cabinetId);
  if (c?.type !== "cabinet") return "Ce caisson n'existe plus.";
  const fronts = doc.features.filter((f): f is FrontsFeature => f.type === "fronts" && f.cabinet === c.id);
  const carcass = doc.bodyInfo?.[`${c.id}${PART_SEPARATOR}0`]?.material ?? "melamine-white";
  const facing = fronts.length ? doc.bodyInfo?.[`${fronts[0]!.id}${PART_SEPARATOR}0`]?.material : undefined;
  const notes: string[] = [];
  const freed = freedFromPlan(doc, c);
  if (typeof freed === "string") return freed;
  // Made again, the kitchen no longer has it (its ids now another's); otherwise it goes with its fronts.
  let next = freed ?? deleteFeatures(doc, [c.id, ...fronts.map((f) => f.id)]).next;

  const back = c.back === "none" ? 0 : c.backThickness;
  const input: PartitionParams = {
    length: c.width, height: c.height, thickness: c.thickness, cases: 2, dividers: ["none"], boards: true, plinth: c.plinth,
    outer: c.construction === "sides-through" ? "side" : "board", single: "board", double: "side",
  };
  const depth = c.depth - back;
  const step = uniqueOffsetId(next);
  const record = partitionRecord(step, `Répartition — ${c.name}`, input, [0, 0], depth);
  const layout = fronts[0]?.layout;
  const made = record.step;
  if (made?.kind === "partition") {
    if (back > 0) made.back = { thickness: back, split: "whole" };
    if (layout === "door" || layout === "doors") {
      made.doors = { gap: fronts[0]!.gap, thickness: fronts[0]!.thickness, handles: fronts[0]!.handles, ...(layout === "door" ? { joined: [0], ...(fronts[0]!.side === "right" ? { hinges: ["right" as const] } : {}) } : {}) };
    }
  }
  const offsets = [record];
  if (c.shelves > 0) offsets.push(shelvesRecord(`${step}e`, "Étagères", step, [0], { count: c.shelves, thickness: c.thickness, mode: "equal", fixed: 0 }, depth));
  const rebuilt = rebuildChain({ ...emptySketchGeometry(), offsets }, step);
  if (typeof rebuilt === "string") return rebuilt;
  const placed = panelsFrame(c, back);
  const sketch = uniqueId(next, "sk");
  const feature: SketchFeature = { id: sketch, type: "sketch", name: `Caisson — ${c.name}`, plane: nearestPlane(placed.normal), offset: 0, frame: placed, ...emptySketchGeometry() };
  const known = new Set(next.features.map((f) => f.id));
  next = withSketchExtrusion({ ...next, features: [...next.features, feature] }, sketch, rebuilt.geometry as SketchGeometry, { groups: extrusionGroups([], rebuilt) });
  next = syncPartitionDoors(next, sketch);

  // Drawers: in its one niche, as many as it had.
  if (layout === "drawers") {
    const niche = leafNiches(rebuilt.geometry as SketchGeometry)[0];
    if (niche && c.shelves === 0) {
      const f = fronts[0]!;
      const drawers: NicheFeature = {
        id: uniqueId(next, "nc"), type: "niche", name: "Tiroirs", sketch, partition: niche.partition, niche: [...niche.path], fill: "drawers",
        diameter: 25, drop: 60, drawers: f.drawers, gap: f.gap, bottomGap: f.gap, betweenGap: f.gap, sideGap: f.gap, thickness: f.thickness, handles: f.handles,
      };
      next = withEquipment(next, [drawers]);
    } else notes.push("Ses tiroirs sont à reposer (Tiroirs).");
  }
  // Its looks: the carcass in its material, the fronts in theirs.
  const info = { ...next.bodyInfo };
  for (const f of next.features) {
    if (known.has(f.id)) continue;
    if (f.type === "extrude") info[f.id] = { ...info[f.id], material: carcass };
    if (f.type === "niche" && facing) nichePartsIn(next.features, f).forEach((p, i) => p.role === "front" && (info[`${f.id}${PART_SEPARATOR}${i}`] = { ...info[`${f.id}${PART_SEPARATOR}${i}`], material: facing }));
  }
  if (c.top === "rails") notes.push("Son dessus est maintenant un panneau plein : pour un évier, découpez-le ou ôtez-le.");
  return { doc: { ...next, bodyInfo: info }, sketch, notes };
}
