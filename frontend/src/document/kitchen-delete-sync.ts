/**
 * Ce qu'on supprime dans la 3D quitte aussi le Plan de cuisine, dans la même annulation. Un meuble qu'un linéaire a
 * fait, supprimé (avec ses façades) : sa place devient un « Espace libre » de sa largeur — il ne revient pas quand la
 * cuisine est refaite, ses voisins ne bougent pas, et un autre meuble peut prendre cette place
 * (features/kitchen-run-items.ts). Un caisson aménagé dont on supprime les panneaux disparaît en entier, son esquisse
 * avec ; la place qu'il tenait redevient libre. Un fileur du linéaire supprimé (posé à la main, ou celui que le plan met
 * dans le reste) laisse aussi sa place libre, sans fileur. Une plinthe supprimée : son linéaire n'en a plus. Un meuble
 * d'angle supprimé : son angle n'en a plus (angle mort, rien en haut). Des murs supprimés : le plan n'en dessine plus.
 * Supprimés avec d'autres pièces de la cuisine (un plan de travail, un mur), le plan les oublie aussi, sans rien refaire. Pur.
 */
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { planUnitCabinet, runCabinets } from "./kitchen-plan-add";
import { deleteFeatures, findFeature, updateFeature } from "./operations";
import type { CabinetFeature, CadDocument, KitchenFloorPlan, KitchenRunItem } from "./types";
import { FILLER, isFiller, isSpace, itemEntry, newItem, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";
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
    // A piece of a unit made of several (a side or the fridge of a fridge's surround): the whole unit goes, as one.
    const pieces = deleted.filter((id) => findFeature(prev, id)?.type !== "cabinet" && planUnitCabinet(prev, id));
    const units = new Set([...deleted.filter((id) => findFeature(prev, id)?.type === "cabinet"), ...pieces.map((id) => planUnitCabinet(prev, id)!)]);
    const fillers = deletedFillers(prev, plan.made ?? {}, deleted);
    // A run's plinth deleted (any piece of it): that run has none, until it is put back on its strip.
    const kicks = Object.entries(plan.made ?? {}).flatMap(([run, ids]) => ids.filter((id) => deleted.includes(id) && /^Plinthe /.test(findFeature(prev, id)?.name ?? "")).map((id) => ({ id, run })));
    const noKick = kicks.length ? { ...plan.noKick, ...Object.fromEntries(kicks.map((k) => [k.run, true])) } : undefined;
    // Only units (their fronts go with them) and fillers: with a worktop or a wall deleted too, the kitchen is being taken away.
    const only = deleted.every((id) => {
      const f = findFeature(prev, id);
      return units.has(id) || pieces.includes(id) || fillers.some((x) => x.id === id) || kicks.some((x) => x.id === id) || (f?.type === "fronts" && units.has(f.cabinet));
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
    // A corner unit deleted: that corner has none any more (a dead corner low, nothing up).
    let corners: Pick<KitchenFloorPlan, "corners" | "wallCorners"> = {};
    if (units.size) {
      const built = kitchenFromPlan(plan, kitchenRoomInfo(prev, plan)).units;
      for (const [run, ids] of Object.entries(plan.made ?? {})) {
        const cabinets = ids.filter((id) => findFeature(prev, id)?.type === "cabinet");
        const own = built.filter((u) => u.run === run);
        if (own.length !== cabinets.length) continue;
        cabinets.forEach((id, i) => {
          const edit = own[i]!.cornerEdit;
          if (!units.has(id) || !edit) return;
          if (edit.key.startsWith("wall")) corners = { ...corners, wallCorners: { ...plan.wallCorners, ...corners.wallCorners, [edit.joint]: "none" } };
          else corners = { ...corners, corners: { ...plan.corners, ...corners.corners, [edit.joint]: "dead" } };
        });
      }
    }
    // The kitchen's walls deleted: it draws none any more.
    const walls = deleted.some((id) => /^Mur [A-Z]+$/.test(findFeature(prev, id)?.name ?? "")) ? { noWalls: true } : {};
    if (units.size) {
      for (const [run, ids] of Object.entries(plan.made ?? {})) {
        if (!ids.some((id) => units.has(id))) continue;
        const pairs = runCabinets(prev, sketch.id, run);
        for (const id of ids.filter((x) => units.has(x))) {
          const items = runs[run] ?? [];
          const item = items.find((i) => i.id === pairs.find((x) => x.cabinet === id)?.item);
          // A corner unit is no unit of the run: its corner is set above.
          if (!item) continue;
          const c = findFeature(prev, id) as CabinetFeature;
          const wall = rowOf(itemEntry(item)) === "wall";
          runs[run] = items.map((i) => (i === item ? { ...newItem(items, wall ? SPACE_WALL : SPACE, item.width), id: item.id, depth: c.depth, ...(wall ? { height: c.height } : {}) } : i));
          freed = true;
        }
      }
    }
    // A run with nothing left of what it made (the kitchen taken away): all its units and appliances leave it, and its
    // corner units — whatever the plan would lay out today (its sizes may have changed since it was made).
    for (const [run, ids] of Object.entries(plan.made ?? {})) {
      if (!ids.some((id) => deleted.includes(id)) || ids.some((id) => findFeature(doc, id))) continue;
      const items = runs[run] ?? [];
      const emptied = items.map((i) => (isSpace(i) || i.furnished ? i : { ...newItem(items, rowOf(itemEntry(i)) === "wall" ? SPACE_WALL : SPACE, i.width), id: i.id }));
      if (emptied.some((i, k) => i !== items[k])) [runs[run], freed] = [emptied, true];
      for (const u of kitchenFromPlan(plan, kitchenRoomInfo(prev, plan)).units) {
        if (u.run !== run || !u.cornerEdit) continue;
        if (u.cornerEdit.key.startsWith("wall")) corners = { ...corners, wallCorners: { ...plan.wallCorners, ...corners.wallCorners, [u.cornerEdit.joint]: "none" } };
        else corners = { ...corners, corners: { ...plan.corners, ...corners.corners, [u.cornerEdit.joint]: "dead" } };
      }
    }
    // A furnished caisson with no panel left (they were there before): its sketch and what is left on it go too.
    const emptied = Object.values(sketch.kitchenPlan.runs ?? {}).flat().flatMap((i) => {
      const held = i.furnished ? findFeature(doc, i.furnished) : undefined;
      return held?.type === "sketch" && (held.offsets ?? []).some(isPartition) && !boards(doc, held.id) && boards(prev, held.id) ? [held.id] : [];
    });
    if (emptied.length) doc = deleteFeatures(doc, emptied).next;
    const changed = freed || Object.keys(corners).length > 0 || "noWalls" in walls;
    if (only && (changed || noKick)) {
      const built = withKitchenBuilt(doc, sketch.id, { runs, ...corners, ...walls, ...(noKick ? { noKick } : {}) });
      if (typeof built !== "string") doc = built.doc;
    } else if (changed || noKick) {
      // Taken away with other pieces of it (a worktop, a wall): the plan follows, nothing is made again.
      const made = Object.fromEntries(Object.entries(plan.made ?? {}).map(([run, ids]) => [run, ids.filter((id) => findFeature(doc, id))]));
      doc = updateFeature(doc, sketch.id, (f) => (f.type === "sketch" && f.kitchenPlan ? { ...f, kitchenPlan: { ...f.kitchenPlan, runs, ...corners, ...walls, ...(noKick ? { noKick } : {}), made } } : f));
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
