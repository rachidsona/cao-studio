/** Aligner un meuble haut sur le meuble bas qui est sous lui, sur la bande d'un linéaire. */
import { describe, expect, it } from "vitest";
import { KITCHEN_PLAN, kitchenRuns, kitchenSizes, runGeometry } from "../../frontend/src/document/kitchen-plan-shapes";
import type { KitchenFloorPlan, KitchenRunItem } from "../../frontend/src/document/types";
import { alignedOver } from "../../frontend/src/features/kitchen-run-align";
import { fillRun, newItem } from "../../frontend/src/features/kitchen-run-items";

const build = (list: [string, number][], rest: "start" | "end" | "both" = "end") => {
  let items: KitchenRunItem[] = [];
  for (const [model, width] of list) items = [...items, newItem(items, model, width)];
  const p: KitchenFloorPlan = { ...KITCHEN_PLAN, model: "I", lengthA: 3600, rest: { A: rest }, runs: { A: items } };
  const g = runGeometry(p, kitchenRuns(p)[0]!);
  const s = kitchenSizes(p);
  const heights = { worktop: p.worktopHeight, wallBottom: s.wallBottom, wallTop: s.wallTop };
  const at = (list: readonly KitchenRunItem[], id: string) => fillRun(g, list, heights).placed.find((pl) => pl.item.id === id)!.at;
  return { items, g, heights, at };
};

describe("aligner un meuble haut sur le meuble du dessous", () => {
  it("met son bord gauche au-dessus de celui du meuble bas, par de la place gardée libre avant lui", () => {
    // Low: 1000 then 600 (at 1000). Up: one unit of 600, at the start of the wall.
    const { items, g, heights, at } = build([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]]);
    const wall = items[2]!;
    expect(at(items, wall.id)).toBe(0);
    // Its middle (300) is over the unit of 1000: already at its left edge.
    expect(alignedOver(g, items, heights, wall.id)).toMatch(/déjà aligné sur « Bas 2 portes »/);
    // Moved 800 along by a room before it: now over the unit of 600 mostly; aligned, it stands at 1000.
    const moved = [...items.slice(0, 2), { ...newItem(items, "space-wall", 800) }, wall];
    expect(at(moved, wall.id)).toBe(800);
    const made = alignedOver(g, moved, heights, wall.id);
    if (typeof made === "string") throw new Error(made);
    expect([made.on, made.side]).toEqual(["Bas 1 porte", "gauche"]);
    expect(at(made.items, wall.id)).toBeCloseTo(1000, 3);
    // The room before it is one, wider: no second one put beside the first.
    expect(made.items.filter((i) => i.model === "space-wall").map((i) => i.width)).toEqual([1000]);
  });

  it("vers la gauche : reprend de la place libre avant lui ; sans place à reprendre, s'aligne par le bord droit", () => {
    const { items, g, heights, at } = build([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["space-wall", 1200], ["wall-haut-1-porte", 600]]);
    const wall = items[3]!;
    expect(at(items, wall.id)).toBe(1200);
    // Over the unit of 600 (1000 to 1600): its left edge back to 1000, the room before it 200 less.
    const made = alignedOver(g, items, heights, wall.id);
    if (typeof made === "string") throw new Error(made);
    expect(at(made.items, wall.id)).toBeCloseTo(1000, 3);
    expect(made.items.find((i) => i.model === "space-wall")!.width).toBe(1000);

    // A wall unit of 800 after one of 400: mostly over the low unit of 1000, but it cannot go left (a wall unit
    // stands there): it is set over the next low unit, the one of 600, the first wall unit left where it is.
    const two = build([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 400], ["wall-haut-2-portes", 800]]);
    const wide = two.items[3]!;
    expect(two.at(two.items, wide.id)).toBe(400);
    const next = alignedOver(two.g, two.items, two.heights, wide.id);
    if (typeof next === "string") throw new Error(next);
    expect([next.on, next.side]).toEqual(["Bas 1 porte", "gauche"]);
    expect(two.at(next.items, wide.id)).toBeCloseTo(1000, 3);
    expect(two.at(next.items, two.items[2]!.id)).toBe(0);
  });

  it("le reste du mur au début ou partagé : il est aligné de même ; refusé pour un meuble bas ou sans place", () => {
    // At the start: the units stand against the end of the wall, the wall unit over the last low one already.
    const end = build([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]], "start");
    expect(alignedOver(end.g, end.items, end.heights, end.items[2]!.id)).toMatch(/déjà aligné sur « Bas 1 porte »/);
    // Shared: low units from 1000 to 2600, the wall unit in the middle (1500): set at 1000, over the unit of 1000.
    const { items, g, heights, at } = build([["base-bas-2-portes", 1000], ["base-bas-1-porte", 600], ["wall-haut-1-porte", 600]], "both");
    expect(at(items, items[2]!.id)).toBe(1500);
    const made = alignedOver(g, items, heights, items[2]!.id);
    if (typeof made === "string") throw new Error(made);
    expect([made.on, made.side]).toEqual(["Bas 2 portes", "gauche"]);
    expect(at(made.items, items[2]!.id)).toBeCloseTo(1000, 3);
    const under = fillRun(g, made.items, heights).placed.find((pl) => pl.entry.name === "Bas 2 portes")!;
    expect(under.at).toBe(1000);
    const one = build([["base-bas-2-portes", 1000], ["wall-haut-1-porte", 600]]);
    expect(alignedOver(one.g, one.items, one.heights, one.items[0]!.id)).toMatch(/Choisissez un meuble haut/);
    expect(alignedOver(one.g, [one.items[1]!], one.heights, one.items[1]!.id)).toMatch(/pas de meuble bas/);
  });
});
