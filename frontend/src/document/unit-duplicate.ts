/**
 * « Dupliquer » un meuble de cuisine dans la 3D. Un meuble d'un linéaire du Plan de cuisine : le même est ajouté juste
 * après lui sur son linéaire, s'il y tient, et la cuisine est refaite ; un caisson posé à part (Meubles de cuisine,
 * Caisson) : sa copie, avec ses façades et ses matières, à côté de lui, à sa droite. Une seule annulation. Pur.
 */
import { cabinetAxes } from "./kitchen-catalog";
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { planItemOf, runCabinets } from "./kitchen-plan-add";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { findFeature, uniqueId, uniqueName } from "./operations";
import { featureOfBody, type CabinetFeature, type CadDocument, type FrontsFeature, type Vec3 } from "./types";
import { insertItem, itemEntry, newItem, rowOf, widestRoom } from "../features/kitchen-run-items";

const cm = (mm: number) => `${Number((mm / 10).toFixed(1)).toLocaleString("fr-FR")} cm`;

/** The document with this cabinet duplicated, the copy's cabinet, and what to say; a string: why it cannot be. */
export function withCabinetDuplicated(doc: CadDocument, cabinetId: string): { doc: CadDocument; cabinet: string | null; note: string } | string {
  const c = findFeature(doc, cabinetId);
  if (c?.type !== "cabinet") return "Sélectionnez d'abord un caisson à dupliquer.";
  const owner = planItemOf(doc, cabinetId);
  const plan = owner && kitchenPlanIn(doc, owner.plan);
  if (owner && plan) {
    const items = plan.runs?.[owner.run] ?? [];
    const item = items.find((i) => i.id === owner.item);
    if (!item) return "Ce meuble n'est plus retrouvé dans son linéaire.";
    const { furnished: _held, ...same } = item;
    const copy = { ...same, id: newItem(items, item.model, item.width).id };
    const next = { ...plan, runs: { ...plan.runs, [owner.run]: insertItem(items, copy, item.id) } };
    // No room for one more on its run (it would not stand, or push out one that does): said, with the room left.
    const before = kitchenFromPlan(plan, kitchenRoomInfo(doc, plan)).fills[owner.run];
    const stood = new Set(before?.missing.map((m) => m.id));
    const fill = kitchenFromPlan(next, kitchenRoomInfo(doc, next)).fills[owner.run];
    if (before && fill?.missing.some((m) => !stood.has(m.id))) {
      const row = rowOf(itemEntry(item));
      const room = widestRoom(before, row);
      return `Pas de place pour un autre « ${itemEntry(item).name} » de ${cm(item.width)} sur ce linéaire : ${room >= 1 ? `il reste ${cm(Math.floor(room))} au plus` : `${row === "wall" ? "le haut" : "le bas"} est plein`}.`;
    }
    const built = withKitchenBuilt(doc, owner.plan, { runs: next.runs });
    if (typeof built === "string") return built;
    return { doc: built.doc, cabinet: runCabinets(built.doc, owner.plan, owner.run).find((x) => x.item === copy.id)?.cabinet ?? null, note: `« ${itemEntry(item).name} » dupliqué sur son linéaire, juste après lui.` };
  }
  // On its own: its copy at its right, its fronts and its materials with it.
  const { along } = cabinetAxes(c.rotation ?? 0);
  const id = uniqueId(doc, "cb");
  const copy: CabinetFeature = { ...structuredClone(c), id, name: uniqueName(doc, c.name), origin: [c.origin[0] + along[0] * c.width, c.origin[1] + along[1] * c.width, c.origin[2]] as Vec3 };
  let next: CadDocument = { ...doc, features: [...doc.features, copy] };
  const renamed = new Map([[c.id, id]]);
  for (const f of doc.features.filter((x): x is FrontsFeature => x.type === "fronts" && x.cabinet === c.id)) {
    const fid = uniqueId(next, f.id.replace(/\d+$/, "") || "fr");
    renamed.set(f.id, fid);
    next = { ...next, features: [...next.features, { ...structuredClone(f), id: fid, name: uniqueName(next, f.name), cabinet: id }] };
  }
  // What is known of its pieces (material, grain, bands, look) goes with their copies.
  const carried = <T>(record: Record<string, T> | undefined) => Object.fromEntries(Object.entries(record ?? {}).flatMap(([key, value]) => {
    const to = renamed.get(featureOfBody(key));
    return to ? [[to + key.slice(featureOfBody(key).length), structuredClone(value)] as const] : [];
  }));
  next = { ...next, bodyInfo: { ...next.bodyInfo, ...carried(doc.bodyInfo) } };
  return { doc: next, cabinet: id, note: `« ${c.name} » dupliqué : sa copie est à sa droite, prête à être déplacée.` };
}
