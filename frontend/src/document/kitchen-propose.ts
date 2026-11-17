/**
 * « Proposer une cuisine » sur un plan de cuisine : ses linéaires remplis comme l'Implantation (features/kitchen-layout.ts)
 * remplit ses murs — modules de 600 d'abord, puis le plus grand qui tient, un fileur pour le reste, depuis l'angle ;
 * façades en alternance tiroirs et portes, tiroirs partout ou portes partout ; meubles hauts au-dessus ; l'évier sous la
 * fenêtre ou au premier tiers du mur A, le lave-vaisselle à côté, la plaque et son four plus loin avec la hotte au-dessus
 * (features/kitchen-appliances.ts), la colonne réfrigérateur et la colonne four au bout libre — chacun selon les réglages
 * du plan, comme ceux de l'Implantation. Le résultat se retouche ensuite meuble par meuble dans l'éditeur de linéaire. Pur.
 */
import { CATALOG } from "./kitchen-catalog";
import type { KitchenRoomInfo } from "./kitchen-plan-build";
import { FRONT, kitchenRuns, kitchenSizes, rowStretches, runAt, runGeometry, type KitchenRun, type RestSide } from "./kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "./types";
import { placeAppliances, type Slot } from "../features/kitchen-appliances";
import { splitRun } from "../features/kitchen-layout";
import { modelOf, newItem } from "../features/kitchen-run-items";

const COLUMN = 600;
const model = (name: string) => modelOf(CATALOG.find((e) => e.name === name)!);
const [DRAWERS, DOOR, DOORS, WALL_DOOR, WALL_DOORS] = ["Bas 3 tiroirs", "Bas 1 porte", "Bas 2 portes", "Haut 1 porte", "Haut 2 portes"].map(model) as [string, string, string, string, string];

/** The run of the columns: the first along the walls with a free end. */
const columnRun = (runs: KitchenRun[]) => runs.find((r) => r.wall && (r.left === "free" || r.right === "free"));

/** Its units are counted from its corner, as the Implantation does: from the right when only its right end is at a corner. */
const fromRight = (run: KitchenRun) => run.left === "free" && run.right !== "free";

/** The runs filled, and where what is left goes on each. */
export function proposeKitchen(p: KitchenFloorPlan, room?: KitchenRoomInfo): { runs: Record<string, KitchenRunItem[]>; rest: Record<string, RestSide> } {
  const s = kitchenSizes(p);
  const all = kitchenRuns(p);
  const columns = columnRun(all);
  const appliances = p.appliances !== false;
  // The columns at the free end: the fridge, then the oven when it is not under the hob.
  const tall = p.height >= s.wallTop && columns !== undefined ? [...(p.fridge !== false ? ["app-fridge"] : []), ...(appliances && p.ovenColumn ? ["app-oven-column"] : [])] : [];
  const fronts = p.fronts ?? "mixed";
  const runs: Record<string, KitchenRunItem[]> = {};
  const rest: Record<string, RestSide> = {};
  const slots: (Slot & { item: KitchenRunItem; mid: number })[] = [];
  const highs: { run: string; at: number; item: KitchenRunItem }[] = [];
  let fridge: [number, number] | undefined;
  for (const run of all) {
    const right = fromRight(run);
    rest[run.id] = run.id === "I" ? "both" : right ? "start" : "end";
    const g = runGeometry({ ...p, rest }, run, room?.[run.id]);
    // The column takes its place at the free end, before the units are counted.
    const column = tall.length > 0 && run === columns;
    const reach = column ? COLUMN * tall.length : 0;
    const freeEnd: "left" | "right" = run.right === "free" ? "right" : "left";
    const base: [number, number] = column ? (freeEnd === "right" ? [g.base[0], g.base[1] - reach] : [g.base[0] + reach, g.base[1]]) : g.base;
    const items: KitchenRunItem[] = [];
    const ordered = (list: KitchenRunItem[]) => (right ? list.reverse() : list);
    // Base units, stretch by stretch, from the corner.
    const stretches = rowStretches(g, base, 0, p.worktopHeight);
    const groups = (right ? [...stretches].reverse() : stretches).map(([a, b], k) => {
      const widths = splitRun(b - a).widths;
      let at = right ? b : a;
      return widths.map((w, i) => {
        // Drawers and doors in turn along the run (the Implantation's « mixed » fronts), or drawers, or doors, everywhere.
        const drawers = fronts === "drawers" || (fronts === "mixed" && items.length % 2 === 0);
        const item = newItem(items, drawers ? DRAWERS : w > 600 ? DOORS : DOOR, w);
        const from = right ? (at -= w) : (at += w) - w;
        const edge = (i === 0 && !(k === 0 && (right ? run.right : run.left) !== "free")) || (i === widths.length - 1 && !(k === stretches.length - 1 && (right ? run.left : run.right) !== "free"));
        const [x, y] = runAt(run, from + w / 2, run.back + s.cabinet + FRONT);
        slots.push({ run: run.id as Slot["run"], at: from, width: w, middle: [x, y], item, mid: from + w / 2, edge, window: g.spans.some((sp) => sp.bottom > 0 && Math.min(sp.to, from + w) - Math.max(sp.from, from) > w / 2) });
        items.push(item);
        return item;
      });
    });
    const baseItems = ordered(groups.flat());
    // Wall units over them, between the windows, up to the column.
    const wallItems: KitchenRunItem[] = [];
    if (g.wall && p.wallUnits !== false) {
      const wall: [number, number] = column ? (freeEnd === "right" ? [g.wall[0], g.wall[1] - reach] : [g.wall[0] + reach, g.wall[1]]) : g.wall;
      const high = rowStretches(g, wall, s.wallBottom, s.wallTop);
      for (const [a, b] of right ? [...high].reverse() : high) {
        let at = right ? b : a;
        for (const w of splitRun(b - a).widths) {
          const item = newItem([...items, ...wallItems], w > 600 ? WALL_DOORS : WALL_DOOR, w);
          highs.push({ run: run.id, at: right ? (at -= w) : (at += w) - w, item });
          wallItems.push(item);
        }
      }
    }
    // The fridge's front, for the work triangle: the last column, at the very end of the run.
    if (column && tall[0] === "app-fridge") fridge = runAt(run, freeEnd === "right" ? g.base[1] - COLUMN / 2 : g.base[0] + COLUMN / 2, run.back + s.cabinet + FRONT);
    const columnItems = column ? tall.reduce<KitchenRunItem[]>((list, m) => [...list, newItem([...items, ...wallItems, ...list], m, COLUMN)], []) : [];
    // The fridge at the very end, the oven column next to the units.
    const lows = freeEnd === "right" ? [...baseItems, ...[...columnItems].reverse()] : [...columnItems, ...baseItems];
    runs[run.id] = [...lows, ...ordered(wallItems)];
  }
  // The appliances, among the base slots in the Implantation's order.
  if (!appliances) return { runs, rest };
  const roles = placeAppliances(slots, fridge);
  const swap = (item: KitchenRunItem, to: string, width = item.width) => Object.assign(item, { model: to, width });
  if (roles.sink !== undefined) swap(slots[roles.sink]!.item, "app-sink");
  if (roles.dishwasher !== undefined) swap(slots[roles.dishwasher]!.item, "app-dishwasher");
  if (roles.hob !== undefined) {
    const hob = slots[roles.hob]!;
    swap(hob.item, p.ovenColumn ? "app-hob" : "app-hob-oven");
    const over = highs.find((h) => h.run === hob.run && hob.mid > h.at && hob.mid < h.at + h.item.width);
    if (over) swap(over.item, "app-hood");
  }
  return { runs, rest };
}
