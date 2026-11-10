/**
 * Ce qu'on supprime dans la 3D quitte aussi le Plan de cuisine, dans la même annulation. Un meuble qu'un linéaire a
 * fait, supprimé (avec ses façades) : sa place devient un « Espace libre » de sa largeur — il ne revient pas quand la
 * cuisine est refaite, ses voisins ne bougent pas, et un autre meuble peut prendre cette place
 * (features/kitchen-run-items.ts). Un caisson aménagé dont on supprime les panneaux disparaît en entier, son esquisse
 * avec ; la place qu'il tenait redevient libre. Toute la cuisine supprimée d'un coup n'est pas refaite. Pur.
 */
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { runCabinets } from "./kitchen-plan-add";
import { deleteFeatures, findFeature, updateFeature } from "./operations";
import type { CabinetFeature, CadDocument, KitchenRunItem } from "./types";
import { itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";
import { isPartition } from "../sketcher/partition-history";

const boards = (doc: CadDocument, sketch: string) => doc.features.some((f) => f.type === "extrude" && f.sketch === sketch);

/** `next` with the kitchen plans rid of what was deleted in the 3D since `prev` (none: `next` itself). */
export function withDeletedFreed(prev: CadDocument, next: CadDocument): CadDocument {
  let doc = next;
  for (const sketch of next.features) {
    if (sketch.type !== "sketch" || !sketch.kitchenPlan || !findFeature(prev, sketch.id)) continue;
    const plan = kitchenPlanIn(doc, sketch.id);
    if (!plan) continue;
    const runs: Record<string, KitchenRunItem[]> = { ...plan.runs };
    let freed = false;
    const made = Object.values(plan.made ?? {}).flat();
    const deleted = made.filter((id) => !findFeature(doc, id) && findFeature(prev, id));
    const units = new Set(deleted.filter((id) => findFeature(prev, id)?.type === "cabinet"));
    // Only units (their fronts go with them): with a worktop or a wall deleted too, the kitchen is being taken away.
    const only = deleted.every((id) => {
      const f = findFeature(prev, id);
      return units.has(id) || (f?.type === "fronts" && units.has(f.cabinet));
    });
    if (units.size && only) {
      for (const [run, ids] of Object.entries(plan.made ?? {})) {
        if (!ids.some((id) => units.has(id))) continue;
        const pairs = runCabinets(prev, sketch.id, run);
        for (const id of ids.filter((x) => units.has(x))) {
          const items = runs[run] ?? [];
          const item = items.find((i) => i.id === pairs.find((x) => x.cabinet === id)?.item);
          // A corner unit is no unit of the run: it is made again with it.
          if (!item) continue;
          const c = findFeature(prev, id) as CabinetFeature;
          const wall = rowOf(itemEntry(item)) === "wall";
          runs[run] = items.map((i) => (i === item ? { ...newItem(items, wall ? SPACE_WALL : SPACE, item.width), id: item.id, depth: c.depth, ...(wall ? { height: c.height } : {}) } : i));
          freed = true;
        }
      }
    }
    // A furnished caisson with no panel left (they were there before): its sketch and what is left on it go too.
    const emptied = Object.values(sketch.kitchenPlan.runs ?? {}).flat().flatMap((i) => {
      const held = i.furnished ? findFeature(doc, i.furnished) : undefined;
      return held?.type === "sketch" && (held.offsets ?? []).some(isPartition) && !boards(doc, held.id) && boards(prev, held.id) ? [held.id] : [];
    });
    if (emptied.length) doc = deleteFeatures(doc, emptied).next;
    if (freed) {
      const built = withKitchenBuilt(doc, sketch.id, { runs });
      if (typeof built !== "string") doc = built.doc;
    } else if (emptied.length) {
      // Its room, free again (kitchenPlanIn no longer sees it held).
      const free = kitchenPlanIn(doc, sketch.id)?.runs;
      doc = updateFeature(doc, sketch.id, (f) => (f.type === "sketch" && f.kitchenPlan ? { ...f, kitchenPlan: { ...f.kitchenPlan, ...(free ? { runs: free } : {}) } } : f));
    }
  }
  return doc;
}
