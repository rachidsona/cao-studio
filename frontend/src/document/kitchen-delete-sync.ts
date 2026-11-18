/**
 * Ce qu'on supprime dans la 3D quitte aussi le Plan de cuisine, dans la même annulation. Un meuble qu'un linéaire a
 * fait, supprimé (avec ses façades) : sa place devient un « Espace libre » de sa largeur — il ne revient pas quand la
 * cuisine est refaite, ses voisins ne bougent pas, et un autre meuble peut prendre cette place
 * (features/kitchen-run-items.ts). Un caisson aménagé dont on supprime les panneaux disparaît en entier, son esquisse
 * avec ; la place qu'il tenait redevient libre. Un fileur du linéaire supprimé (posé à la main, ou celui que le plan met
 * dans le reste) laisse aussi sa place libre, sans fileur. Une plinthe supprimée : son linéaire n'en a plus. Toute la cuisine supprimée d'un coup n'est pas refaite. Pur.
 */
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { runCabinets } from "./kitchen-plan-add";
import { deleteFeatures, findFeature, updateFeature } from "./operations";
import type { CabinetFeature, CadDocument, KitchenRunItem } from "./types";
import { FILLER, isFiller, itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";
import { gapsAsItems } from "../features/kitchen-run-gaps";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { isPartition } from "../sketcher/partition-history";

const boards = (doc: CadDocument, sketch: string) => doc.features.some((f) => f.type === "extrude" && f.sketch === sketch);

/**
 * The fillers of the runs among what was deleted, by their names as the plan gives them (kitchen-plan-build.ts): one
 * put by hand, « Fileur posé (haut) A2 » — the 2nd of the run's —, or one of the rest, « Fileur A2 ». The corners'
 * fillers are made again with their corner.
 */
function deletedFillers(prev: CadDocument, made: Record<string, string[]>, deleted: string[]): { id: string; run: string; hand: boolean; n: number }[] {
  return Object.entries(made).flatMap(([run, ids]) => ids.filter((id) => deleted.includes(id)).flatMap((id) => {
    const f = findFeature(prev, id);
    const m = f?.type === "extrude" ? /^Fileur (posé (?:haut )?)?([A-Z]+)(\d*)$/.exec(f.name) : null;
    return m && m[2] === run ? [{ id, run, hand: !!m[1], n: Number(m[3] || 1) }] : [];
  }));
}

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
    const fillers = deletedFillers(prev, plan.made ?? {}, deleted);
    // A run's plinth deleted (any piece of it): that run has none, until it is put back on its strip.
    const kicks = Object.entries(plan.made ?? {}).flatMap(([run, ids]) => ids.filter((id) => deleted.includes(id) && /^Plinthe /.test(findFeature(prev, id)?.name ?? "")).map((id) => ({ id, run })));
    const noKick = kicks.length ? { ...plan.noKick, ...Object.fromEntries(kicks.map((k) => [k.run, true])) } : undefined;
    // Only units (their fronts go with them) and fillers: with a worktop or a wall deleted too, the kitchen is being taken away.
    const only = deleted.every((id) => {
      const f = findFeature(prev, id);
      return units.has(id) || fillers.some((x) => x.id === id) || kicks.some((x) => x.id === id) || (f?.type === "fronts" && units.has(f.cabinet));
    });
    if (fillers.length && only) {
      const fills = kitchenFromPlan(plan, kitchenRoomInfo(prev, plan)).fills;
      for (const run of new Set(fillers.map((x) => x.run))) {
        const fill = fills[run];
        if (!fill) continue;
        const gone = fillers.filter((x) => x.run === run);
        // Put by hand: its place kept free. Of the rest: all the rest's fillers made items, those deleted kept free.
        const hand = fill.placed.filter((pl) => isFiller(pl.item));
        let items = (runs[run] ?? []).map((i) => {
          const k = hand.findIndex((pl) => pl.item.id === i.id);
          return gone.some((x) => x.hand && x.n === k + 1) ? { ...i, model: rowOf(itemEntry(i)) === "wall" ? SPACE_WALL : SPACE } : i;
        });
        const auto = new Set(gone.filter((x) => !x.hand).map((x) => x.n - 1));
        if (auto.size) items = gapsAsItems(items, fill, (k) => (auto.has(k) ? SPACE : FILLER)).items;
        runs[run] = items;
        freed = true;
      }
    }
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
    if (freed || (noKick && only)) {
      const built = withKitchenBuilt(doc, sketch.id, { runs, ...(noKick && only ? { noKick } : {}) });
      if (typeof built !== "string") doc = built.doc;
    } else if (emptied.length) {
      // Its room, free again (kitchenPlanIn no longer sees it held).
      const free = kitchenPlanIn(doc, sketch.id)?.runs;
      doc = updateFeature(doc, sketch.id, (f) => (f.type === "sketch" && f.kitchenPlan ? { ...f, kitchenPlan: { ...f.kitchenPlan, ...(free ? { runs: free } : {}) } } : f));
    }
  }
  return doc;
}

/** The caisson furnished by hand on `sketch` deleted from the plan's strip, as in the 3D: whole, its room free again. */
export function withCaissonRemoved(doc: CadDocument, sketch: string): CadDocument {
  const panels = doc.features.filter((f) => (f.type === "extrude" || f.type === "niche") && f.sketch === sketch).map((f) => f.id);
  return withDeletedFreed(doc, deleteFeatures(doc, panels.length ? panels : [sketch]).next);
}
