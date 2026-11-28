/**
 * Un caisson en Répartition que son linéaire n'a plus la place de tenir là où ses meubles le mettent (un meuble
 * ajouté ou élargi avant lui l'a poussé au-delà du bout) n'est plus bâti par le plan : son plan de travail et sa
 * plinthe ne le suivent plus, il ne se glisse plus. Il retrouve ici sa place là où il est dans la 3D, quand cet
 * endroit est libre sur son mur : prise sur les places gardées libres et le reste qui s'y trouvent, rien d'autre ne bouge.
 */
import { panelsFrame, partitionOf, placed, standing } from "./caisson-follow";
import { kitchenFromPlan, type KitchenRoomInfo } from "./kitchen-plan-build";
import { kitchenRuns, type KitchenRun } from "./kitchen-plan-shapes";
import { findFeature } from "./operations";
import type { CadDocument, KitchenFloorPlan, KitchenRunItem, SketchFeature } from "./types";
import { insertItem, itemEntry, newItem, openRoom, rowOf, SPACE, SPACE_WALL } from "../features/kitchen-run-items";

/** The caissons of the plan its runs have no room for (the items that keep their rooms). */
export function lostCaissons(plan: KitchenFloorPlan, room: KitchenRoomInfo | undefined): { run: KitchenRun; item: KitchenRunItem }[] {
  const fills = kitchenFromPlan(plan, room).fills;
  return kitchenRuns(plan).flatMap((run) => (fills[run.id]?.missing ?? []).filter((i) => i.furnished).map((item) => ({ run, item })));
}

/** The plan with each caisson it lost given back its room where it stands in the 3D, when that place is free on its wall. */
export function withLostCaissonsBack(doc: CadDocument, given: KitchenFloorPlan, room0: KitchenRoomInfo | undefined): KitchenFloorPlan {
  let plan = given;
  for (const { run, item: lost } of lostCaissons(given, room0)) {
    let item = lost;
    const sketch = findFeature(doc, item.furnished!);
    const record = sketch?.type === "sketch" ? partitionOf(sketch as SketchFeature) : undefined;
    if (sketch?.type !== "sketch" || !sketch.frame || !record) continue;
    const fillOf = (items: readonly KitchenRunItem[]) => kitchenFromPlan({ ...plan, runs: { ...plan.runs, [run.id]: [...items] } }, room0);
    // Where it would stand alone on its run: from there, how far along the run it is in the 3D.
    const alone = fillOf([item]);
    const [unit, first] = [alone.kept.find((u) => u.run === run.id && u.item === item.id), alone.fills[run.id]?.spaces.find((p) => p.item.id === item.id)];
    if (!unit || !first) continue;
    // As wide as it is in the 3D: its room had been given a width it could not take there.
    const real = Math.round((item.width + record.step.input.length - unit.width) * 10) / 10;
    if (Math.abs(real - item.width) >= 0.5 && real >= 1) item = { ...item, width: real };
    const there = panelsFrame(placed(plan, unit), record.step.depth!);
    const delta = standing(sketch as SketchFeature).origin.map((v, k) => v - there.origin[k]!);
    const d = delta.reduce((sum, v, k) => sum + v * there.xDir[k]!, 0);
    // Off its wall, or turned: no place on the run says where it is.
    if (delta.some((v, k) => Math.abs(v - d * there.xDir[k]!) > 2) || there.normal.some((v, k) => Math.abs(v - sketch.frame!.normal[k]!) > 1e-3)) continue;
    const at = first.at + d;
    // The free room it stands in (rooms kept free and the rest, side by side): the rooms kept there give way to it —
    // one before it, one after it for what they kept beyond it —, nothing else moves.
    const others = (plan.runs?.[run.id] ?? []).filter((i) => i.id !== item.id);
    const row = rowOf(itemEntry(item));
    const fill = fillOf(others).fills[run.id];
    const stretch = fill && openRoom(fill, row).find(([a, b]) => a <= at + 1 && b >= at + item.width - 1);
    if (!fill || !stretch) continue;
    const rooms = fill.spaces.filter((p) => !p.item.furnished && p.row === row && p.at >= stretch[0] - 1 && p.at + p.item.width <= stretch[1] + 1).sort((x, y) => x.at - y.at);
    const kept = rooms.length ? rooms.at(-1)!.at + rooms.at(-1)!.item.width : stretch[0];
    const room = (list: readonly KitchenRunItem[], width: number): KitchenRunItem[] => (width >= 1 ? [newItem(list, row === "wall" ? SPACE_WALL : SPACE, Math.round(width * 10) / 10)] : []);
    const gone = new Set(rooms.map((p) => p.item.id));
    const rest = others.filter((i) => !gone.has(i.id));
    const lead = room(rest, at - (rooms.length ? rooms[0]!.at : stretch[0]));
    const trail = room([...rest, ...lead], kept - (at + item.width));
    const k = rooms.length ? others.findIndex((i) => i.id === rooms[0]!.item.id) - others.slice(0, others.findIndex((i) => i.id === rooms[0]!.item.id)).filter((i) => gone.has(i.id)).length : -1;
    const put = k >= 0 ? [...rest.slice(0, k), ...lead, item, ...trail, ...rest.slice(k)] : insertItem([...rest, ...lead], item, lead[0]?.id ?? null);
    const next: KitchenFloorPlan = { ...plan, runs: { ...plan.runs, [run.id]: put } };
    // Only if it then stands there, nothing else lost for it.
    const after = kitchenFromPlan(next, room0).fills[run.id];
    const now = after?.spaces.find((p) => p.item.id === item.id);
    const stood = new Set([...fill.placed, ...fill.spaces].map((p) => p.item.id));
    if (now && Math.abs(now.at - at) < 2 && ![...stood].some((id) => after!.missing.some((m) => m.id === id))) plan = next;
  }
  return plan;
}
