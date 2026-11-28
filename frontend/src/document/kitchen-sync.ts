/**
 * Le Plan de cuisine et la cuisine 3D restent d'accord, dans les deux sens. Le plan refait la cuisine quand il change
 * (kitchen-floor.ts) ; et un meuble qu'il a fait, changé dans la 3D — sa largeur dans ses propriétés, une cote tapée,
 * Prolonger élément, Déformer… —, change le plan : la largeur, la profondeur (et la hauteur d'un haut ou d'une colonne)
 * de son meuble du linéaire ; la porte ou le côté d'un meuble d'angle. La cuisine est alors refaite avec, dans la même
 * annulation : les voisins se placent, les fileurs et le plan de travail suivent. Un meuble poussé le long de son mur
 * y reste : le linéaire garde la place libre qu'il laisse (kitchen-moves.ts). Ce que le plan ne garde pas (la
 * hauteur d'un bas, sous le plan de travail) revient comme il le fait. Pur.
 */
import { cornerLimits, withCorner, type CornerSetting } from "./kitchen-corners";
import { kitchenPlanIn, withKitchenBuilt } from "./kitchen-floor";
import { kitchenFromPlan } from "./kitchen-plan-build";
import { kitchenRoomInfo } from "./kitchen-plan-room";
import { islandMoved, itemsMoved, unitsMoved } from "./kitchen-moves";
import { caissonsMoved } from "./caisson-follow";
import { lostCaissons } from "./caisson-lost";
import { itemSlid } from "./kitchen-slide";
import { FRONT, kitchenPlanProblem, kitchenRuns, kitchenSizes, runGeometry } from "./kitchen-plan-shapes";
import { findFeature } from "./operations";
import { keptOf } from "./kitchen-keep";

const sameKeep = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
import type { CabinetFeature, CadDocument, FrontStyle, FrontsFeature, KitchenRunItem } from "./types";
import { applianceOf, fillRun, hasInside, itemEntry, rowOf, sizeLimits } from "../features/kitchen-run-items";
import { absorbed } from "../features/kitchen-run-absorb";

const NEAR = 0.05;
const differs = (a: number, b: number) => Math.abs(a - b) > NEAR;
const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, Math.round(v * 10) / 10));

/** The style of some fronts as the plan keeps it: only what is set, nothing for plain fronts. */
function frontStyle(f: FrontsFeature): FrontStyle | undefined {
  if (!f.style || f.style === "flat") return undefined;
  const keys = ["style", "frameWidth", "frameDepth", "pitch", "grooves", "glass", "profile"] as const;
  return Object.fromEntries(keys.filter((k) => f[k] !== undefined).map((k) => [k, f[k]])) as FrontStyle;
}

/** A style as the plan compares it: plain fronts, none. */
const frontStyleOf = (f: FrontStyle | undefined): FrontStyle | undefined => (f && f.style && f.style !== "flat" ? f : undefined);

/** `next` with every kitchen plan following the units of it changed in the 3D (none: `next` itself). */
export function syncKitchenPlans(prev: CadDocument, next: CadDocument): CadDocument {
  let doc = next;
  for (const sketch of next.features) {
    if (sketch.type !== "sketch" || !sketch.kitchenPlan?.made) continue;
    const plan = kitchenPlanIn(doc, sketch.id);
    if (!plan) continue;
    const room = kitchenRoomInfo(doc, plan);
    const { units, kept } = kitchenFromPlan(plan, room);
    const runs: Record<string, KitchenRunItem[]> = { ...plan.runs };
    const rest = { ...plan.rest };
    // A caisson furnished in a room kept free, pushed along its run in the 3D: its room goes there, the worktop and plinth with it.
    const pushed = caissonsMoved(prev, doc, plan, kept);
    // A caisson the plan lost the room of, moved in the 3D: the kitchen made again finds it its room where it now stands (caisson-lost.ts).
    const sought = lostCaissons(plan, room).some(({ item }) => JSON.stringify((findFeature(prev, item.furnished!) as { frame?: unknown } | undefined)?.frame) !== JSON.stringify((findFeature(doc, item.furnished!) as { frame?: unknown } | undefined)?.frame));
    let corners: CornerSetting = { corners: plan.corners, wallCorners: plan.wallCorners, cornerSizes: plan.cornerSizes };
    // The island moved (one of its units, or all the same way): it goes there whole, its units as they were on it —
    // unless the plan cannot have it there (against a wall, on another run).
    const there = islandMoved(doc, plan, units.filter((u) => u.run === "I"), prev);
    const island = there && !kitchenPlanProblem({ ...plan, ...there }) ? there : null;
    let changed = !!island || sought;
    for (const run of kitchenRuns(plan)) {
      const own = units.filter((u) => u.run === run.id);
      const cabinets = (plan.made?.[run.id] ?? []).map((id) => findFeature(doc, id)).filter((f): f is CabinetFeature => f?.type === "cabinet");
      if (own.length !== cabinets.length) continue;
      // Pushed along the run in the 3D: where it now stands, from where the plan puts it.
      const moved = island && run.id === "I" ? {} : unitsMoved(doc, plan, run, own, prev);
      cabinets.forEach((c, i) => {
        const u = own[i]!;
        // The side of its door, turned in the 3D (its menu): the plan keeps it.
        const fronts = doc.features.find((f) => f.type === "fronts" && f.cabinet === c.id);
        const side = fronts?.type === "fronts" && fronts.layout === "door" ? (fronts.side ?? "left") : null;
        const k0 = (runs[run.id] ?? []).findIndex((it) => it.id === u.item);
        // What its model gives (a lift-up door, glazed fronts): kept by the model, not written on the item.
        const model = k0 >= 0 ? itemEntry(runs[run.id]![k0]!) : undefined;
        if (side && k0 >= 0 && (runs[run.id]![k0]!.side ?? model?.side ?? "left") !== side) {
          runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? (side === "left" && !model?.side ? (({ side: _gone, ...rest }) => rest)(it) : { ...it, side }) : it));
          changed = true;
        }
        // Its fronts made handleless, or given their handles back (the Façades tool): the plan keeps it too.
        // (The kitchen's own handles, « Poignées » of the plan, are none of the unit's.)
        const grip = fronts?.type === "fronts" ? fronts.grip : undefined;
        const planGrip = plan.frontLook?.handles === "gorge" ? "gorge" : undefined;
        if (fronts && k0 >= 0 && (runs[run.id]![k0]!.grip ?? planGrip) !== grip) {
          runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? (grip && grip !== planGrip ? { ...it, grip } : (({ grip: _gone, ...rest }) => rest)(it)) : it));
          changed = true;
        }
        // Its fronts' style (the Façades tool, the menu of a door): the plan keeps it.
        const facade = fronts?.type === "fronts" ? frontStyle(fronts) : undefined;
        const planStyle = model?.facade ?? plan.frontLook?.style;
        if (fronts && k0 >= 0 && JSON.stringify(frontStyleOf(runs[run.id]![k0]!.facade ?? planStyle)) !== JSON.stringify(facade)) {
          const same = JSON.stringify(frontStyleOf(planStyle)) === JSON.stringify(facade);
          runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? (!same ? { ...it, facade: facade ?? { style: "flat" as const } } : (({ facade: _gone, ...rest }) => rest)(it)) : it));
          changed = true;
        }
        // A side opened for a door in the Caisson tool (« Porte de côté »): the plan keeps it and makes its door.
        if (k0 >= 0 && runs[run.id]![k0]!.sideDoor !== c.open) {
          runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? (c.open ? { ...it, sideDoor: c.open } : (({ sideDoor: _gone, ...rest }) => rest)(it)) : it));
          changed = true;
        }
        // Its front rail turned in the Caisson tool: the plan keeps it.
        if (k0 >= 0 && c.top === "rails" && runs[run.id]![k0]!.railFront !== c.railFront) {
          runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? (c.railFront ? { ...it, railFront: c.railFront } : (({ railFront: _gone, ...rest }) => rest)(it)) : it));
          changed = true;
        }
        if (k0 >= 0) {
          const item = runs[run.id]![k0]!;
          // Its shelves and upright boards (the Caisson tool), its handles taken off: on its item, as its run sets them.
          const e = itemEntry(item);
          const inside = hasInside(item) && e.layout !== "drawers" && (c.shelves !== e.shelves || (c.dividers ?? 0) !== (e.dividers ?? 0)) ? { shelves: c.shelves, dividers: c.dividers ?? 0 } : null;
          const handles = fronts?.type === "fronts" && plan.frontLook?.handles !== "none" && (fronts.handles === false) !== (item.handles === false) ? fronts.handles === false : null;
          // The rest changed by hand (its caisson's and fronts' settings, its pieces' materials, its name): kept by it.
          const keep = keptOf(doc, plan, u, c, fronts?.type === "fronts" && fronts.name === `Façades ${c.name}` ? fronts : undefined);
          if (inside || handles !== null || !sameKeep(keep, item.keep)) {
            const { keep: _old, handles: _h, ...rest } = item;
            const next = { ...rest, ...(inside ?? {}), ...((handles ?? item.handles === false) ? { handles: false as const } : {}), ...(keep ? { keep } : {}) };
            runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? next : it));
            changed = true;
          }
        }
        // Its fronts' layout and drawers (the Façades tool): the plan keeps them, as « Façades et intérieur » of its run.
        if (fronts?.type === "fronts" && k0 >= 0 && hasInside(runs[run.id]![k0]!)) {
          const e = itemEntry(runs[run.id]![k0]!);
          const drawers = fronts.layout === "drawers";
          if (e.layout !== fronts.layout || (drawers && (e.drawers ?? 3) !== fronts.drawers) || (!drawers && ((e.topDrawer ?? 0) !== (fronts.topDrawer ?? 0) || (e.innerDrawers ?? 0) !== (fronts.innerDrawers ?? 0)))) {
            const inside = { layout: fronts.layout, ...(drawers ? { drawers: fronts.drawers } : { topDrawer: fronts.topDrawer ?? 0, innerDrawers: fronts.innerDrawers ?? 0 }) };
            runs[run.id] = runs[run.id]!.map((it, j) => (j === k0 ? { ...it, ...inside } : it));
            changed = true;
          }
        }
        // A corner unit's door (Façades, its menu): turned or restyled, the plan keeps it.
        // A folding door's leaf: its style only, the two leaves sharing it.
        const leaf = u.cornerEdit?.key.endsWith("rm");
        if (u.cornerEdit && u.span && fronts?.type === "fronts" && fronts.layout === "door" && ((!leaf && (fronts.side ?? "left") !== (u.side ?? "left")) || JSON.stringify(frontStyle(fronts)) !== JSON.stringify(frontStyleOf(u.facade)))) {
          const look = { ...frontStyle(fronts), ...(leaf ? {} : { side: fronts.side === "right" ? ("right" as const) : ("left" as const) }) };
          corners = withCorner(corners, u.cornerEdit.joint, u.cornerEdit.key.startsWith("wall") ? { wallLook: look } : { look });
          changed = true;
        }
        // Only a change made since: the plan's own rebuilds are what it builds.
        const before = findFeature(prev, c.id);
        if (before?.type === "cabinet" && !differs(before.width, c.width) && !differs(before.depth, c.depth) && !differs(before.height, c.height)) return;
        if (!differs(c.width, u.width) && !differs(c.depth, u.depth) && !differs(c.height, u.height)) return;
        if (u.cornerEdit) {
          const { joint, key, less } = u.cornerEdit;
          if (!differs(c.width, u.width)) return;
          corners = withCorner(corners, joint, { [key]: clamp(c.width - less, cornerLimits(plan)[key]) });
          changed = true;
          return;
        }
        const items = runs[run.id] ?? [];
        const k = items.findIndex((it) => it.id === u.item);
        if (k < 0) return;
        const item = items[k]!;
        const limits = sizeLimits(plan, itemEntry(item));
        // A fridge's surround, its caisson changed: the surround follows it as one — its sides round it (wider by them),
        // as deep, up to its top (the fridge under it as it was).
        if (applianceOf(item)?.role === "fridge-surround") {
          const next: KitchenRunItem = { ...item };
          if (differs(c.width, u.width)) next.width = clamp(c.width + 2 * FRONT, limits.width);
          if (differs(c.depth, u.depth)) next.depth = clamp(c.depth, limits.depth);
          if (differs(c.height, u.height)) next.height = clamp(c.origin[2] + c.height, limits.height!);
          runs[run.id] = items.map((it, j) => (j === k ? next : it));
          changed = true;
          return;
        }
        const next: KitchenRunItem = { ...item };
        if (differs(c.width, u.width)) next.width = clamp(c.width, limits.width);
        if (differs(c.depth, u.depth)) next.depth = clamp(c.depth, limits.depth);
        if (limits.height && differs(c.height, u.height)) next.height = clamp(c.height, limits.height);
        // A wall or tall unit's height and any depth are its own; a base unit keeps the worktop's height.
        if (rowOf(itemEntry(item)) === "base" && itemEntry(item).kind !== "tall") delete next.height;
        runs[run.id] = items.map((it, j) => (j === k ? next : it));
        changed = true;
      });
      // A unit made wider or narrower in the 3D: the room kept free after it takes the difference, what stands after it stays (features/kitchen-run-absorb.ts).
      const sizes = kitchenSizes(plan), geometry = runGeometry(plan, run, room?.[run.id]);
      if (changed && runs[run.id] && plan.runs?.[run.id]) runs[run.id] = absorbed(plan.runs[run.id]!, runs[run.id]!, (list) => fillRun(geometry, list, { worktop: plan.worktopHeight, wallBottom: sizes.wallBottom, wallTop: sizes.wallTop }));
      for (const [id, by] of Object.entries(pushed)) {
        if (!(runs[run.id] ?? []).some((i) => i.id === id)) continue;
        // Moved off its room: the kitchen is made again (it goes back to it), its room gone along the wall by what it went.
        changed = true;
        if (!by) continue;
        const s = kitchenSizes(plan);
        const slid = itemSlid({ ...plan, runs, rest }, run, room?.[run.id], runs[run.id]!, { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop }, id, by);
        if (typeof slid === "string") continue;
        runs[run.id] = slid.items;
        rest[run.id] = slid.rest;
        changed = true;
      }
      if (Object.keys(moved).length) {
        const s = kitchenSizes(plan);
        const kept = itemsMoved(runGeometry(plan, run, room?.[run.id]), runs[run.id] ?? [], { worktop: plan.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop }, moved);
        if (kept) {
          runs[run.id] = kept;
          changed = true;
        }
      }
    }
    if (!changed) continue;
    const made = withKitchenBuilt(doc, sketch.id, { runs, rest, ...corners, ...island });
    if (typeof made !== "string") doc = made.doc;
  }
  return doc;
}
