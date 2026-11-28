/** « Place libre » : un vide rempli de 2, 3 ou 4 caissons égaux, les autres meubles où ils étaient. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { equalFill } from "../../frontend/src/features/kitchen-run-equal";
import { fillRun, isSpace, newItem, openRoom } from "../../frontend/src/features/kitchen-run-items";

const units = (list: [string, number][]) => list.reduce<KitchenRunItem[]>((items, [m, w]) => [...items, newItem(items, m, w)], []);
const plan = (A: KitchenRunItem[]): KitchenFloorPlan => ({ ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: "end" }, runs: { A } });
const heights = (p: KitchenFloorPlan) => ({ worktop: p.worktopHeight, wallBottom: kitchenSizes(p).wallBottom, wallTop: kitchenSizes(p).wallTop });
const g = (p: KitchenFloorPlan) => runGeometry(p, kitchenRuns(p)[0]!);
const fill = (p: KitchenFloorPlan, items: KitchenRunItem[]) => fillRun(g(p), items, heights(p));

describe("remplir un vide de caissons égaux", () => {
  it("le reste du mur en haut : 3 hauts égaux, côte à côte, de son début à sa fin", () => {
    const items = units([["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]]);
    const p = plan(items);
    const room = openRoom(fill(p, items), "wall")[0]!;
    const made = equalFill(p, g(p), items, heights(p), "wall", room, 3);
    if (typeof made === "string") throw new Error(made);
    const placed = fill(p, made.items).placed.filter((pl) => made.ids.includes(pl.item.id));
    const w = Math.floor(((room[1] - room[0]) / 3) * 10) / 10;
    expect(placed.map((pl) => [Math.round(pl.at), pl.item.width, pl.item.model])).toEqual([0, 1, 2].map((k) => [Math.round(room[0] + k * w), w, w <= 600 ? "wall-haut-1-porte" : "wall-haut-2-portes"]));
  });

  it("un « Espace libre » entre deux bas : 2 bas égaux à sa place, le bas d'après où il était", () => {
    const [first, space, last] = units([["base-bas-1-porte", 600], ["space", 1000], ["base-bas-1-porte", 600]]) as [KitchenRunItem, KitchenRunItem, KitchenRunItem];
    const items = [first, space, last];
    const p = plan(items);
    const made = equalFill(p, g(p), items, heights(p), "base", [600, 1600], 2);
    if (typeof made === "string") throw new Error(made);
    expect(made.items.some(isSpace)).toBe(false);
    const at = Object.fromEntries(fill(p, made.items).placed.map((pl) => [pl.item.id, [Math.round(pl.at), pl.item.width]]));
    expect(made.ids.map((id) => at[id])).toEqual([[600, 500], [1100, 500]]);
    expect(at[last.id]).toEqual([1600, 600]);
  });

  it("trop étroits ou trop larges : refusé, avec la raison", () => {
    const items = units([["base-bas-1-porte", 600]]);
    const p = plan(items);
    expect(equalFill(p, g(p), items, heights(p), "base", [600, 800], 4)).toMatch(/la largeur va de/);
  });
});
